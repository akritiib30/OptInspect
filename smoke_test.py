"""End-to-end test of OptiInspect's server: accounts, permissions, inspection, review, records, files, and the labs.

Run:  python smoke_test.py
Needs the real bottle product (python build_product.py bottle bottle). Everything it writes goes to a
temporary folder, including its test accounts, and is deleted afterwards.
"""
import io
import json
import os
import shutil
import sys
import tempfile
import time

import cv2
import numpy as np

import agent
import auth
import labs
import server
from logger import verify

TMP = tempfile.mkdtemp()
server.STORE = os.path.join(TMP, "store")          # keep test output out of the real folders
server.LOGS = os.path.join(TMP, "logs")
auth.DATA_DIR = os.path.join(TMP, "userdata")
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


class Sess:
    """One browser: its own cookies and its own CSRF token."""

    def __init__(self):
        self.c = server.app.test_client()
        self.csrf = self.me()["csrf"]

    def me(self):
        d = self.c.get("/api/auth/me").get_json()
        self.csrf = d["csrf"]
        return d

    def req(self, method, url, **kw):
        h = kw.pop("headers", {})
        h["X-CSRF-Token"] = self.csrf or ""
        return self.c.open(url, method=method, headers=h, **kw)

    def get(self, url, **kw): return self.req("GET", url, **kw)
    def post(self, url, **kw): return self.req("POST", url, **kw)
    def patch(self, url, **kw): return self.req("PATCH", url, **kw)

    def signin(self, email, password, remember=False):
        r = self.post("/api/auth/signin", json={"email": email, "password": password, "remember": remember})
        if r.status_code == 200:
            self.csrf = r.get_json()["csrf"]
        return r


def png(img):
    return io.BytesIO(cv2.imencode(".png", img)[1].tobytes())


try:
    # ================= accounts and permissions =================
    anon = Sess()
    me = anon.me()
    check("fresh install: no user, first-run flag set", me["user"] is None and me["first_user"] is True)
    check("signed-out API call is refused", anon.get("/api/stats").status_code == 401)
    check("public health check works signed out", anon.get("/api/health").get_json()["ok"] is True)
    no_csrf = anon.c.post("/api/auth/signin", json={"email": "a@b.co", "password": "x"})
    check("change without CSRF token is refused", no_csrf.status_code == 403)

    bad = anon.post("/api/auth/signup", json={"name": "A", "email": "not-an-email", "password": "Strong-pass-1"})
    check("sign-up rejects a bad email, naming the field", bad.status_code == 400 and bad.get_json().get("field") == "email")
    bad = anon.post("/api/auth/signup", json={"name": "A", "email": "a@example.com", "password": "short"})
    check("sign-up rejects a short password", bad.status_code == 400 and bad.get_json().get("field") == "password")
    bad = anon.post("/api/auth/signup", json={"name": "A", "email": "a@example.com", "password": "password123"})
    check("sign-up rejects a common password", bad.status_code == 400)

    admin = Sess()
    r = admin.post("/api/auth/signup", json={"name": "Ada Admin", "email": "ADA@example.com", "password": "Correct-horse-9"})
    admin.csrf = r.get_json()["csrf"]
    check("first account becomes administrator", r.status_code == 201 and r.get_json()["user"]["role"] == "admin")
    check("signed in after sign-up", admin.me()["user"]["email"] == "ada@example.com")
    check("password is stored hashed, not in clear", "Correct-horse-9" not in open(auth.users_path(), encoding="utf-8").read())

    dup = Sess().post("/api/auth/signup", json={"name": "X", "email": "ada@example.com", "password": "Another-pass-1"})
    check("duplicate email is refused", dup.status_code == 400)

    second = Sess()
    r = second.post("/api/auth/signup", json={"name": "Rex Reviewer", "email": "rex@example.com", "password": "Reviewer-pass-1"})
    second.csrf = r.get_json()["csrf"]
    check("later sign-ups become reviewers", r.get_json()["user"]["role"] == "reviewer")

    wrong = Sess().signin("ada@example.com", "wrong-password")
    check("wrong password -> same generic message", wrong.status_code == 401 and "incorrect" in wrong.get_json()["error"])
    unknown = Sess().signin("nobody@example.com", "whatever-12")
    check("unknown email -> same message (no account hints)", unknown.status_code == 401 and unknown.get_json()["error"] == wrong.get_json()["error"])
    victim = Sess()
    codes = [victim.signin("ghost@example.com", "bad-password-1").status_code for _ in range(6)]
    check("5 failures lock sign-in for a minute", codes[:5] == [401] * 5 and codes[5] == 429, str(codes))
    auth._fails.clear()

    # ---- people (admin) ----
    users = admin.get("/api/users").get_json()
    check("admin can list people", len(users["users"]) == 2 and "pw" not in json.dumps(users))
    check("reviewer cannot list people", second.get("/api/users").status_code == 403)
    r = admin.post("/api/users", json={"name": "Vera Viewer", "email": "vera@example.com", "role": "viewer"})
    temp = r.get_json()["temporary_password"]
    check("admin creates a viewer with a temporary password", r.status_code == 201 and r.get_json()["user"]["must_change_password"])
    viewer = Sess()
    check("viewer signs in with the temporary password", viewer.signin("vera@example.com", temp).status_code == 200)
    check("viewer is told to change the password", viewer.me()["user"]["must_change_password"] is True)
    r = viewer.post("/api/auth/password", json={"current": temp, "new": "Viewer-new-pass-1"})
    check("viewer changes the password", r.status_code == 200 and viewer.me()["user"]["must_change_password"] is False)
    vera_id = r.get_json()["user"]["id"]

    check("last administrator cannot be demoted",
          admin.patch(f"/api/users/{users['users'][0]['id']}", json={"role": "viewer"}).status_code == 400)
    rex_id = next(u["id"] for u in users["users"] if u["email"] == "rex@example.com")
    check("saving the same role does not sign anyone out",
          admin.patch(f"/api/users/{rex_id}", json={"role": "reviewer"}).status_code == 200 and second.get("/api/stats").status_code == 200)
    check("a real role change applies at once (the person is signed out)",
          admin.patch(f"/api/users/{vera_id}", json={"role": "reviewer"}).status_code == 200 and viewer.get("/api/stats").status_code == 401)
    viewer.signin("vera@example.com", "Viewer-new-pass-1")
    check("after signing in again the new role works", viewer.me()["user"]["role"] == "reviewer")
    admin.patch(f"/api/users/{vera_id}", json={"role": "viewer"})
    viewer.signin("vera@example.com", "Viewer-new-pass-1")
    check("settings can close sign-ups", admin.patch("/api/settings", json={"signup_open": False}).get_json()["signup_open"] is False)
    late = Sess().post("/api/auth/signup", json={"name": "Late", "email": "late@example.com", "password": "Late-pass-12345"})
    check("closed sign-ups refuse newcomers", late.status_code == 403)
    admin.patch("/api/settings", json={"signup_open": True})

    # ================= inspecting =================
    check("viewer cannot inspect", viewer.post("/api/inspect-sample/bottle/good_0").status_code == 403)
    check("viewer can read statistics", viewer.get("/api/stats").status_code == 200)

    r = second.post("/api/inspect-sample/bottle/good_0")
    good = r.get_json()
    check("normal bottle -> OK, attributed to the reviewer", r.status_code == 200 and good["verdict"] == "OK" and good["created_by"]["name"] == "Rex Reviewer")
    check("analysis time is recorded", isinstance(good["duration_ms"], int) and good["duration_ms"] > 0)
    check("log is intact", verify(os.path.join(server.LOGS, f"{good['inspection_id']}.jsonl")))
    started = admin.get(f"/api/log/{good['inspection_id']}").get_json()["events"][0]
    check("log records who started the inspection", started["event"] == "inspection_started" and started["who"] == "Rex Reviewer")

    r = second.post("/api/inspect-sample/bottle/broken_large_0")
    big = r.get_json()
    check("defective bottle -> DEFECT with boxes", r.get_json()["verdict"] == "DEFECT" and len(big["defects"][0]["box"]) == 4)

    r = second.post("/api/inspect-sample/bottle/broken_small_0")
    small = r.get_json()
    iid = small["inspection_id"]
    check("uncertain defect -> NEEDS_REVIEW", small["verdict"] == "NEEDS_REVIEW")
    idx = next(d["defect"] for d in small["defects"] if d["status"] == "NEEDS_REVIEW")
    check("review queue lists it", any(x["inspection_id"] == iid for x in admin.get("/api/review-queue").get_json()))
    check("viewer cannot decide", viewer.post(f"/api/review/{iid}", json={"defect": idx, "decision": "defect"}).status_code == 403)
    check("bad decision rejected", second.post(f"/api/review/{iid}", json={"defect": idx, "decision": "hack"}).status_code == 400)
    ok = second.post(f"/api/review/{iid}", json={"defect": idx, "decision": "defect", "note": "test"})
    decided = ok.get_json()
    check("reviewer decides -> DEFECT, with their name on it",
          ok.status_code == 200 and decided["verdict"] == "DEFECT" and decided["defects"][idx]["reviewed_by"]["name"] == "Rex Reviewer")
    check("second decision on the same defect refused", second.post(f"/api/review/{iid}", json={"defect": idx, "decision": "ok"}).status_code == 400)

    log = admin.get(f"/api/log/{iid}").get_json()
    check("audit log intact and records the person", log["intact"] and any(e["who"] == "Rex Reviewer" and e["event"] == "human_review" for e in log["events"]))
    path = os.path.join(server.LOGS, f"{iid}.jsonl")
    bad_copy = os.path.join(TMP, "tampered.jsonl")
    with open(path, encoding="utf-8") as f, open(bad_copy, "w", encoding="utf-8") as g:
        g.write(f.read().replace('"decision": "defect"', '"decision": "ok"'))
    shutil.copy(path + ".head", bad_copy + ".head")
    check("edited LAST log entry is detected", verify(path) and not verify(bad_copy))
    cut = os.path.join(TMP, "truncated.jsonl")
    with open(path, encoding="utf-8") as f, open(cut, "w", encoding="utf-8") as g:
        g.writelines(f.readlines()[:-2])
    shutil.copy(path + ".head", cut + ".head")
    check("deleted final entries are detected", not verify(cut))

    # ---- wrong inputs ----
    mask = cv2.imread("bottle/ground_truth/broken_large/000_mask.png")

    def upload(img, filename="photo.png", product="bottle", who=second):
        return who.post("/api/inspect", data={"image": (png(img), filename), "product": product}, content_type="multipart/form-data")

    for label, img in [("answer-mask image", mask), ("blank white image", np.full((256, 256, 3), 255, np.uint8)),
                       ("random noise", np.random.default_rng(1).integers(0, 255, (256, 256, 3), dtype=np.uint8))]:
        r = upload(img)
        check(f"invalid input ({label}) -> INVALID_PHOTO", r.status_code == 200 and r.get_json()["verdict"] == "INVALID_PHOTO", r.get_json().get("verdict"))
    r = upload(cv2.imread("bottle/test/broken_large/005.png"), "Bottle #5 (front).png")
    body = r.get_json()
    check("real 900px upload is inspected, keeping a safe name", r.status_code == 200 and body["resized"] and body["verdict"] == "DEFECT"
          and body["photo_name"] == "Bottle_5_front", body.get("photo_name"))
    check("non-image upload -> 400", second.post("/api/inspect", data={"image": (io.BytesIO(b"hello"), "a.png")}, content_type="multipart/form-data").status_code == 400)
    check("missing file -> 400", second.post("/api/inspect").status_code == 400)
    check("unknown product -> 400", upload(mask, product="nope").status_code == 400)
    check("path traversal in id blocked", second.get("/api/result/..%5C..%5Cserver.py").status_code in (400, 404))
    check("unknown sample -> 404", second.post("/api/inspect-sample/bottle/..%5Cx").status_code == 404)

    # ================= images, numbers and records =================
    for kind in ("test", "reference", "diff"):
        r = viewer.get(f"/api/view/{iid}/{kind}")
        check(f"'{kind}' view image is served", r.status_code == 200 and r.content_type == "image/jpeg")
    check("images need sign-in", anon.get(f"/api/view/{iid}/test").status_code == 401)
    check("unknown view -> 404", viewer.get(f"/api/view/{iid}/secret").status_code == 404)
    thumb = viewer.get("/api/product-image/bottle/sample/good_0?size=120")
    check("thumbnails are shrunk", thumb.status_code == 200 and len(thumb.data) < 20000, str(len(thumb.data)))
    check("product image path traversal blocked", viewer.get("/api/product-image/bottle/sample/..%5Cx").status_code == 404)

    stats = viewer.get("/api/stats").get_json()
    check("statistics add up", stats["inspections"] >= 6 and stats["defects"] >= 1 and len(stats["series"]) == 14)
    check("statistics include charts data", len(stats["scores"]["first"]) == 10 and "tools" in stats and stats["duration"]["n"] >= 1)
    check("reviewer workload is counted", stats["reviewers"].get("Rex Reviewer") == 1, str(stats["reviewers"]))
    cfg = viewer.get("/api/config").get_json()
    check("config exposes thresholds and engine versions", cfg["confirm"] == 0.7 and cfg["engine"]["opencv"].startswith("5."), cfg["engine"]["opencv"])

    act = viewer.get("/api/activity?limit=5").get_json()
    check("live activity feed returns recent events", 1 <= len(act) <= 5 and all("photo_name" in e for e in act))
    ev = viewer.get("/api/audit/events?limit=10&event=human_review").get_json()
    check("audit events can be filtered", ev["total"] == 1 and "human_review" in ev["kinds"] and "Rex Reviewer" in ev["whos"])
    ver = viewer.get("/api/audit/verify").get_json()
    check("verify-all confirms every log", ver["intact"] and ver["checked"] == stats["inspections"] and ver["entries"] > 20, str(ver["checked"]))

    # ---- comments ----
    check("viewer cannot comment", viewer.post(f"/api/inspections/{iid}/comments", json={"text": "hi"}).status_code == 403)
    check("empty comment refused", second.post(f"/api/inspections/{iid}/comments", json={"text": "   "}).status_code == 400)
    r = second.post(f"/api/inspections/{iid}/comments", json={"text": "Chip on the rim, checked by hand."})
    check("reviewer comments", r.status_code == 201 and r.get_json()["author"] == "Rex Reviewer")
    check("comments are listed and logged", len(viewer.get(f"/api/inspections/{iid}/comments").get_json()) == 1
          and any(e["event"] == "comment_added" for e in admin.get(f"/api/log/{iid}").get_json()["events"]))
    check("log still intact after a comment", admin.get(f"/api/log/{iid}").get_json()["intact"])

    # ---- export (admin only) ----
    check("reviewer cannot export", second.get("/api/export").status_code == 403)
    z = admin.get("/api/export")
    check("administrator exports a zip", z.status_code == 200 and z.data[:2] == b"PK")

    # ---- products ----
    check("reviewer cannot create products", second.post("/api/products", data={"name": "x1"}, content_type="multipart/form-data").status_code == 403)
    check("product needs 50 photos", admin.post("/api/products", data={"name": "thing", "images": [(png(mask), "a.png")]}, content_type="multipart/form-data").status_code == 400)
    check("bad product name refused", admin.post("/api/products", data={"name": "../x"}, content_type="multipart/form-data").status_code == 400)
    train = sorted(os.listdir("bottle/train/good"))[:56]
    made = os.path.join(server.BASE, "products", "smoketest")
    try:
        data = {"name": "smoketest", "images": [(png(cv2.imread(f"bottle/train/good/{n}")), n) for n in train]}
        r = admin.post("/api/products", data=data, content_type="multipart/form-data")
        body = r.get_json()
        check("administrator builds a product from 56 photos", r.status_code == 201 and body["calibrated"] and body["normal"] > 0, str(body.get("normal")))
        check("new product appears in the list", any(p["name"] == "smoketest" for p in viewer.get("/api/products").get_json()))
        check("duplicate product name refused", admin.post("/api/products", data={"name": "smoketest", "images": []}, content_type="multipart/form-data").status_code == 400)
        r2 = second.post("/api/inspect", data={"image": (png(cv2.imread("bottle/test/good/003.png")), "g.png"), "product": "smoketest"}, content_type="multipart/form-data")
        check("the new product can inspect photos", r2.status_code == 200 and r2.get_json()["verdict"] in ("OK", "NEEDS_REVIEW"), r2.get_json().get("verdict"))
    finally:
        server.PRODUCTS.pop("smoketest", None)
        shutil.rmtree(made, ignore_errors=True)

    # ================= labs: stress test =================
    n_before = len(viewer.get("/api/inspections").get_json())
    check("labs need sign-in", anon.post("/api/stress/sweep", json={"product": "bottle"}).status_code == 401)
    base = cv2.imread("products/bottle/samples/good_0.png")
    chip = labs.paint(base, labs.paint_mask(*base.shape[:2], 0.55 * 900, 0.3 * 900, 0.05 * 900, "stain"), 0.7, 255)
    r = viewer.post("/api/stress/try", data={"product": "bottle", "image": (png(chip), "painted.png")}, content_type="multipart/form-data")
    body = r.get_json()
    check("stress try: a strong bright mark is caught (any role may try)", r.status_code == 200 and body["verdict"] == "DEFECT"
          and body["defects"][0]["status"] == "CONFIRMED" and len(body["defects"][0]["history"]) >= 1, str(body.get("verdict")))
    r = viewer.post("/api/stress/try", data={"product": "bottle", "image": (png(base), "clean.png")}, content_type="multipart/form-data")
    check("stress try: the unpainted photo is not flagged", r.status_code == 200 and r.get_json()["verdict"] == "OK")
    check("stress try: an unreadable file is refused", viewer.post("/api/stress/try", data={"product": "bottle", "image": (io.BytesIO(b"nope"), "x.png")}, content_type="multipart/form-data").status_code == 400)
    check("stress try: an unknown product is refused", viewer.post("/api/stress/try", data={"product": "nope", "image": (png(base), "x.png")}, content_type="multipart/form-data").status_code == 400)
    sweep = viewer.post("/api/stress/sweep", json={"product": "bottle", "base": "good_0", "shape": "stain", "size": 0.04, "x": 0.62, "y": 0.4}).get_json()
    lv = sweep["levels"]
    check("sweep: eight strengths, clean baseline", len(lv) == 8 and [l["level"] for l in lv] == sorted(l["level"] for l in lv) and sweep["baseline"]["defects"] == 0)
    check("sweep: the faintest mark is not confirmed and the strongest is", lv[0]["status"] != "CONFIRMED" and lv[-1]["status"] == "CONFIRMED", str([l["status"] for l in lv]))
    check("sweep: some marks are settled only after the agent looks again", any(l["checks"] for l in lv))
    check("sweep: bad inputs are refused", all(viewer.post("/api/stress/sweep", json=j).status_code == 400 for j in (
        {"product": "bottle", "base": "../server", "shape": "stain"}, {"product": "bottle", "base": "good_0", "shape": "blob"},
        {"product": "bottle", "base": "good_0", "size": "huge"}, {"product": "nope"})))
    check("stress test saves nothing to the record", len(viewer.get("/api/inspections").get_json()) == n_before)
    check("stress test leaves no files behind", not os.listdir(labs.TMP))
    r = second.post("/api/inspect", data={"image": (png(chip), "painted_defect.png"), "product": "bottle", "source": "stress_test"}, content_type="multipart/form-data")
    check("saving a painted photo marks it as a stress test", r.status_code == 200 and r.get_json()["source"] == "stress_test")
    r = second.post("/api/inspect", data={"image": (png(base), "g.png"), "product": "bottle", "source": "<script>"}, content_type="multipart/form-data")
    check("an unknown source is ignored", r.status_code == 200 and r.get_json()["source"] is None)
    check("the list shows where a photo came from", any(i["source"] == "stress_test" for i in viewer.get("/api/inspections").get_json()))

    # ================= labs: challenge =================
    st = viewer.get("/api/challenge/status").get_json()
    check("challenge: available when the test photos are present", st["available"] and st["photos"]["bottle"] == 83)
    start = second.post("/api/challenge/start", json={"rounds": 6})
    tok = start.get_json()["token"]
    check("challenge: a game of six rounds starts", start.status_code == 200 and start.get_json()["rounds"] == 6)
    photo = second.get(f"/api/challenge/{tok}/0/photo")
    check("challenge: the photo is served and never cached", photo.status_code == 200 and photo.content_type == "image/jpeg" and photo.headers["Cache-Control"] == "no-store")
    check("challenge: another person cannot reach someone else's game", viewer.get(f"/api/challenge/{tok}/0/photo").status_code == 404)
    check("challenge: a made-up round is 404", second.get(f"/api/challenge/{tok}/99/photo").status_code == 404)
    check("challenge: an invalid answer is refused", second.post(f"/api/challenge/{tok}/0/answer", json={"verdict": "maybe"}).status_code == 400)
    check("challenge: cannot finish early", second.post(f"/api/challenge/{tok}/finish").status_code == 400)
    reveals = []
    for n in range(6):
        reveals.append(second.post(f"/api/challenge/{tok}/{n}/answer", json={"verdict": "ok", "point": None, "ms": 3000}).get_json())
    check("challenge: the truth is given after answering", all("defective" in r and "outline" in r for r in reveals))
    check("challenge: three of the six photos were defective", sum(r["defective"] for r in reveals) == 3)
    check("challenge: saying 'fine' is right exactly when the bottle was good", all(r["human"]["correct"] == (not r["defective"]) for r in reveals))
    check("challenge: the agent answers, or asks for help instead of guessing",
          all(r["agent"]["verdict"] in ("defect", "ok", "unsure") and (r["agent"]["correct"] is None) == (r["agent"]["verdict"] == "unsure") for r in reveals))
    check("challenge: points follow the rules", all(r["human"]["points"] == (1 if r["human"]["correct"] else 0) for r in reveals)
          and all(0 <= r["agent"]["points"] <= (2 if r["defective"] else 1) for r in reveals))
    check("challenge: the real defect outline is returned for defective photos", all(bool(r["outline"]) == r["defective"] for r in reveals)
          and all(0 <= x <= 1 and 0 <= y <= 1 for r in reveals for poly in r["outline"] for x, y in poly))
    check("challenge: a round cannot be answered twice", second.post(f"/api/challenge/{tok}/0/answer", json={"verdict": "ok"}).status_code == 400)
    fin = second.post(f"/api/challenge/{tok}/finish")
    summ = fin.get_json()
    check("challenge: the summary adds up", fin.status_code == 200 and summ["answered"] == 6 and summ["human_points"] == sum(r["human"]["points"] for r in reveals)
          and summ["agent_points"] == sum(r["agent"]["points"] for r in reveals) and summ["max_points"] == 9)
    second.post(f"/api/challenge/{tok}/finish")
    board = second.get("/api/challenge/leaderboard").get_json()
    check("challenge: the game is on the leaderboard once, under the person's name", board["games"] == 1 and board["top"][0]["name"] == "Rex Reviewer" and board["top"][0]["you"]
          and board["mine"]["games"] == 1 and board["mine"]["rounds"] == 6)
    check("challenge: scores are kept in the data folder, not in the project", os.path.dirname(labs._scores_path()) == auth.DATA_DIR)
    polys = labs._mask_polygons(cv2.imread("bottle/ground_truth/broken_large/000_mask.png", cv2.IMREAD_GRAYSCALE))
    check("challenge: a mask turns into outlines inside the photo", polys and all(0 <= v <= 1 for poly in polys for pt in poly for v in pt))

    # ================= labs: tolerance lab =================
    photos = labs._test_photos(labs._dataset_root("bottle"))
    prod = server.PRODUCTS["bottle"]
    keep = (agent.CONFIRM, agent.DISMISS)
    try:
        for dismiss, confirm in ((0.15, 0.70), (0.10, 0.50), (0.22, 0.85)):
            agent.DISMISS, agent.CONFIRM = dismiss, confirm        # the real agent at these lines ...
            bad = []
            for ph in photos[::6]:
                img = labs._to_work(cv2.imread(ph["path"]), prod["ref"])
                real = agent.inspect(img, prod["ref"], "t", normal=prod["normal"], log_dir=labs.TMP, out_dir=labs.TMP)["verdict"]
                if labs.simulate(labs.lab_record(img, prod["ref"], prod["normal"]), dismiss, confirm) != real:   # ... against the replay
                    bad.append(ph["name"])
            check(f"lab replay matches the real agent at lines {dismiss} and {confirm} ({len(photos[::6])} photos)", not bad, str(bad))
    finally:
        agent.CONFIRM, agent.DISMISS = keep
    for f in os.listdir(labs.TMP):                                 # the agent runs above wrote logs here
        os.remove(os.path.join(labs.TMP, f))
    d = {"status": "computing"}
    for _ in range(240):
        d = viewer.get("/api/lab/data").get_json()
        if d["status"] != "computing":
            break
        time.sleep(0.5)
    check("lab: every real test photo is replayed", d["status"] == "ready" and len(d["photos"]) == 83 and d["config"]["confirm"] == 0.7)
    got = {}
    for ph in d["photos"]:
        v = labs.simulate(ph["defects"], d["config"]["dismiss"], d["config"]["confirm"])
        got[(ph["defective"], v)] = got.get((ph["defective"], v), 0) + 1
    check("lab: at the agent's own lines it reproduces the measured results (57 confirmed, 3 to a person, 3 missed; 19 good passed, 1 to a person)",
          got == {(True, "DEFECT"): 57, (True, "NEEDS_REVIEW"): 3, (True, "OK"): 3, (False, "OK"): 19, (False, "NEEDS_REVIEW"): 1}, str(got))
    check("lab: the replay is kept for next time", os.path.exists(labs._lab_cache_path("bottle")))
    thumb = viewer.get("/api/lab/photo/bottle/0?size=200")
    check("lab: photo thumbnails are served", thumb.status_code == 200 and thumb.content_type == "image/jpeg" and len(thumb.data) < 40000)
    check("lab: a made-up photo or product is 404", viewer.get("/api/lab/photo/bottle/9999").status_code == 404 and viewer.get("/api/lab/photo/nope/0").status_code == 404)
    real_root = labs._dataset_root
    labs._dataset_root = lambda name: None
    try:
        check("lab and challenge say so plainly when the test photos are missing", viewer.get("/api/lab/data").get_json()["status"] == "unavailable"
              and viewer.get("/api/challenge/status").get_json()["available"] is False and second.post("/api/challenge/start", json={}).status_code == 400)
    finally:
        labs._dataset_root = real_root
    hot = viewer.get("/api/stats").get_json()["hotspots"]
    check("statistics map where confirmed defects are", hot and all(set(h) == {"product", "x", "y", "w", "h"} and 0 <= h["x"] <= 1 and 0 <= h["y"] <= 1 for h in hot))

    # ---- sessions ----
    r = admin.patch(f"/api/users/{vera_id}", json={"active": False})
    check("administrator disables an account", r.status_code == 200)
    check("a disabled account's session stops working at once", viewer.get("/api/stats").status_code == 401)
    check("a disabled account cannot sign in", Sess().signin("vera@example.com", "Viewer-new-pass-1").status_code == 403)
    r = admin.post(f"/api/users/{rex_id}/reset-password")
    check("administrator resets a password", r.status_code == 200 and r.get_json()["user"]["must_change_password"])
    check("a reset signs the person out everywhere", second.get("/api/stats").status_code == 401)
    out = admin.post("/api/auth/signout")
    check("sign-out ends the session", out.status_code == 200 and admin.get("/api/stats").status_code == 401)

    # ================= the React app and security headers =================
    page = anon.get("/")
    built = os.path.isfile(os.path.join(server.DIST, "index.html"))
    check("the app page is served", page.status_code == (200 if built else 503), str(page.status_code))
    if built:
        check("deep links return the app", anon.get("/app/dashboard").status_code == 200 and b"<div id=\"root\">" in anon.get("/app/dashboard").data)
        assets = [n for n in os.listdir(os.path.join(server.DIST, "assets")) if n.endswith(".js")]
        r = anon.get(f"/assets/{assets[0]}")
        check("scripts are served as JavaScript", r.status_code == 200 and r.content_type.startswith("text/javascript"), r.content_type)
    check("asset path traversal blocked", anon.get("/assets/..%2Fserver.py").status_code in (400, 404))
    check("unknown API path is JSON 404, not the app", anon.get("/api/nothing").status_code in (401, 404))
    h = page.headers
    check("security headers are set", "default-src 'self'" in h["Content-Security-Policy"] and h["X-Frame-Options"] == "DENY"
          and h["X-Content-Type-Options"] == "nosniff")
    check("only this site may use the camera; microphone and location stay off", "camera=(self)" in h["Permissions-Policy"]
          and "microphone=()" in h["Permissions-Policy"] and "geolocation=()" in h["Permissions-Policy"])
    check("session cookie is HttpOnly and SameSite", all("HttpOnly" in c and "SameSite=Lax" in c for c in
          [c for c in Sess().c.get("/api/auth/me").headers.getlist("Set-Cookie")]) )
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
