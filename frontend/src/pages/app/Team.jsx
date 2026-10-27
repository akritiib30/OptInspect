import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Download, KeyRound, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { Avatar, Modal, Skeleton } from "../../components/bits";
import { api } from "../../lib/api";
import { clearCache, useApi, useNow } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { ago, fmtDate } from "../../lib/format";
import { ROLE_LABEL, ROLE_TEXT } from "../../lib/constants";

function Secret({ title, person, password, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open title={title} onClose={onClose} width={500} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p><b>{person}</b> must choose a new password the first time they sign in. This temporary password is shown only once.</p>
      <div className="secret"><code>{password}</code>
        <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button></div>
      <p className="hint">Send it to them privately. Do not paste it into chat or email you do not control.</p>
    </Modal>
  );
}

function AddPerson({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", role: "reviewer" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api("/api/users", { method: "POST", body: form });
      onCreated(r);
      setForm({ name: "", email: "", role: "reviewer" });
      toast.ok("Account created", `${r.user.name} can sign in with the temporary password.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a person" width={500} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.name.trim() || !form.email.trim()} onClick={submit}>{busy ? <LoaderCircle size={16} className="spin" /> : null} Create account</button></>}>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <label className="field"><span className="label">Name</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mina Cho" /></label>
      <label className="field"><span className="label">Email</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="mina@company.com" /></label>
      <label className="field"><span className="label">Role</span>
        <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="hint">{ROLE_TEXT[form.role]}.</span></label>
    </Modal>
  );
}

export default function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(30000);
  const { data, reload, setData } = useApi("/api/users", { interval: 15000 });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState(null);
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(null);

  if (!data) return <Skeleton h={460} r={18} />;
  const patch = async (u, change, ok) => {
    setBusy(u.id);
    try {
      const r = await api(`/api/users/${u.id}`, { method: "PATCH", body: change });
      setData({ ...data, users: data.users.map((x) => (x.id === u.id ? r.user : x)) });
      toast.ok(ok);
    } catch (e) { toast.error("Could not save that change", e.message); } finally { setBusy(null); }
  };
  const reset = async (u) => {
    if (!window.confirm(`Reset ${u.name}'s password? They will be signed out everywhere.`)) return;
    try { const r = await api(`/api/users/${u.id}/reset-password`, { method: "POST" }); setSecret({ title: "Temporary password", person: u.name, password: r.temporary_password }); reload(); }
    catch (e) { toast.error("Could not reset the password", e.message); }
  };
  const settings = async (change) => {
    try { const s = await api("/api/settings", { method: "PATCH", body: change }); setData({ ...data, settings: s }); toast.ok("Setting saved"); }
    catch (e) { toast.error("Could not save the setting", e.message); }
  };

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Team</h1><p>Who can sign in, and what they can do. Every decision in the audit log carries the name of the person who made it.</p></div>
        <div className="actions"><button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={17} /> Add a person</button></div>
      </header>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Active</th><th>Last signed in</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {data.users.map((u, n) => {
                const me = u.id === user.id;
                return (
                  <motion.tr key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.03 }}>
                    <td><div className="row"><Avatar name={u.name} size={38} /><div><b>{u.name}</b>{me ? <span className="chip" style={{ marginLeft: 8 }}>you</span> : null}<div className="faint small">{u.email}</div></div></div></td>
                    <td><select className="select input-sm" style={{ width: 150 }} value={u.role} disabled={me || busy === u.id} onChange={(e) => patch(u, { role: e.target.value }, `${u.name} is now a ${ROLE_LABEL[e.target.value].toLowerCase()}`)} aria-label={`Role for ${u.name}`}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td><span className="switch"><input type="checkbox" checked={u.active} disabled={me || busy === u.id} onChange={(e) => patch(u, { active: e.target.checked }, e.target.checked ? `${u.name} can sign in again` : `${u.name} is signed out and disabled`)} aria-label={`${u.name} active`} /></span></td>
                    <td>{u.last_login ? ago(u.last_login, now) : <span className="faint">never</span>}</td>
                    <td>{fmtDate(u.created)}</td>
                    <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => reset(u)} disabled={me}><KeyRound size={15} /> Reset password</button></td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid g-12">
        <section className="card card-pad span-6">
          <h2 className="panel-title">Roles</h2>
          <ul className="role-list">{Object.entries(ROLE_LABEL).map(([k, v]) => <li key={k}><span className={`tag ${k === "admin" ? "warn" : k === "reviewer" ? "info" : "mute"}`}>{v}</span><span className="muted">{ROLE_TEXT[k]}.</span></li>)}</ul>
          <p className="hint" style={{ marginTop: 12 }}>There must always be at least one active administrator, and you cannot change your own role or disable yourself here.</p>
        </section>
        <section className="card card-pad span-6">
          <h2 className="panel-title">Sign-up</h2>
          <div className="setting-row"><div><b>Allow people to create their own account</b><p className="hint">Turn this off once everyone has one. New people are then added here.</p></div>
            <span className="switch"><input type="checkbox" checked={!!data.settings.signup_open} onChange={(e) => settings({ signup_open: e.target.checked })} aria-label="Allow self sign-up" /></span></div>
          <div className="setting-row"><div><b>Role for new sign-ups</b><p className="hint">Administrators are always added by an administrator.</p></div>
            <select className="select input-sm" style={{ width: 140 }} value={data.settings.default_role} onChange={(e) => settings({ default_role: e.target.value })} aria-label="Default role"><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option></select></div>
        </section>
      </div>

      <section className="card card-pad export-card">
        <div className="row"><ShieldCheck size={22} /><div className="grow"><h2>Export everything</h2><p className="muted">One zip with every result, audit log (with its end marker, so it can be verified elsewhere) and comment.</p></div>
          <label className="checkbox"><input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Include photos</label>
          <a className="btn btn-ghost" href={`/api/export${photos ? "?photos=1" : ""}`}><Download size={16} /> Download zip</a></div>
      </section>

      <AddPerson open={adding} onClose={() => setAdding(false)} onCreated={(r) => { setAdding(false); setSecret({ title: "Account created", person: r.user.name, password: r.temporary_password }); clearCache("/api/users"); reload(); }} />
      {secret ? <Secret {...secret} onClose={() => setSecret(null)} /> : null}
    </div>
  );
}
