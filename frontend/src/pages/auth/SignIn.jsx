import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";
import AuthShell, { Iris, useBounce } from "./AuthShell";
import { useAuth } from "../../lib/auth";

export default function SignIn() {
  const { signIn, meta } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [shake, setShake] = useState(0);
  const [welcome, setWelcome] = useState(null);
  const signing = useRef(false);
  useBounce(signing);

  const fail = (message) => { setError(message); setShake((n) => n + 1); };
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail("Enter the email address you signed up with.");
    if (!password) return fail("Enter your password.");
    setBusy(true);
    setError(null);
    signing.current = true;
    try {
      const user = await signIn(email.trim(), password, remember);
      setWelcome(user.name);
      setTimeout(() => navigate(state?.from?.pathname?.startsWith("/app") ? state.from.pathname : "/app/dashboard", { replace: true }), 1050);
    } catch (err) {
      signing.current = false;
      fail(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <AuthShell title="Welcome back" subtitle="Sign in to see what was inspected while you were away."
        footer={<>New here? <Link className="link" to="/signup">{meta.first_user ? "Create the first account" : "Create an account"}</Link></>}>
        <form className="auth-form" onSubmit={submit} noValidate key={shake} data-shake={shake ? "1" : undefined}>
          {error ? <div className="form-error shake" role="alert"><AlertCircle size={18} />{error}</div> : null}
          <label className="field">
            <span className="label">Email</span>
            <span className="input-icon"><Mail size={17} /><input className="input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !email} autoFocus /></span>
          </label>
          <label className="field">
            <span className="label">Password</span>
            <span className="input-icon input-wrap">
              <Lock size={17} />
              <input className="input" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="adorn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          <div className="row">
            <label className="checkbox"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in for 14 days</label>
            <Link to="/forgot" className="link spacer" style={{ fontSize: 14.5 }}>Forgot password?</Link>
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <><LoaderCircle size={18} className="spin" /> Signing in</> : <>Sign in <ArrowRight size={18} /></>}
          </button>
        </form>
      </AuthShell>
      <AnimatePresence>{welcome ? <Iris name={welcome} /> : null}</AnimatePresence>
    </>
  );
}
