"""Accounts, sign-in sessions and permissions for OptiInspect.

Local and file-based: users live in userdata/users.json with salted password hashes (scrypt),
sign-in uses a signed HttpOnly session cookie, every change request must carry a CSRF token,
and roles decide who may inspect, review and administer.

Roles
  admin     everything, including users, products and settings
  reviewer  run inspections, decide on unsure cases, comment
  viewer    read only
"""
import json
import os
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, abort, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("OPTI_DATA_DIR") or os.path.join(BASE, "userdata")   # tests point this at a temporary folder
ROLES = ("admin", "reviewer", "viewer")
ROLE_TEXT = {
    "admin": "Everything, including people, products and settings",
    "reviewer": "Run inspections, decide on unsure cases and comment",
    "viewer": "Look at results, history and the audit log",
}
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s.]{2,}$")
COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
    "iloveyou", "11111111", "admin123", "letmein1", "welcome1", "abc12345", "optiinspect",
}
PUBLIC_PATHS = {"/api/auth/me", "/api/auth/signin", "/api/auth/signup", "/api/health"}
DEFAULT_SETTINGS = {"signup_open": True, "default_role": "reviewer"}

bp = Blueprint("auth", __name__)
_lock = threading.RLock()
_fails = {}          # sign-in failures: "ip|email" -> {"n", "first", "until"}
_signups = {}        # sign-ups per address: ip -> [timestamps]
_cache = {"mtime": None, "path": None, "users": {}}
_DUMMY_HASH = generate_password_hash("not-a-real-password")   # keeps unknown-email sign-ins as slow as real ones


# ---------- files ----------
def users_path():
    return os.path.join(DATA_DIR, "users.json")


def settings_path():
    return os.path.join(DATA_DIR, "settings.json")


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def load_users():
    """All accounts as {id: user}. A corrupt file stops the app instead of looking like a first run,
    because a first run lets whoever signs up first become the administrator."""
    path = users_path()
    try:
        mtime = os.path.getmtime(path)
    except FileNotFoundError:
        return {}
    with _lock:
        if _cache["mtime"] == mtime and _cache["path"] == path:
            return _cache["users"]
        try:
            with open(path, encoding="utf-8") as f:
                users = json.load(f)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"{path} is damaged ({e}). Restore it from a backup or move it away on purpose.") from e
        _cache.update(mtime=mtime, path=path, users=users)
        return users


def save_users(users):
    with _lock:
        _write(users_path(), users)
        _cache.update(mtime=os.path.getmtime(users_path()), path=users_path(), users=users)


def get_settings():
    try:
        with open(settings_path(), encoding="utf-8") as f:
            stored = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        stored = {}
    s = {**DEFAULT_SETTINGS, **stored}
    if os.environ.get("OPTI_SIGNUP", "").lower() == "closed":
        s["signup_open"] = False
    return s


def secret_key():
    """The key that signs session cookies. Created once, kept in userdata/, never committed."""
    path = os.path.join(DATA_DIR, "secret.key")
    try:
        with open(path, encoding="utf-8") as f:
            key = f.read().strip()
            if len(key) >= 32:
                return key
    except FileNotFoundError:
        pass
    os.makedirs(DATA_DIR, exist_ok=True)
    key = secrets.token_hex(32)
    with open(path, "w", encoding="utf-8") as f:
        f.write(key)
    return key


# ---------- helpers ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def public(u):
    return {
        "id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"],
        "active": u.get("active", True), "created": u["created"], "last_login": u.get("last_login"),
        "must_change_password": bool(u.get("must_change")),
    }


def clean_email(value):
    return str(value or "").strip().lower()


def clean_name(value):
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", "", str(value or ""))).strip()


def find_by_email(email):
    for u in load_users().values():
        if u["email"] == email:
            return u
    return None


def new_user(name, email, password, role, must_change=False):
    return {
        "id": uuid.uuid4().hex[:12], "name": name, "email": email, "pw": generate_password_hash(password),
        "role": role, "active": True, "created": now_iso(), "last_login": None, "sv": 0, "must_change": must_change,
    }


def fail(message, status=400, field=None):
    body = {"error": message}
    if field:
        body["field"] = field
    return jsonify(body), status


def check_password_rules(password, email=""):
    """Returns an error message, or None when the password is acceptable."""
    if not isinstance(password, str) or len(password) < 8:
        return "Use at least 8 characters."
    if len(password) > 128:
        return "Use at most 128 characters."
    if password.lower() in COMMON_PASSWORDS or (email and password.lower() == email.lower()):
        return "That password is too easy to guess. Choose something less common."
    return None


def temp_password():
    return secrets.token_urlsafe(9)


# ---------- sign-in limiter ----------
def _fail_key(email):
    return f"{request.remote_addr}|{email}"


def _locked_for(key):
    rec = _fails.get(key)
    if rec and rec["until"] > time.time():
        return int(rec["until"] - time.time()) + 1
    return 0


def _register_failure(key):
    now = time.time()
    rec = _fails.get(key)
    if not rec or now - rec["first"] > 600:
        rec = _fails[key] = {"n": 0, "first": now, "until": 0}
    rec["n"] += 1
    if rec["n"] >= 5:
        rec.update(n=0, first=now, until=now + 60)


# ---------- session and permissions ----------
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(24)
    return session["csrf"]


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    uid = session.get("uid")
    if uid:
        u = load_users().get(uid)
        if u and u.get("active", True) and session.get("sv") == u.get("sv", 0):
            g.user = u
        else:
            session.pop("uid", None)
            session.pop("sv", None)
    return g.user


def start_session(user, remember):
    session.clear()
    session["uid"] = user["id"]
    session["sv"] = user.get("sv", 0)
    session["csrf"] = secrets.token_urlsafe(24)
    session.permanent = bool(remember)
    g.user = user


def guard():
    """Runs before every API request: CSRF check for changes, and sign-in for everything but public routes."""
    if not request.path.startswith("/api/"):
        return None
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sent = request.headers.get("X-CSRF-Token", "").encode()
        expected = session.get("csrf", "").encode()
        if not sent or not expected or not secrets.compare_digest(sent, expected):
            abort(403, "Your session is out of date. Reload the page and try again.")
    if request.path not in PUBLIC_PATHS and current_user() is None:
        abort(401, "Sign in to continue.")
    return None


def roles(*allowed):
    def deco(fn):
        @wraps(fn)
        def inner(*args, **kwargs):
            u = current_user()
            if u is None:
                abort(401, "Sign in to continue.")
            if u["role"] not in allowed:
                abort(403, "Your role does not allow this. Ask an administrator.")
            return fn(*args, **kwargs)
        return inner
    return deco


def _other_active_admins(users, exclude_id):
    return any(u["role"] == "admin" and u.get("active", True) and uid != exclude_id for uid, u in users.items())


# ---------- routes: signing in ----------
@bp.get("/api/auth/me")
def me():
    users = load_users()
    s = get_settings()
    u = current_user()
    resp = jsonify(user=public(u) if u else None, csrf=csrf_token(), first_user=not users,
                   signup_open=bool(s["signup_open"]) or not users, default_role=s["default_role"],
                   roles=ROLE_TEXT)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@bp.post("/api/auth/signup")
def signup():
    body = request.get_json(silent=True) or {}
    name, email, password = clean_name(body.get("name")), clean_email(body.get("email")), body.get("password", "")
    if not 1 <= len(name) <= 60:
        return fail("Enter your name (up to 60 characters).", 400, "name")
    if not EMAIL_RE.match(email):
        return fail("Enter a valid email address.", 400, "email")
    problem = check_password_rules(password, email)
    if problem:
        return fail(problem, 400, "password")
    now = time.time()
    recent = [t for t in _signups.get(request.remote_addr, []) if now - t < 3600]
    if len(recent) >= 10:
        return fail("Too many sign-ups from this address. Try again later.", 429)
    with _lock:
        users = load_users()
        first = not users
        settings = get_settings()
        if not first and not settings["signup_open"]:
            return fail("Sign-ups are closed. Ask an administrator to create your account.", 403)
        if any(u["email"] == email for u in users.values()):
            return fail("An account with this email already exists. Sign in instead.", 400, "email")
        user = new_user(name, email, password, "admin" if first else settings["default_role"])
        user["last_login"] = now_iso()
        users = dict(users)
        users[user["id"]] = user
        save_users(users)
    recent.append(now)
    _signups[request.remote_addr] = recent
    start_session(user, remember=True)
    return jsonify(user=public(user), csrf=csrf_token()), 201


@bp.post("/api/auth/signin")
def signin():
    body = request.get_json(silent=True) or {}
    email, password = clean_email(body.get("email")), str(body.get("password", ""))[:200]
    key = _fail_key(email)
    wait = _locked_for(key)
    if wait:
        return fail(f"Too many attempts. Try again in {wait} seconds.", 429)
    user = find_by_email(email)
    password_ok = check_password_hash(user["pw"] if user else _DUMMY_HASH, password)
    if not (user and password_ok):
        _register_failure(key)
        return fail("Email or password is incorrect.", 401)
    if not user.get("active", True):
        return fail("This account is disabled. Ask an administrator.", 403)
    _fails.pop(key, None)
    with _lock:
        users = dict(load_users())
        users[user["id"]] = user = {**user, "last_login": now_iso()}
        save_users(users)
    start_session(user, remember=bool(body.get("remember")))
    return jsonify(user=public(user), csrf=csrf_token())


@bp.post("/api/auth/signout")
def signout():
    session.clear()
    return jsonify(ok=True, csrf=csrf_token())


@bp.post("/api/auth/password")
def change_password():
    user = current_user()
    if user is None:
        abort(401, "Sign in to continue.")
    body = request.get_json(silent=True) or {}
    if not check_password_hash(user["pw"], str(body.get("current", ""))):
        return fail("Your current password is not correct.", 400, "current")
    problem = check_password_rules(body.get("new", ""), user["email"])
    if problem:
        return fail(problem, 400, "new")
    with _lock:
        users = dict(load_users())
        updated = {**users[user["id"]], "pw": generate_password_hash(body["new"]), "sv": user.get("sv", 0) + 1, "must_change": False}
        users[user["id"]] = updated
        save_users(users)
    session["sv"] = updated["sv"]          # other devices are signed out, this one stays
    g.user = updated
    return jsonify(ok=True, user=public(updated))


@bp.patch("/api/auth/profile")
def update_profile():
    user = current_user()
    if user is None:
        abort(401, "Sign in to continue.")
    name = clean_name((request.get_json(silent=True) or {}).get("name"))
    if not 1 <= len(name) <= 60:
        return fail("Enter your name (up to 60 characters).", 400, "name")
    with _lock:
        users = dict(load_users())
        users[user["id"]] = updated = {**users[user["id"]], "name": name}
        save_users(users)
    g.user = updated
    return jsonify(user=public(updated))


# ---------- routes: administering people ----------
@bp.get("/api/users")
@roles("admin")
def list_users():
    users = sorted(load_users().values(), key=lambda u: u["created"])
    return jsonify(users=[public(u) for u in users], roles=ROLE_TEXT, settings=get_settings())


@bp.post("/api/users")
@roles("admin")
def create_user():
    body = request.get_json(silent=True) or {}
    name, email, role = clean_name(body.get("name")), clean_email(body.get("email")), body.get("role", "reviewer")
    if not 1 <= len(name) <= 60:
        return fail("Enter a name (up to 60 characters).", 400, "name")
    if not EMAIL_RE.match(email):
        return fail("Enter a valid email address.", 400, "email")
    if role not in ROLES:
        return fail("Choose a role.", 400, "role")
    password = temp_password()
    with _lock:
        users = dict(load_users())
        if any(u["email"] == email for u in users.values()):
            return fail("An account with this email already exists.", 400, "email")
        user = new_user(name, email, password, role, must_change=True)
        users[user["id"]] = user
        save_users(users)
    return jsonify(user=public(user), temporary_password=password), 201


@bp.patch("/api/users/<uid>")
@roles("admin")
def update_user(uid):
    body = request.get_json(silent=True) or {}
    with _lock:
        users = dict(load_users())
        target = users.get(uid)
        if target is None:
            abort(404, "No such person.")
        changes = {}
        if "role" in body:
            if body["role"] not in ROLES:
                return fail("Choose a valid role.", 400, "role")
            changes["role"] = body["role"]
        if "active" in body:
            changes["active"] = bool(body["active"])
        if "name" in body:
            name = clean_name(body["name"])
            if not 1 <= len(name) <= 60:
                return fail("Enter a name (up to 60 characters).", 400, "name")
            changes["name"] = name
        demoting = target["role"] == "admin" and (changes.get("role", "admin") != "admin" or changes.get("active", True) is False)
        if demoting and not _other_active_admins(users, uid):
            return fail("There must always be at least one active administrator.", 400)
        role_changed = "role" in changes and changes["role"] != target["role"]
        if role_changed or changes.get("active") is False:
            changes["sv"] = target.get("sv", 0) + 1       # signs them out so the change applies immediately
        users[uid] = updated = {**target, **changes}
        save_users(users)
    return jsonify(user=public(updated))


@bp.post("/api/users/<uid>/reset-password")
@roles("admin")
def reset_password(uid):
    password = temp_password()
    with _lock:
        users = dict(load_users())
        target = users.get(uid)
        if target is None:
            abort(404, "No such person.")
        users[uid] = {**target, "pw": generate_password_hash(password), "sv": target.get("sv", 0) + 1, "must_change": True}
        save_users(users)
    return jsonify(temporary_password=password, user=public(users[uid]))


@bp.get("/api/settings")
@roles("admin")
def read_settings():
    return jsonify(get_settings())


@bp.patch("/api/settings")
@roles("admin")
def write_settings():
    body = request.get_json(silent=True) or {}
    s = {**DEFAULT_SETTINGS, **{k: v for k, v in get_settings().items() if k in DEFAULT_SETTINGS}}
    if "signup_open" in body:
        s["signup_open"] = bool(body["signup_open"])
    if "default_role" in body:
        if body["default_role"] not in ("reviewer", "viewer"):
            return fail("New accounts can be reviewers or viewers.", 400)
        s["default_role"] = body["default_role"]
    _write(settings_path(), s)
    return jsonify(get_settings())
