"""OptiInspect server. Run:  python server.py   then open http://127.0.0.1:5000

Accounts and sign-in live in auth.py. The interface is the React app in frontend/, built into frontend/dist.
Every /api route needs a signed-in user except the public ones listed in auth.PUBLIC_PATHS.

  auth      GET /api/auth/me   POST /api/auth/signin|signup|signout|password   PATCH /api/auth/profile
  people    GET|POST /api/users   PATCH /api/users/<id>   POST /api/users/<id>/reset-password   GET|PATCH /api/settings
  inspect   POST /api/inspect   POST /api/inspect-sample/<product>/<name>
  results   GET /api/result/<id>   /api/image/<id>   /api/view/<id>/<test|reference|diff>   /api/inspections   /api/review-queue
  review    POST /api/review/<id>   GET|POST /api/inspections/<id>/comments
  records   GET /api/log/<id>   /api/activity   /api/audit/events   /api/audit/verify   /api/export
  numbers   GET /api/stats   /api/config   /api/health
  products  GET|POST /api/products   GET /api/product-image/<product>/reference|sample/<name>
  labs      /api/stress/*   /api/challenge/*   /api/lab/*   (see labs.py)
"""
import io
import json
import os
import platform
import re
import threading
import time
import uuid
import zipfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from importlib import metadata

import cv2
import numpy as np
from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.utils import safe_join

import agent
import auth
import detector
import labs
from agent import inspect
from logger import DecisionLog, verify

BASE = os.path.dirname(os.path.abspath(__file__))
STORE = os.environ.get("OPTI_STORE_DIR") or os.path.join(BASE, "store")
LOGS = os.environ.get("OPTI_LOGS_DIR") or os.path.join(BASE, "logs")
DIST = os.path.join(BASE, "frontend", "dist")
STARTED = time.time()
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,60}$")      # blocks things like "../../secret"
PRODUCT_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{1,29}$")
DECISIONS = {"defect": "HUMAN_DEFECT", "ok": "HUMAN_OK", "unsure": "NEEDS_EXPERT"}
HUMAN_STATUSES = {"HUMAN_DEFECT", "HUMAN_OK", "NEEDS_EXPERT"}
BUCKET = {"DEFECT": "defect", "OK": "ok", "NEEDS_REVIEW": "review", "NEEDS_EXPERT": "review", "INVALID_PHOTO": "invalid"}
FEED_EVENTS = {"inspection_finished", "human_review", "comment_added", "input_rejected"}
MAX_PHOTO = 10 * 1024 * 1024
DISPLAY_MAX = 1024                                     # longest side of the photo shown on screen
JPEG_QUALITY = [cv2.IMWRITE_JPEG_QUALITY, 92]
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")

app = Flask(__name__, static_folder=None)
app.config.update(
    MAX_CONTENT_LENGTH=300 * 1024 * 1024,              # product creation uploads many photos; single photos are capped below
    SESSION_COOKIE_NAME="optiinspect", SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)
app.secret_key = auth.secret_key()
app.register_blueprint(auth.bp)
app.before_request(auth.guard)
review_lock = threading.Lock()


@app.errorhandler(HTTPException)
def http_error(e):
    message = "That upload is too large." if e.code == 413 else (e.description or e.name)
    return jsonify(error=message), e.code


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("Content-Security-Policy", CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")   # camera: only for the Inspect page's capture button
    return resp


# ---------- products ----------
def load_products():
    """Each folder in products/ is one kind of item, with its own reference and calibration."""
    found = {}
    root = os.path.join(BASE, "products")
    for name in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        folder = os.path.join(root, name)
        ref = cv2.imread(os.path.join(folder, "reference.png"))
        if ref is None:
            continue
        normal, cal, cal_path = None, {}, os.path.join(folder, "calibration.json")
        if os.path.exists(cal_path):
            with open(cal_path) as f:
                cal = json.load(f)
            if abs(cal["edge_k"] - detector.EDGE_K) > 1e-9:
                print(f"Skipping product '{name}': it was calibrated with edge setting {cal['edge_k']}, "
                      f"now {detector.EDGE_K}. Run build_product.py again.")
                continue
            normal = cal["normal"]
        samples = sorted(os.path.splitext(f)[0] for f in os.listdir(os.path.join(folder, "samples"))
                         if f.endswith(".png")) if os.path.isdir(os.path.join(folder, "samples")) else []
        found[name] = {"ref": ref, "normal": normal, "samples": samples, "folder": folder, "cal": cal}
    return found


PRODUCTS = load_products()
labs.init(PRODUCTS, BASE)
app.register_blueprint(labs.bp)


def get_product(name):
    if name not in PRODUCTS:
        abort(400, "That product does not exist.")
    return PRODUCTS[name]


def product_summary(name, p):
    cal = p["cal"]
    return {"name": name, "calibrated": p["normal"] is not None, "normal": p["normal"],
            "n_reference": cal.get("n_reference"), "n_calibration": cal.get("n_calibration"),
            "source": cal.get("source"), "created": cal.get("created"),
            "samples": [{"id": s, "label": s.replace("_", " ")} for s in p["samples"]]}


# ---------- stored inspections ----------
def valid_id(inspection_id):
    if not ID_PATTERN.match(inspection_id):
        abort(400, "That id is not valid.")
    return inspection_id


def result_path(inspection_id):
    return os.path.join(STORE, valid_id(inspection_id), "result.json")


def load_result(inspection_id):
    path = result_path(inspection_id)
    if not os.path.exists(path):
        abort(404, "There is no inspection with that id.")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_result(result):
    with open(result_path(result["inspection_id"]), "w", encoding="utf-8") as f:
        json.dump(result, f)


def all_results():
    results = []
    if os.path.isdir(STORE):
        for name in os.listdir(STORE):
            if ID_PATTERN.match(name) and os.path.exists(result_path(name)):
                try:
                    results.append(load_result(name))
                except (json.JSONDecodeError, OSError):
                    continue
    return sorted(results, key=lambda r: r["created"], reverse=True)


def compute_verdict(defects):
    statuses = {d["status"] for d in defects}
    if statuses & {"CONFIRMED", "HUMAN_DEFECT"}:
        return "DEFECT"
    if "NEEDS_REVIEW" in statuses:
        return "NEEDS_REVIEW"
    if "NEEDS_EXPERT" in statuses:
        return "NEEDS_EXPERT"
    return "OK"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slug(text, fallback="upload"):
    stem = os.path.splitext(os.path.basename(str(text or "")))[0]
    return re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_")[:40] or fallback


SOURCES = {"camera", "stress_test"}                    # where a photo came from, when it was not a plain upload


def run_inspection(img, name, product_name, user, original_name=None, source=None):
    product = get_product(product_name)
    ref = product["ref"]
    display = img                                      # what people look at: the sharp original
    if max(img.shape[:2]) > DISPLAY_MAX:
        s = DISPLAY_MAX / max(img.shape[:2])
        display = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    resized = img.shape[:2] != ref.shape[:2]
    if resized:                                        # the detector needs same-size photos
        img = cv2.resize(img, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
    started = time.perf_counter()
    result = inspect(img, ref, name, normal=product["normal"], log_dir=LOGS, actor=user["name"],
                     out_dir=os.path.join(BASE, "out", "evidence"))
    result["duration_ms"] = round((time.perf_counter() - started) * 1000)
    result["product"] = product_name
    result["created"] = now_iso()
    result["photo_name"] = name
    result["original_name"] = original_name
    result["source"] = source
    result["created_by"] = {"id": user["id"], "name": user["name"]}
    result["resized"] = resized
    result["work_size"] = [ref.shape[1], ref.shape[0]]          # boxes are in these pixels
    result["display_size"] = [display.shape[1], display.shape[0]]
    folder = os.path.join(STORE, result["inspection_id"])
    os.makedirs(folder, exist_ok=True)
    cv2.imwrite(os.path.join(folder, "image.png"), img)
    cv2.imwrite(os.path.join(folder, "display.jpg"), display, JPEG_QUALITY)
    if resized:
        DecisionLog.resume(result["inspection_id"], LOGS).add(
            "input_resized", note="photo size differed from the reference, so it was resized")
    save_result(result)
    return result


# ---------- inspecting ----------
@app.post("/api/inspect")
@auth.roles("admin", "reviewer")
def api_inspect():
    f = request.files.get("image")
    if f is None:
        abort(400, "Send a photo in the 'image' field.")
    data = f.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        abort(413)
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        abort(400, "That file is not a readable image.")
    product = request.form.get("product", next(iter(PRODUCTS), ""))
    source = request.form.get("source")
    return jsonify(run_inspection(img, slug(f.filename), product, auth.current_user(), os.path.basename(f.filename or "")[:80],
                                  source if source in SOURCES else None))


@app.post("/api/inspect-sample/<product>/<name>")
@auth.roles("admin", "reviewer")
def api_inspect_sample(product, name):
    p = get_product(product)
    if name not in p["samples"]:                       # only names we listed ourselves, never a path
        abort(404, "There is no ready-made photo with that name.")
    img = cv2.imread(os.path.join(p["folder"], "samples", f"{name}.png"))
    return jsonify(run_inspection(img, name, product, auth.current_user(), f"{name}.png"))


# ---------- reading results ----------
@app.get("/api/result/<inspection_id>")
def api_result(inspection_id):
    return jsonify(load_result(inspection_id))


@lru_cache(maxsize=256)
def _resized_jpeg(path, size, mtime):
    img = cv2.imread(path)
    s = size / max(img.shape[:2])
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", img, JPEG_QUALITY)[1].tobytes()


def _send_image(path):
    """Send an image file, shrunk when ?size=NNN is given (for thumbnails)."""
    size = request.args.get("size", type=int)
    if size and 48 <= size <= 1200:
        resp = Response(_resized_jpeg(path, size, os.path.getmtime(path)), mimetype="image/jpeg")
    else:
        resp = send_file(path)
    resp.headers["Cache-Control"] = "private, max-age=300"
    return resp


def _test_photo_path(inspection_id):
    folder = os.path.join(STORE, valid_id(inspection_id))
    for name in ("display.jpg", "image.png"):
        if os.path.exists(os.path.join(folder, name)):
            return os.path.join(folder, name)
    abort(404, "There is no photo for that inspection.")


@app.get("/api/image/<inspection_id>")
def api_image(inspection_id):
    return _send_image(_test_photo_path(inspection_id))


def _build_views(folder, result):
    """Make the 'reference lined up with this photo' and 'difference heat map' pictures."""
    product = PRODUCTS.get(result.get("product"))
    if product is None:
        abort(404, "The product for this inspection is not available.")
    work = cv2.imread(os.path.join(folder, "image.png"))
    ref = detector.prepare(work, product["ref"])
    diff = detector.compare(work, ref)
    scale = 2 * product["normal"] if product["normal"] else max(float(diff.max()), 1.0)
    heat = cv2.applyColorMap(np.clip(diff * 255 / scale, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
    size = tuple(result.get("display_size") or (work.shape[1], work.shape[0]))
    for kind, img in (("reference", ref), ("diff", heat)):
        cv2.imwrite(os.path.join(folder, f"{kind}.jpg"), cv2.resize(img, size, interpolation=cv2.INTER_CUBIC), JPEG_QUALITY)


@app.get("/api/view/<inspection_id>/<kind>")
def api_view(inspection_id, kind):
    """The same picture size for all views, so boxes line up on every one of them."""
    if kind not in ("test", "reference", "diff"):
        abort(404, "Unknown view.")
    result = load_result(inspection_id)
    if kind == "test":
        return _send_image(_test_photo_path(inspection_id))
    folder = os.path.join(STORE, inspection_id)
    path = os.path.join(folder, f"{kind}.jpg")
    if not os.path.exists(path):
        _build_views(folder, result)
    return _send_image(path)


@app.get("/api/inspections")
def api_inspections():
    limit = min(max(request.args.get("limit", 200, type=int), 1), 1000)
    rows = []
    for r in all_results()[:limit]:
        statuses = Counter(d["status"] for d in r["defects"])
        rows.append({"inspection_id": r["inspection_id"], "photo_name": r["photo_name"], "original_name": r.get("original_name"),
                     "product": r.get("product"), "verdict": r["verdict"], "created": r["created"],
                     "created_by": (r.get("created_by") or {}).get("name"), "duration_ms": r.get("duration_ms"), "source": r.get("source"),
                     "defect_count": len(r["defects"]), "statuses": dict(statuses),
                     "top_score": max((d["final_score"] for d in r["defects"]), default=None),
                     "waiting": statuses["NEEDS_REVIEW"], "reason": r.get("reason")})
    return jsonify(rows)


@app.get("/api/review-queue")
def api_queue():
    return jsonify([r for r in all_results() if any(d["status"] == "NEEDS_REVIEW" for d in r["defects"])])


# ---------- deciding and commenting ----------
@app.post("/api/review/<inspection_id>")
@auth.roles("admin", "reviewer")
def api_review(inspection_id):
    body = request.get_json(silent=True) or {}
    decision, note, index = body.get("decision"), str(body.get("note", ""))[:500], body.get("defect")
    if decision not in DECISIONS:
        abort(400, "The decision must be defect, ok or unsure.")
    user = auth.current_user()
    with review_lock:                                  # one review at a time, no overwriting
        result = load_result(inspection_id)
        if not isinstance(index, int) or not 0 <= index < len(result["defects"]):
            abort(400, "That defect number does not exist.")
        d = result["defects"][index]
        if d["status"] != "NEEDS_REVIEW":
            abort(400, "This defect is not waiting for a decision.")
        before = d["status"]
        d["status"] = DECISIONS[decision]
        d["reviewed_by"] = {"id": user["id"], "name": user["name"]}
        d["reviewed_at"] = now_iso()
        result["verdict"] = compute_verdict(result["defects"])
        DecisionLog.resume(inspection_id, LOGS).add(
            "human_review", who=user["name"], defect=index, decision=decision, note=note,
            status_before=before, status_after=d["status"], user_id=user["id"], role=user["role"])
        save_result(result)
    return jsonify(result)


def _comments_path(inspection_id):
    return os.path.join(STORE, valid_id(inspection_id), "comments.json")


def _read_comments(inspection_id):
    try:
        with open(_comments_path(inspection_id), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


@app.get("/api/inspections/<inspection_id>/comments")
def api_comments(inspection_id):
    load_result(inspection_id)
    return jsonify(_read_comments(inspection_id))


@app.post("/api/inspections/<inspection_id>/comments")
@auth.roles("admin", "reviewer")
def api_add_comment(inspection_id):
    load_result(inspection_id)
    text = str((request.get_json(silent=True) or {}).get("text", "")).strip()
    if not 1 <= len(text) <= 1000:
        abort(400, "Write a comment of up to 1000 characters.")
    user = auth.current_user()
    with review_lock:
        comments = _read_comments(inspection_id)
        comment = {"id": uuid.uuid4().hex[:10], "author": user["name"], "author_id": user["id"], "role": user["role"],
                   "text": text, "time": now_iso()}
        comments.append(comment)
        with open(_comments_path(inspection_id), "w", encoding="utf-8") as f:
            json.dump(comments, f)
        DecisionLog.resume(inspection_id, LOGS).add("comment_added", who=user["name"], text=text, user_id=user["id"])
    return jsonify(comment), 201


# ---------- the record ----------
def _read_events(inspections=300):
    events = []
    for r in all_results()[:inspections]:
        path = os.path.join(LOGS, f"{r['inspection_id']}.jsonl")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    events.append({**json.loads(line), "photo_name": r["photo_name"], "product": r.get("product")})
    events.sort(key=lambda e: (e["time"], e["step"]), reverse=True)
    return events


@app.get("/api/log/<inspection_id>")
def api_log(inspection_id):
    path = os.path.join(LOGS, f"{valid_id(inspection_id)}.jsonl")
    if not os.path.exists(path):
        abort(404, "There is no log for that inspection.")
    with open(path, encoding="utf-8") as f:
        events = [json.loads(line) for line in f if line.strip()]
    return jsonify(events=events, intact=verify(path))


@app.get("/api/activity")
def api_activity():
    limit = min(max(request.args.get("limit", 30, type=int), 1), 100)
    return jsonify([e for e in _read_events(60) if e["event"] in FEED_EVENTS][:limit])


@app.get("/api/audit/events")
def api_audit_events():
    limit = min(max(request.args.get("limit", 50, type=int), 1), 200)
    offset = max(request.args.get("offset", 0, type=int), 0)
    kind, who, q = request.args.get("event", ""), request.args.get("who", ""), request.args.get("q", "").strip().lower()
    everything = _read_events(500)
    events = everything
    if kind:
        events = [e for e in events if e["event"] == kind]
    if who:
        events = [e for e in events if e["who"] == who]
    if q:
        events = [e for e in events if q in e["event"] or q in e["photo_name"].lower() or q in json.dumps(e["details"]).lower()]
    return jsonify(total=len(events), events=events[offset:offset + limit],
                   kinds=sorted({e["event"] for e in everything}), whos=sorted({e["who"] for e in everything}))


@app.get("/api/audit/verify")
def api_audit_verify():
    items = []
    for r in all_results():
        path = os.path.join(LOGS, f"{r['inspection_id']}.jsonl")
        if not os.path.exists(path):
            items.append({"inspection_id": r["inspection_id"], "photo_name": r["photo_name"], "intact": False, "entries": 0, "anchored": False})
            continue
        try:
            intact = verify(path)
        except (ValueError, KeyError):
            intact = False
        with open(path, encoding="utf-8") as f:
            entries = sum(1 for line in f if line.strip())
        items.append({"inspection_id": r["inspection_id"], "photo_name": r["photo_name"], "intact": intact,
                      "entries": entries, "anchored": os.path.exists(path + ".head")})
    broken = [i["inspection_id"] for i in items if not i["intact"]]
    return jsonify(checked=len(items), entries=sum(i["entries"] for i in items), intact=not broken, broken=broken, items=items)


@app.get("/api/export")
@auth.roles("admin")
def api_export():
    """Everything the app recorded, as one zip: results, logs, comments (and photos with ?photos=1)."""
    photos = request.args.get("photos") == "1"
    buf = io.BytesIO()
    results = all_results()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for r in results:
            iid = r["inspection_id"]
            z.writestr(f"inspections/{iid}/result.json", json.dumps(r, indent=2))
            for name in (f"{iid}.jsonl", f"{iid}.jsonl.head"):
                if os.path.exists(os.path.join(LOGS, name)):
                    z.write(os.path.join(LOGS, name), f"logs/{name}")
            if os.path.exists(_comments_path(iid)):
                z.write(_comments_path(iid), f"inspections/{iid}/comments.json")
            if photos and os.path.exists(os.path.join(STORE, iid, "display.jpg")):
                z.write(os.path.join(STORE, iid, "display.jpg"), f"inspections/{iid}/photo.jpg")
        z.writestr("manifest.json", json.dumps({"exported": now_iso(), "by": auth.current_user()["email"],
                                                "inspections": len(results), "includes_photos": photos}, indent=2))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"optiinspect-export-{datetime.now().strftime('%Y%m%d-%H%M')}.zip")


# ---------- numbers ----------
def _histogram(values, bins=10):
    counts = [0] * bins
    for v in values:
        counts[min(bins - 1, max(0, int(v * bins)))] += 1
    return counts


@app.get("/api/stats")
def api_stats():
    results = all_results()
    defects = [d for r in results for d in r["defects"]]
    outcomes = Counter(d["status"] for d in defects)
    moved = Counter("up" if d["final_score"] > d["history"][0]["score"] else "down" for d in defects if d["tools_tried"])

    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    series = {d: Counter() for d in days}
    for r in results:
        day = r["created"][:10]
        if day in series:
            series[day]["total"] += 1
            series[day][BUCKET.get(r["verdict"], "review")] += 1

    tools = {}
    for d in defects:
        for prev, step in zip(d["history"], d["history"][1:]):
            t = tools.setdefault(step["by"], {"runs": 0, "raised": 0, "lowered": 0, "net": 0.0})
            delta = step["score"] - prev["score"]
            t["runs"] += 1
            t["raised"] += delta > 0.005
            t["lowered"] += delta < -0.005
            t["net"] += delta
    for t in tools.values():
        t["net"] = round(t["net"] / t["runs"], 3)

    durations = sorted(r["duration_ms"] for r in results if r.get("duration_ms") is not None)
    hotspots = [{"product": r.get("product"), "x": round((d["box"][0] + d["box"][2] / 2) / ws[0], 4), "y": round((d["box"][1] + d["box"][3] / 2) / ws[1], 4),
                 "w": round(d["box"][2] / ws[0], 4), "h": round(d["box"][3] / ws[1], 4)}
                for r in results for ws in [r.get("work_size") or [256, 256]] for d in r["defects"] if d["status"] in ("CONFIRMED", "HUMAN_DEFECT")][:3000]
    return jsonify(hotspots=hotspots,
        inspections=len(results), defects=len(defects), outcomes=dict(outcomes),
        verdicts=dict(Counter(r["verdict"] for r in results)),
        awaiting_review=outcomes["NEEDS_REVIEW"],
        human_decided=sum(outcomes[k] for k in HUMAN_STATUSES),
        resolved_by_agent=outcomes["CONFIRMED"] + outcomes["CLEARED"],
        tools_used=dict(Counter(t for d in defects for t in d["tools_tried"])), tool_moves=dict(moved),
        series=[{"date": d, "total": series[d]["total"], "defect": series[d]["defect"], "ok": series[d]["ok"],
                 "review": series[d]["review"], "invalid": series[d]["invalid"]} for d in days],
        scores={"first": _histogram([d["history"][0]["score"] for d in defects]), "final": _histogram([d["final_score"] for d in defects])},
        tools=tools,
        reviewers=dict(Counter((d.get("reviewed_by") or {}).get("name") for d in defects if d.get("reviewed_by"))),
        people_vs_agent=[{"score": d["final_score"], "decision": d["status"]} for d in defects if d["status"] in HUMAN_STATUSES],
        duration={"avg": round(sum(durations) / len(durations)) if durations else None,
                  "p95": durations[int(0.95 * (len(durations) - 1))] if durations else None, "n": len(durations)},
        inspectors=dict(Counter((r.get("created_by") or {}).get("name") for r in results if r.get("created_by"))),
    )


def _folder_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


@app.get("/api/config")
def api_config():
    """The numbers the agent works with, so the interface can show them instead of guessing."""
    return jsonify(
        confirm=detector.CONFIRM_SCORE, dismiss=detector.DISMISS_SCORE, max_tries=agent.MAX_TRIES,
        tools_can_dismiss=agent.TOOLS_CAN_DISMISS, min_structure=detector.MIN_STRUCTURE,
        wrong_photo_share=detector.WRONG_PHOTO_SHARE, edge_k=detector.EDGE_K,
        engine={"opencv": cv2.__version__, "numpy": np.__version__, "python": platform.python_version(),
                "flask": metadata.version("flask"), "system": platform.system()},
        uptime_seconds=int(time.time() - STARTED), products=len(PRODUCTS),
        storage={"photos_and_results": _folder_size(STORE), "logs": _folder_size(LOGS)})


@app.get("/api/health")
def api_health():
    return jsonify(ok=True, name="OptiInspect")


# ---------- products ----------
@app.get("/api/products")
def api_products():
    return jsonify([product_summary(n, p) for n, p in PRODUCTS.items()])


@app.post("/api/products")
@auth.roles("admin")
def api_create_product():
    """Build a product from uploaded photos of good parts: 40 make the reference, the rest teach 'normal'."""
    name = (request.form.get("name") or "").strip().lower()
    if not PRODUCT_NAME.match(name):
        abort(400, "Name the product with 2 to 30 letters, numbers, dashes or underscores.")
    folder = os.path.join(BASE, "products", name)
    if name in PRODUCTS or os.path.exists(folder):
        abort(400, "A product with that name already exists.")
    files = request.files.getlist("images")
    if len(files) < 50:
        abort(400, "Add at least 50 photos of good parts: 40 build the reference, the rest teach the system what normal looks like.")
    if len(files) > 300:
        abort(400, "Add at most 300 photos.")
    imgs = []
    for f in files:
        data = f.read(MAX_PHOTO + 1)
        if len(data) > MAX_PHOTO:
            continue
        im = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if im is not None:
            imgs.append(cv2.resize(im, (256, 256), interpolation=cv2.INTER_AREA))
    if len(imgs) < 50:
        abort(400, f"Only {len(imgs)} of the files could be read as photos under 10 MB. At least 50 are needed.")
    ref = detector.build_reference(imgs[:40])
    alike = sorted(detector.structure_match(im, detector.align(ref, im)) for im in imgs[40:])
    if alike[len(alike) // 2] < 0.5:
        abort(400, "These photos do not look like the same part, so they cannot define 'normal'. Use photos of one kind of part, taken the same way.")
    normal = detector.calibrate(imgs[40:80], ref)
    os.makedirs(os.path.join(folder, "samples"))
    cv2.imwrite(os.path.join(folder, "reference.png"), ref)
    cal = {"normal": normal, "edge_k": detector.EDGE_K, "n_reference": 40, "n_calibration": len(imgs[40:80]),
           "source": f"uploaded in the app by {auth.current_user()['name']}", "created": now_iso()}
    with open(os.path.join(folder, "calibration.json"), "w") as f:
        json.dump(cal, f, indent=2)
    PRODUCTS[name] = {"ref": ref, "normal": normal, "samples": [], "folder": folder, "cal": cal}
    return jsonify(product_summary(name, PRODUCTS[name])), 201


def _small(path):
    return _send_image(path)


@app.get("/api/product-image/<product>/reference")
def api_product_reference(product):
    return _small(os.path.join(get_product(product)["folder"], "reference.png"))


@app.get("/api/product-image/<product>/sample/<name>")
def api_product_sample(product, name):
    p = get_product(product)
    if name not in p["samples"]:                       # only names we listed ourselves, never a path
        abort(404, "There is no ready-made photo with that name.")
    return _small(os.path.join(p["folder"], "samples", f"{name}.png"))


# ---------- the React app ----------
MIME = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2"}


@app.get("/assets/<path:filename>")
def assets(filename):
    resp = send_from_directory(os.path.join(DIST, "assets"), filename)   # refuses paths like ../x
    ext = os.path.splitext(filename)[1].lower()
    if ext in MIME:                                    # Windows can report .js as text/plain
        resp.mimetype = MIME[ext]
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    """Any page address returns the app, so links like /app/review work when typed or refreshed."""
    if path.startswith(("api/", "assets/")):
        abort(404, "Not found.")
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        return Response("<h1>OptiInspect</h1><p>The interface has not been built yet. In a terminal run "
                        "<code>cd frontend</code>, <code>npm install</code>, <code>npm run build</code>, then reload.</p>",
                        status=503, mimetype="text/html")
    target = safe_join(DIST, path) if path else None
    if target and os.path.isfile(target):
        resp = send_from_directory(DIST, path)
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME:
            resp.mimetype = MIME[ext]
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


if __name__ == "__main__":
    # 127.0.0.1 = only this computer can open it. debug stays off (debug mode lets visitors run code).
    app.run(host="127.0.0.1", port=int(os.environ.get("OPTI_PORT", 5000)), debug=False, threaded=True)
