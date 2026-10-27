import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Info, LoaderCircle, Lock, Mail, User } from "lucide-react";
import AuthShell, { Iris, useBounce } from "./AuthShell";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL, ROLE_TEXT } from "../../lib/constants";

const RULES = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["12 or more is better", (p) => p.length >= 12],
  ["Upper and lower case", (p) => /[a-z]/.test(p) && /[A-Z]/.test(p)],
  ["A number or symbol", (p) => /[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)],
];
const LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];

export default function SignUp() {
  const { signUp, meta } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [welcome, setWelcome] = useState(null);
  const signing = useRef(false);
  useBounce(signing);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const checks = useMemo(() => RULES.map(([, fn]) => fn(form.password)), [form.password]);
  const strength = form.password.length < 8 ? 0 : checks.filter(Boolean).length;
  const closed = !meta.signup_open;
  const role = meta.first_user ? "admin" : meta.default_role;

  const fail = (message, f = null) => { setError(message); setField(f); };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return fail("Enter your name.", "name");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return fail("Enter a valid email address.", "email");
    if (form.password.length < 8) return fail("Use at least 8 characters.", "password");
    setBusy(true);
    setError(null);
    setField(null);
    signing.current = true;
    try {
      const user = await signUp(form.name.trim(), form.email.trim(), form.password);
      setWelcome(user.name);
      setTimeout(() => navigate("/app/dashboard", { replace: true }), 1050);
    } catch (err) {
      signing.current = false;
      fail(err.message, err.field);
      setBusy(false);
    }
  };

  return (
    <>
      <AuthShell title={meta.first_user ? "Create the first account" : "Create your account"}
        subtitle="It takes under a minute. Nothing leaves this computer."
        footer={<>Already have an account? <Link className="link" to="/signin">Sign in</Link></>}>
        <form className="auth-form" onSubmit={submit} noValidate>
          {closed ? <div className="form-note"><Info size={18} />Sign-ups are closed on this installation. Ask an administrator to create your account.</div> : (
            <div className="form-note"><Info size={18} /><span>{meta.first_user ? <>You are creating the first account, so it becomes the <b>administrator</b>. {ROLE_TEXT.admin}.</> : <>New accounts start as <b>{ROLE_LABEL[role]}</b>: {ROLE_TEXT[role].toLowerCase()}.</>}</span></div>
          )}
          {error ? <div className="form-error shake" role="alert"><AlertCircle size={18} />{error}</div> : null}
          <label className="field">
            <span className="label">Your name</span>
            <span className="input-icon"><User size={17} /><input className="input" autoComplete="name" placeholder="Ada Okafor" value={form.name} onChange={set("name")} aria-invalid={field === "name"} disabled={closed} autoFocus /></span>
          </label>
          <label className="field">
            <span className="label">Email</span>
            <span className="input-icon"><Mail size={17} /><input className="input" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set("email")} aria-invalid={field === "email"} disabled={closed} /></span>
          </label>
          <label className="field">
            <span className="label">Password</span>
            <span className="input-icon input-wrap">
              <Lock size={17} />
              <input className="input" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={set("password")} aria-invalid={field === "password"} disabled={closed} />
              <button type="button" className="adorn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          <div className="pw-meter" aria-live="polite">
            <div className="pw-bars" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={`s${strength} ${strength >= n ? "on" : ""}`} />)}</div>
            <div className="row"><span className="hint">Strength: <b style={{ color: "var(--text-2)" }}>{form.password ? LABELS[strength] : "-"}</b></span></div>
            <ul className="pw-rules">{RULES.map(([text], i) => <li key={text} className={checks[i] ? "ok" : ""}><Check size={14} />{text}</li>)}</ul>
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || closed}>
            {busy ? <><LoaderCircle size={18} className="spin" /> Creating your account</> : <>Create account <ArrowRight size={18} /></>}
          </button>
        </form>
      </AuthShell>
      <AnimatePresence>{welcome ? <Iris name={welcome} /> : null}</AnimatePresence>
    </>
  );
}
