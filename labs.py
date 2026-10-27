"""OptiInspect labs: three things to do besides inspecting photos. Nothing here changes the inspection record.

  stress     POST /api/stress/try      paint a defect on a good photo and see what the agent does (nothing is saved)
             POST /api/stress/sweep    the same defect at 8 strengths: how faint can it be before it is missed?
  challenge  POST /api/challenge/start, GET .../<token>/<n>/photo, POST .../<token>/<n>/answer, POST .../finish,
             GET /api/challenge/leaderboard    a short game: you and the agent judge the same real test photos
  lab        GET /api/lab/data, GET /api/lab/photo/<product>/<n>    every real test photo, replayable at any decision lines

Challenge and lab need the photo set the product was built from (MVTec AD "bottle", next to server.py).
The agent here is the same agent.inspect() the rest of the app uses; only its logs go to a temporary folder.
"""
import atexit
import json
import os
import random
import re
import secrets
import shutil
import tempfile
import threading
import time
from datetime import datetime, timezone
from functools import lru_cache

import cv2
import numpy as np
from flask import Blueprint, Response, abort, jsonify, request

import agent
import auth
import detector
from tools import TOOLS

bp = Blueprint("labs", __name__)

PRODUCTS = None
BASE = None
TMP = tempfile.mkdtemp(prefix="optiinspect_labs_")      # agent logs and review pictures made by labs; deleted at exit
atexit.register(shutil.rmtree, TMP, True)
MAX_PHOTO = 10 * 1024 * 1024
LEVELS = [0.02, 0.04, 0.06, 0.09, 0.13, 0.19, 0.30, 0.50]    # how strongly the test defect is painted (share of the way to black or white)
RANK = {"CONFIRMED": 3, "NEEDS_REVIEW": 2, "CLEARED": 1}
JPEG = [cv2.IMWRITE_JPEG_QUALITY, 90]


def init(products, base):
    """server.py hands over its product table (the same dict, so new products show up here too)."""
    global PRODUCTS, BASE
    PRODUCTS, BASE = products, base


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _number(body, key, default, lo, hi):
    try:
        value = float(body.get(key, default))
    except (TypeError, ValueError):
        abort(400, f"'{key}' must be a number.")
    return _clamp(value, lo, hi)


def _product(name):
    p = (PRODUCTS or {}).get(name or "")
    if p is None:
        abort(400, "That product does not exist.")
    return p


def _calibrated(name):
    p = _product(name)
    if p["normal"] is None:
        abort(400, "This lab needs a calibrated product. Choose one that shows 'calibrated' on the Products page.")
    return p


def _to_work(img, ref):
    """The detector needs photos the same size as the reference."""
    if img.shape[:2] != ref.shape[:2]:
        img = cv2.resize(img, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
    return img


def _inspect(work, p, name="lab"):
    """Run the real agent. Its log and review pictures go to a temporary folder and are removed again."""
    res = agent.inspect(work, p["ref"], name, normal=p["normal"], log_dir=TMP, out_dir=TMP, actor="lab")
    prefix = res["inspection_id"]
    for entry in os.scandir(TMP):
        if entry.name.startswith(prefix):
            try:
                os.remove(entry.path)
            except OSError:
                pass
    return res


def _compact(res, work):
    h, w = work.shape[:2]
    return {"verdict": res["verdict"], "work_size": [w, h], "reason": res.get("reason"),
            "defects": [{"defect": d["defect"], "box": list(d["box"]), "status": d["status"],
                         "final_score": d["final_score"], "history": d["history"]} for d in res["defects"]]}


def _read_upload():
    f = request.files.get("image")
    if f is None:
        abort(400, "Send a photo in the 'image' field.")
    data = f.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        abort(413)
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        abort(400, "That file is not a readable image.")
    return img


# ======================================================================================================
# Stress test: paint a defect, see what the agent does
# ======================================================================================================
def paint_mask(h, w, cx, cy, radius, kind, seed=7):
    """A soft blob ('stain') or a thin line ('scratch') that is 1.0 at the middle and fades to 0."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    if kind == "scratch":
        ang = np.deg2rad(35.0)
        dx, dy = float(np.cos(ang)), float(np.sin(ang))
        px, py = xx - cx, yy - cy
        t = np.clip(px * dx + py * dy, -radius * 1.6, radius * 1.6)
        d = np.hypot(px - t * dx, py - t * dy)
        sigma = max(0.8, radius * 0.10)
        return np.exp(-(d ** 2) / (2 * sigma ** 2)).astype(np.float32)
    rng = np.random.default_rng(seed)
    a = np.arctan2(yy - cy, xx - cx)
    wob = 1 + 0.16 * np.sin(3 * a + rng.uniform(0, 6.28)) + 0.09 * np.sin(5 * a + rng.uniform(0, 6.28))
    d = np.hypot(xx - cx, yy - cy) / (radius * wob)
    return (np.clip(1 - d ** 2, 0, 1) ** 1.4).astype(np.float32)


def paint(img, mask, strength, tone):
    """Blend the photo toward black (tone 0) or white (tone 255) by mask * strength. The page paints the same way."""
    m = (mask * strength)[..., None]
    return np.clip(img.astype(np.float32) * (1 - m) + float(tone) * m, 0, 255).astype(np.uint8)


def _load_base(p, base):
    if base == "reference":
        return p["ref"].copy()
    if base in p["samples"]:                        # only names we listed ourselves, never a path
        img = cv2.imread(os.path.join(p["folder"], "samples", f"{base}.png"))
        if img is not None:
            return img
    abort(400, "Choose the reference or one of the ready-made photos.")


def _near(box, point, pad):
    x, y, w, h = box
    return x - pad <= point[0] <= x + w + pad and y - pad <= point[1] <= y + h + pad


@bp.post("/api/stress/try")
def stress_try():
    p = _calibrated(request.form.get("product"))
    work = _to_work(_read_upload(), p["ref"])
    started = time.perf_counter()
    out = _compact(_inspect(work, p, "stress"), work)
    out["duration_ms"] = round((time.perf_counter() - started) * 1000)
    return jsonify(out)


@bp.post("/api/stress/sweep")
def stress_sweep():
    body = request.get_json(silent=True) or {}
    p = _calibrated(body.get("product"))
    kind = body.get("shape", "stain")
    if kind not in ("stain", "scratch"):
        abort(400, "The shape must be stain or scratch.")
    tone = 0 if body.get("tone") == "dark" else 255        # these photos are dark, so a bright mark is the fair default
    size = _number(body, "size", 0.04, 0.01, 0.15)
    cx, cy = _number(body, "x", 0.62, 0.05, 0.95), _number(body, "y", 0.4, 0.05, 0.95)
    base = _load_base(p, body.get("base") or "reference")
    h, w = base.shape[:2]
    mask = paint_mask(h, w, cx * w, cy * h, size * w, kind)
    ref = p["ref"]
    work_w, work_h = ref.shape[1], ref.shape[0]
    center = (cx * work_w, cy * work_h)
    pad = max(6.0, 0.04 * work_w)

    clean = _to_work(base, ref)
    base_res = _inspect(clean, p, "sweep")
    levels = []
    for s in LEVELS:
        work = _to_work(paint(base, mask, s, tone), ref)
        res = _inspect(work, p, "sweep")
        hits = [d for d in res["defects"] if _near(d["box"], center, pad)]
        best = max(hits, key=lambda d: RANK.get(d["status"], 0), default=None)
        levels.append({"level": s, "status": best["status"] if best else None,
                       "first": best["history"][0]["score"] if best else None,
                       "final": best["final_score"] if best else None,
                       "checks": len(best["tools_tried"]) if best else 0,
                       "others": len(res["defects"]) - len(hits)})
    return jsonify(work_size=[work_w, work_h], center=list(center), levels=levels,
                   baseline={"verdict": base_res["verdict"], "defects": len(base_res["defects"])})


# ======================================================================================================
# Real test photos (needed by the challenge and the lab)
# ======================================================================================================
_photo_sets = {}


def _dataset_root(name):
    """Folder holding the photos a product was built from, e.g. bottle/ (it has test/ and ground_truth/)."""
    p = (PRODUCTS or {}).get(name or "")
    if not p:
        return None
    source = str((p.get("cal") or {}).get("source") or "").replace("\\", "/")
    m = re.match(r"^([A-Za-z0-9_-]+)/train/", source)
    if not m:
        return None
    root = os.path.join(BASE, m.group(1))
    return root if os.path.isdir(os.path.join(root, "test", "good")) else None


def _test_photos(root):
    if root not in _photo_sets:
        photos, test = [], os.path.join(root, "test")
        for category in sorted(os.listdir(test)):
            folder = os.path.join(test, category)
            if not os.path.isdir(folder):
                continue
            for f in sorted(os.listdir(folder)):
                stem, ext = os.path.splitext(f)
                if ext.lower() != ".png":
                    continue
                mask = os.path.join(root, "ground_truth", category, f"{stem}_mask.png")
                photos.append({"path": os.path.join(folder, f), "category": category, "name": f"{category}_{stem}",
                               "defective": category != "good", "mask": mask if os.path.exists(mask) else None})
        _photo_sets[root] = photos
    return _photo_sets[root]


def _with_photos():
    """Names of calibrated products whose test photos are on this computer."""
    return [n for n, p in (PRODUCTS or {}).items() if p["normal"] is not None and _dataset_root(n)]


# ======================================================================================================
# Challenge: you against the agent
# ======================================================================================================
CHALLENGES = {}
CHALLENGE_LOCK = threading.Lock()
PRETTY = {"good": "A good bottle", "broken_large": "Broken, large", "broken_small": "Broken, small", "contamination": "Contamination"}


def _scores_path():
    return os.path.join(auth.DATA_DIR, "challenge.json")


def _load_scores():
    try:
        with open(_scores_path(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_scores(runs):
    os.makedirs(auth.DATA_DIR, exist_ok=True)
    tmp = _scores_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(runs[-300:], f)
    os.replace(tmp, _scores_path())


@lru_cache(maxsize=128)
def _display_jpeg(path, size):
    img = cv2.imread(path)
    s = size / max(img.shape[:2])
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", img, JPEG)[1].tobytes()


def _no_store(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _challenge(token):
    ch = CHALLENGES.get(token)
    if ch is None or ch["user"] != auth.current_user()["id"]:
        abort(404, "That game is not available any more. Start a new one.")
    return ch


def _round(ch, n):
    if not 0 <= n < len(ch["rounds"]):
        abort(404, "There is no such round.")
    return ch["rounds"][n]


@bp.get("/api/challenge/status")
def challenge_status():
    names = _with_photos()
    return jsonify(available=bool(names), products=names,
                   photos={n: len(_test_photos(_dataset_root(n))) for n in names},
                   message=None if names else "The challenge needs the MVTec bottle test photos next to server.py (the same folder used to build the bottle product).")


@bp.post("/api/challenge/start")
def challenge_start():
    body = request.get_json(silent=True) or {}
    names = _with_photos()
    name = body.get("product") or (names[0] if names else None)
    if name not in names:
        abort(400, "The test photos for this product are not on this computer.")
    count = int(_number(body, "rounds", 10, 4, 20))
    photos = _test_photos(_dataset_root(name))
    rnd = random.SystemRandom()
    bad = rnd.sample([x for x in photos if x["defective"]], (count + 1) // 2)
    good = rnd.sample([x for x in photos if not x["defective"]], count - len(bad))
    picked = bad + good
    rnd.shuffle(picked)
    user = auth.current_user()
    token = secrets.token_urlsafe(12)
    with CHALLENGE_LOCK:
        for old in [t for t, c in CHALLENGES.items() if time.time() - c["created"] > 3 * 3600]:
            del CHALLENGES[old]
        CHALLENGES[token] = {"user": user["id"], "name": user["name"], "product": name, "created": time.time(), "saved": False,
                             "rounds": [{**x, "answer": None} for x in picked]}
    return jsonify(token=token, rounds=len(picked), product=name)


@bp.get("/api/challenge/<token>/<int:n>/photo")
def challenge_photo(token, n):
    r = _round(_challenge(token), n)
    return _no_store(Response(_display_jpeg(r["path"], 720), mimetype="image/jpeg"))


def _mask_polygons(mask):
    """Outline of the real defect, as points between 0 and 1, for drawing on top of the photo."""
    h, w = mask.shape[:2]
    contours, _ = cv2.findContours((mask > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in contours:
        if cv2.contourArea(c) < 20:
            continue
        c = cv2.approxPolyDP(c, 0.004 * cv2.arcLength(c, True), True)
        polys.append([[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in c[:, 0, :][:80]])
    return polys[:12]


def _agent_view(r, p):
    """What the agent says about this photo, in the same words a person would use."""
    img = cv2.imread(r["path"])
    work = _to_work(img, p["ref"])
    res = _inspect(work, p, "challenge")
    statuses = {d["status"] for d in res["defects"]}
    verdict = "defect" if "CONFIRMED" in statuses else "unsure" if "NEEDS_REVIEW" in statuses else "ok"
    h, w = work.shape[:2]
    boxes = [{"x": d["box"][0] / w, "y": d["box"][1] / h, "w": d["box"][2] / w, "h": d["box"][3] / h,
              "status": d["status"], "score": d["final_score"]} for d in res["defects"]]
    top = max(res["defects"], key=lambda d: (RANK.get(d["status"], 0), d["final_score"]), default=None)
    return {"verdict": verdict, "boxes": boxes, "work_size": [w, h], "steps": top["history"] if top else [],
            "score": top["final_score"] if top else None, "res": res}


@bp.post("/api/challenge/<token>/<int:n>/answer")
def challenge_answer(token, n):
    ch = _challenge(token)
    r = _round(ch, n)
    body = request.get_json(silent=True) or {}
    verdict = body.get("verdict")
    if verdict not in ("defect", "ok"):
        abort(400, "Say whether this is a defect or fine.")
    point = body.get("point")
    if point is not None:
        try:
            point = [_clamp(float(point[0]), 0.0, 1.0), _clamp(float(point[1]), 0.0, 1.0)]
        except (TypeError, ValueError, IndexError):
            abort(400, "The marked spot is not valid.")
    with CHALLENGE_LOCK:
        if r["answer"] is not None:
            abort(400, "You already answered this round.")
        r["answer"] = {"pending": True}
    try:
        reveal = _grade(ch, r, verdict, point, body.get("ms"))
    except BaseException:                          # a failure must not leave the round locked as answered
        r["answer"] = None
        raise
    r["answer"] = reveal
    return jsonify(reveal)


def _grade(ch, r, verdict, point, ms):
    p = _product(ch["product"])
    ms = int(_clamp(float(ms), 0, 600000)) if isinstance(ms, (int, float)) else 0

    mask_native = cv2.imread(r["mask"], cv2.IMREAD_GRAYSCALE) if r["mask"] else None
    near = None
    if mask_native is not None:                    # forgiving: a click close to the real mark counts
        k = max(3, int(0.06 * mask_native.shape[1]))
        near = cv2.dilate((mask_native > 127).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    defective = r["defective"]
    human_ok = (verdict == "defect") == defective
    located = None
    if defective and verdict == "defect" and near is not None:
        located = bool(point and near[int(point[1] * (near.shape[0] - 1)), int(point[0] * (near.shape[1] - 1))])
    human_points = int(human_ok) + int(bool(human_ok and defective and located))

    a = _agent_view(r, p)
    agent_located = None
    if defective and mask_native is not None:
        work_mask = cv2.resize((mask_native > 127).astype(np.uint8), tuple(a["work_size"]), interpolation=cv2.INTER_AREA) > 0
        W, H = a["work_size"]
        agent_located = any(work_mask[max(0, int(b["y"] * H) - 3):int((b["y"] + b["h"]) * H) + 3,
                                     max(0, int(b["x"] * W) - 3):int((b["x"] + b["w"]) * W) + 3].any()
                            for b in a["boxes"] if b["status"] == "CONFIRMED")
    agent_ok = None if a["verdict"] == "unsure" else (a["verdict"] == "defect") == defective
    agent_points = (int(bool(agent_ok)) + int(bool(agent_ok and defective and agent_located))) if agent_ok is not None else 0
    reveal = {
        "defective": defective, "category": PRETTY.get(r["category"], r["category"]),
        "human": {"verdict": verdict, "correct": human_ok, "located": located, "points": human_points, "ms": ms, "point": point},
        "agent": {"verdict": a["verdict"], "correct": agent_ok, "located": agent_located, "points": agent_points,
                  "boxes": a["boxes"], "steps": a["steps"], "score": a["score"]},
        "outline": _mask_polygons(mask_native) if mask_native is not None else [],
    }
    return reveal


def _summary(ch):
    rounds = [r["answer"] for r in ch["rounds"] if r["answer"] and "human" in r["answer"]]
    maxima = sum(2 if r["defective"] else 1 for r in ch["rounds"])
    done = len(rounds)
    return {
        "rounds": len(ch["rounds"]), "answered": done, "max_points": maxima, "product": ch["product"],
        "human_points": sum(a["human"]["points"] for a in rounds), "agent_points": sum(a["agent"]["points"] for a in rounds),
        "human_correct": sum(bool(a["human"]["correct"]) for a in rounds),
        "agent_correct": sum(a["agent"]["correct"] is True for a in rounds),
        "agent_asked": sum(a["agent"]["verdict"] == "unsure" for a in rounds),
        "avg_ms": round(sum(a["human"]["ms"] for a in rounds) / done) if done else 0,
        "detail": [{"category": a["category"], "defective": a["defective"], "human_correct": a["human"]["correct"],
                    "agent_verdict": a["agent"]["verdict"], "agent_correct": a["agent"]["correct"]} for a in rounds],
    }


@bp.post("/api/challenge/<token>/finish")
def challenge_finish(token):
    ch = _challenge(token)
    summary = _summary(ch)
    if summary["answered"] < summary["rounds"]:
        abort(400, "Answer every round first.")
    with CHALLENGE_LOCK:
        if not ch["saved"]:
            ch["saved"] = True
            runs = _load_scores()
            runs.append({"user": ch["user"], "name": ch["name"], "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                         **{k: summary[k] for k in ("rounds", "max_points", "human_points", "agent_points", "human_correct",
                                                    "agent_correct", "agent_asked", "avg_ms", "product")}})
            _save_scores(runs)
    return jsonify(summary)


@bp.get("/api/challenge/leaderboard")
def challenge_leaderboard():
    runs = _load_scores()
    me = auth.current_user()["id"]
    best = {}
    for run in runs:
        share = run["human_points"] / max(1, run["max_points"])
        key = run["user"]
        if key not in best or (share, -run["avg_ms"]) > (best[key][0], -best[key][1]["avg_ms"]):
            best[key] = (share, run)
    top = sorted(best.values(), key=lambda t: (-t[0], t[1]["avg_ms"]))[:10]
    mine = [r for r in runs if r["user"] == me]
    rounds = sum(r["rounds"] for r in mine)
    return jsonify(
        top=[{"name": r["name"], "points": r["human_points"], "max": r["max_points"], "agent": r["agent_points"], "avg_ms": r["avg_ms"],
              "date": r["date"], "you": r["user"] == me} for _, r in top],
        mine={"games": len(mine), "rounds": rounds,
              "human_accuracy": (sum(r["human_correct"] for r in mine) / rounds) if rounds else None,
              "agent_accuracy": (sum(r["agent_correct"] for r in mine) / rounds) if rounds else None},
        games=len(runs))


# ======================================================================================================
# Tolerance lab: replay every real test photo at any decision lines
# ======================================================================================================
LAB = {}
LAB_LOCK = threading.Lock()
LAB_VERSION = 1


def lab_record(img, ref, normal):
    """What the agent would see on one photo: each defect's first score and what every extra check would say.
    The checks do not depend on the decision lines, so any lines can be replayed from this (see simulate)."""
    decider = agent.get_decider()
    ref1 = detector.prepare(img, ref)
    items = []
    for d in detector.detect(img, ref1, normal):
        tried, steps = [], []
        for _ in range(agent.MAX_TRIES):
            tool, _why = decider.choose(d, tried, [], img, ref1)
            if tool is None:
                break
            tried.append(tool)
            steps.append({"by": tool, "score": TOOLS[tool](img, ref1, d["box"], d["peak"], normal)["score"]})
        items.append({"first": d["score"], "area": d["area"], "box": list(d["box"]), "steps": steps})
    return items


def simulate(defects, dismiss, confirm, max_tries=3):
    """The agent's own rule (agent.inspect), replayed from a lab record. Returns DEFECT, NEEDS_REVIEW or OK."""
    statuses = set()
    for d in defects:
        score, k = d["first"], 0
        while confirm > score > dismiss and k < min(max_tries, len(d["steps"])):
            score = d["steps"][k]["score"]
            k += 1
        statuses.add("CONFIRMED" if score >= confirm else "CLEARED" if (score <= dismiss and k == 0) else "NEEDS_REVIEW")
    return "DEFECT" if "CONFIRMED" in statuses else "NEEDS_REVIEW" if "NEEDS_REVIEW" in statuses else "OK"


def _lab_cache_path(name):
    return os.path.join(auth.DATA_DIR, f"lab_{name}.json")


def _lab_key(p, total):
    return {"normal": round(float(p["normal"]), 4), "edge_k": detector.EDGE_K, "photos": total, "v": LAB_VERSION}


def _lab_worker(name, p, photos, state):
    try:
        out = []
        for i, ph in enumerate(photos):
            img = _to_work(cv2.imread(ph["path"]), p["ref"])
            out.append({"id": i, "name": ph["name"], "category": ph["category"], "defective": ph["defective"],
                        "defects": lab_record(img, p["ref"], p["normal"])})
            state["progress"] = i + 1
        state["photos"] = out
        try:
            os.makedirs(auth.DATA_DIR, exist_ok=True)
            with open(_lab_cache_path(name), "w", encoding="utf-8") as f:
                json.dump({"key": _lab_key(p, len(photos)), "photos": out}, f)
        except OSError:
            pass                                         # the cache is only a speed-up
        state["status"] = "ready"
    except Exception as e:                               # shown in the page instead of hanging forever
        state["status"], state["error"] = "error", str(e)


@bp.get("/api/lab/data")
def lab_data():
    names = _with_photos()
    name = request.args.get("product") or (names[0] if names else None)
    config = {"confirm": agent.CONFIRM, "dismiss": agent.DISMISS, "max_tries": agent.MAX_TRIES, "tools_can_dismiss": agent.TOOLS_CAN_DISMISS}
    if name not in names:
        return jsonify(status="unavailable", products=names, config=config,
                       message="The lab replays the real test photos a product was built from. Put the MVTec bottle folder next to server.py and rebuild the bottle product.")
    p = PRODUCTS[name]
    photos = _test_photos(_dataset_root(name))
    with LAB_LOCK:
        state = LAB.get(name)
        if state is None:
            state = LAB[name] = {"status": "computing", "progress": 0, "total": len(photos), "photos": None, "error": None}
            try:
                with open(_lab_cache_path(name), encoding="utf-8") as f:
                    cached = json.load(f)
                if cached.get("key") == _lab_key(p, len(photos)):
                    state.update(status="ready", progress=len(photos), photos=cached["photos"])
            except (OSError, json.JSONDecodeError):
                pass
            if state["status"] == "computing":
                threading.Thread(target=_lab_worker, args=(name, p, photos, state), daemon=True).start()
    if state["status"] == "error":
        LAB.pop(name, None)
        return jsonify(status="error", message=state["error"], config=config, products=names), 500
    return jsonify(status=state["status"], progress=state["progress"], total=state["total"], product=name, products=names,
                   config=config, photos=state["photos"] if state["status"] == "ready" else None)


@bp.get("/api/lab/photo/<product>/<int:n>")
def lab_photo(product, n):
    root = _dataset_root(product)
    if not root:
        abort(404, "There are no test photos for that product.")
    photos = _test_photos(root)
    if not 0 <= n < len(photos):
        abort(404, "There is no such photo.")
    size = int(_clamp(request.args.get("size", 240, type=int), 64, 600))
    resp = Response(_display_jpeg(photos[n]["path"], size), mimetype="image/jpeg")
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp
