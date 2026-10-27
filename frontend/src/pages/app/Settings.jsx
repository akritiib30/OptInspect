import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Eye, EyeOff, LoaderCircle, Monitor, Moon, Sun } from "lucide-react";
import { Avatar, Segmented, Skeleton } from "../../components/bits";
import { api } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { useToast } from "../../lib/toast";
import { bytes, fmtDate, uptime } from "../../lib/format";
import { ROLE_LABEL, ROLE_TEXT, SHORTCUTS } from "../../lib/constants";

const TABS = [["profile", "Profile"], ["security", "Security"], ["appearance", "Appearance"], ["system", "System"], ["shortcuts", "Shortcuts"]];

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { const r = await api("/api/auth/profile", { method: "PATCH", body: { name } }); setUser(r.user); toast.ok("Profile saved", "Your new name appears on everything you do from now on."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="card card-pad stack settings-card" onSubmit={save}>
      <div className="row"><Avatar name={user.name} size={64} /><div><h2 style={{ fontSize: "1.3rem" }}>{user.name}</h2><div className="row tight"><span className="chip">{ROLE_LABEL[user.role]}</span><span className="muted">{user.email}</span></div></div></div>
      <p className="muted">{ROLE_TEXT[user.role]}. Member since {fmtDate(user.created)}.</p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <label className="field"><span className="label">Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /><span className="hint">Shown next to every decision and comment you make. Entries already in the audit log keep the name they were written with.</span></label>
      <label className="field"><span className="label">Email</span><input className="input" value={user.email} disabled /><span className="hint">Your email is how you sign in. An administrator can change it by creating a new account.</span></label>
      <div><button className="btn btn-primary" disabled={busy || !name.trim() || name.trim() === user.name}>{busy ? <LoaderCircle size={16} className="spin" /> : null} Save changes</button></div>
    </form>
  );
}

function Security() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api("/api/auth/password", { method: "POST", body: { current: form.current, new: form.next } }); setForm({ current: "", next: "" }); toast.ok("Password changed", "Your other devices were signed out."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="card card-pad stack settings-card" onSubmit={save}>
      <h2>Change your password</h2>
      <p className="muted">Changing it signs you out on every other device. This one stays signed in.</p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <label className="field"><span className="label">Current password</span><input className="input" type={show ? "text" : "password"} autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>
      <label className="field"><span className="label">New password</span>
        <span className="input-wrap"><input className="input" type={show ? "text" : "password"} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} placeholder="At least 8 characters" />
          <button type="button" className="adorn" onClick={() => setShow(!show)} aria-label={show ? "Hide passwords" : "Show passwords"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        <span className="hint">Passwords are stored as salted scrypt hashes. Nobody, including administrators, can read yours.</span></label>
      <div><button className="btn btn-primary" disabled={busy || !form.current || form.next.length < 8}>{busy ? <LoaderCircle size={16} className="spin" /> : null} Change password</button></div>
    </form>
  );
}

function Appearance() {
  const { theme, setTheme, motion, setMotion } = useTheme();
  return (
    <div className="card card-pad stack settings-card">
      <h2>Appearance</h2>
      <div className="setting-row"><div><b>Theme</b><p className="hint">Dark is the default. System follows your computer.</p></div>
        <Segmented id="theme-seg" label="Theme" value={theme} onChange={setTheme} options={[{ value: "dark", label: "Dark", icon: <Moon size={15} /> }, { value: "light", label: "Light", icon: <Sun size={15} /> }, { value: "system", label: "System", icon: <Monitor size={15} /> }]} /></div>
      <div className="setting-row"><div><b>Reduce motion</b><p className="hint">Stops the animated scanner, counters and transitions. Also on automatically if your computer asks for less motion.</p></div>
        <span className="switch"><input type="checkbox" checked={motion === "reduced"} onChange={(e) => setMotion(e.target.checked ? "reduced" : "system")} aria-label="Reduce motion" /></span></div>
    </div>
  );
}

function System() {
  const { data: cfg } = useApi("/api/config", { interval: 10000 });
  if (!cfg) return <Skeleton h={360} r={18} />;
  const e = cfg.engine;
  return (
    <div className="grid g-12">
      <section className="card card-pad span-6 settings-card">
        <h2 className="panel-title">Engine</h2>
        <dl className="facts">
          <dt>OpenCV</dt><dd className="num">{e.opencv}</dd><dt>NumPy</dt><dd className="num">{e.numpy}</dd><dt>Python</dt><dd className="num">{e.python}</dd><dt>Flask</dt><dd className="num">{e.flask}</dd>
          <dt>System</dt><dd>{e.system}</dd><dt>Running for</dt><dd>{uptime(cfg.uptime_seconds)}</dd><dt>Products</dt><dd>{cfg.products}</dd>
          <dt>Photos and results</dt><dd>{bytes(cfg.storage.photos_and_results)}</dd><dt>Audit logs</dt><dd>{bytes(cfg.storage.logs)}</dd>
        </dl>
      </section>
      <section className="card card-pad span-6 settings-card">
        <h2 className="panel-title">How the agent decides</h2>
        <dl className="facts">
          <dt>Confirmed at</dt><dd className="num">score {cfg.confirm} or more</dd>
          <dt>Looks normal at</dt><dd className="num">score {cfg.dismiss} or less</dd>
          <dt>Extra checks</dt><dd>up to {cfg.max_tries} per defect</dd>
          <dt>Checks can clear a defect</dt><dd>{cfg.tools_can_dismiss ? "Yes" : "No: they can only confirm one"}</dd>
          <dt>Wrong-photo cut-off</dt><dd className="num">shape match below {cfg.min_structure}</dd>
          <dt>Edge forgiveness</dt><dd className="num">{cfg.edge_k}</dd>
        </dl>
        <p className="hint">These are set in the code, not here, so a decision made last month was made under the same rules as one made today.</p>
      </section>
    </div>
  );
}

function Shortcuts() {
  return (
    <div className="card card-pad settings-card">
      <h2 className="panel-title">Keyboard shortcuts</h2>
      <ul className="shortcuts">{SHORTCUTS.map(([keys, text], i) => <li key={i}><span className="row tight">{keys.map((k, j) => (k === "to" ? <span key={j} className="muted">to</span> : <span key={j} className="kbd">{k}</span>))}</span><span className="muted">{text}</span></li>)}</ul>
    </div>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "profile";
  const View = { profile: Profile, security: Security, appearance: Appearance, system: System, shortcuts: Shortcuts }[tab];
  return (
    <div className="stack-lg">
      <header className="page-head"><div><h1>Settings</h1><p>Your account, how the app looks, and what it is running on.</p></div></header>
      <div className="tabs-row"><Segmented id="settings-tab" label="Settings section" value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} options={TABS.map(([value, label]) => ({ value, label }))} /></div>
      <View />
    </div>
  );
}
