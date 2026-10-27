import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lock, Play } from "lucide-react";
import ScannerCanvas from "../../components/ScannerCanvas";
import Counter from "../../components/Counter";
import { SCENARIOS } from "../../lib/scanner";
import { fakeHash } from "../../lib/format";
import { useAuth } from "../../lib/auth";

const PHASES = ["idle", "scan", "lock", "clear", "recheck", "verdict", "hold"];

// What the agent "says" at this moment of the scan: a plain-language trail of what it is doing.
export function feedLines(info) {
  if (!info) return [];
  const sc = SCENARIOS[info.scenario];
  const at = PHASES.indexOf(info.phase);
  const out = [{ key: "align", tone: "info", text: "Reference lined up with the photo" }];
  if (at >= 1) out.push({ key: "cmp", tone: "info", text: "Comparing with the good sample" });
  if (at >= 2) out.push(sc.defects.length
    ? { key: "found", tone: "warn", text: `${sc.defects.length} possible defect${sc.defects.length > 1 ? "s" : ""} found` }
    : { key: "none", tone: "ok", text: "Nothing above the normal level" });
  const d0 = sc.defects[0];
  if (d0 && at >= 4) {
    const upto = at >= 5 ? d0.steps.length - 1 : info.stepIdx;
    for (let k = 1; k <= upto; k += 1) out.push({ key: `s${k}`, tone: "warn", text: `${d0.steps[k][0]} ${d0.steps[k][1].toFixed(2)}: ${d0.steps[k][2]}` });
  }
  if (at >= 5) {
    out.push({ key: "v", tone: sc.verdict === "defect" ? "bad" : sc.verdict === "review" ? "warn" : "ok",
      text: sc.verdict === "review" ? "A check cannot clear a defect, so a person decides" : sc.verdictText });
    out.push({ key: "h", tone: "mute", text: `Sealed in the log, fingerprint ${fakeHash(sc.id)}` });
  }
  return out.slice(-5);
}

export function AgentFeed({ info, className = "" }) {
  const lines = feedLines(info);
  return (
    <div className={`feed ${className}`} aria-live="off">
      <div className="feed-head"><span className="dot-live" /> Agent log <small>illustration of a recorded run</small></div>
      <ul>
        <AnimatePresence initial={false} mode="popLayout">
          {lines.map((l) => (
            <motion.li key={`${info.scenario}-${l.key}`} layout className={`feed-line ${l.tone}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
              <i />{l.text}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

const Line = ({ i, children }) => (
  <span className="line">
    <motion.span initial={{ y: "112%" }} animate={{ y: 0 }} transition={{ duration: 0.95, delay: 0.12 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.span>
  </span>
);

export default function Hero() {
  const [info, setInfo] = useState(null);
  const { user } = useAuth();
  const words = ["Inspection", "that takes a", "second look."];

  return (
    <section className="hero" id="top">
      <div className="hero-bg" aria-hidden="true"><div className="rings" /><div className="glow g1" /><div className="glow g2" /><div className="glow g3" /></div>
      <div className="container hero-grid">
        <div className="hero-copy">
          <motion.div className="note-pill" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Lock size={14} /> Runs on your computer. No cloud.
          </motion.div>
          <div className="display-wrap">
            <h1 className="display" aria-label="Inspection that takes a second look.">
              {words.map((w, i) => <Line key={w} i={i}>{w}</Line>)}
            </h1>
            <div className="display glint" aria-hidden="true">{words.map((w) => <span className="line" key={w}><span>{w}</span></span>)}</div>
          </div>
          <motion.p className="lede" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.7 }}>
            OptiInspect finds defects in product photos, checks itself when it is unsure, hands the hard cases to a person, and writes every step into a record nobody can quietly change.
          </motion.p>
          <motion.div className="row ctas" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.7 }}>
            {user
              ? <Link to="/app/dashboard" className="btn btn-primary btn-lg">Open your dashboard <ArrowRight size={18} /></Link>
              : <Link to="/signup" className="btn btn-primary btn-lg">Get started <ArrowRight size={18} /></Link>}
            <a href="#demo" className="btn btn-ghost btn-lg"><Play size={16} /> See it work</a>
          </motion.div>
          <motion.ul className="hero-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}>
            <li><b><Counter value={57} /><span>/63</span></b><span>defects confirmed on real bottle photos</span></li>
            <li><b><Counter value={0} /><span>/20</span></b><span>good bottles wrongly confirmed</span></li>
            <li><b><Counter value={91} /></b><span>automated checks passing</span></li>
          </motion.ul>
          <p className="fineprint">Measured offline on 83 MVTec AD bottle photos. Three faint marks were missed. <a href="#results" className="link">See the full results</a></p>
        </div>

        <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
          <div className="lens">
            <ScannerCanvas onChange={setInfo} ariaLabel="A live, looping scan of a bottle opening: a defect is found, checked again, and a verdict is stamped" />
          </div>
          <AgentFeed info={info} />
        </motion.div>
      </div>
    </section>
  );
}
