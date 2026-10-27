import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../lib/auth";
import Logo, { LogoMark } from "../../components/Logo";
import ScannerCanvas from "../../components/ScannerCanvas";
import "./auth.css";

const TIPS = [
  "Every decision carries the name of the person who made it.",
  "A check can raise a score. It can never clear a defect.",
  "Wrong photos are refused, not guessed at.",
  "Edit one log entry and the chain visibly breaks.",
  "Normal is learned from your own good parts.",
];

function Tips() {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((k) => (k + 1) % TIPS.length), 4800); return () => clearInterval(id); }, []);
  return (
    <div className="auth-tip" aria-live="off">
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.45 }}>{TIPS[i]}</motion.p>
      </AnimatePresence>
      <div className="auth-dots" aria-hidden="true">{TIPS.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
    </div>
  );
}

// Someone who is already signed in has no business on a sign-in page. (Not while the welcome animation plays.)
export function useBounce(busyRef) {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (user && !busyRef.current) navigate("/app/dashboard", { replace: true }); }, [user, busyRef, navigate]);
}

// After signing in, an iris opens from the logo and the dashboard appears behind it.
export function Iris({ name }) {
  return (
    <motion.div className="iris-wipe" initial={{ clipPath: "circle(0% at 50% 50%)" }} animate={{ clipPath: "circle(150% at 50% 50%)" }}
      transition={{ duration: 0.95, ease: [0.7, 0, 0.2, 1] }} role="status" aria-live="polite">
      <motion.div className="iris-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, duration: 0.5 }}>
        <LogoMark size={72} spin />
        <p>Welcome{name ? `, ${name.split(" ")[0]}` : ""}</p>
      </motion.div>
    </motion.div>
  );
}

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Logo size={34} />
        <div className="auth-visual"><ScannerCanvas order={["break", "chip", "clean"]} ariaLabel="A looping scan of a bottle opening" /></div>
        <Tips />
      </aside>
      <main className="auth-main">
        <Link to="/" className="auth-back"><ArrowLeft size={16} /> Back to home</Link>
        <div className="auth-mobile-logo"><Logo size={30} /></div>
        <motion.div className="auth-card" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}>
          <header>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </header>
          {children}
        </motion.div>
        {footer ? <p className="auth-foot muted">{footer}</p> : null}
      </main>
    </div>
  );
}
