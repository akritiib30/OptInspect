import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsRight, Lock, ShieldCheck, Stamp, TrendingUp } from "lucide-react";
import { Avatar } from "../../components/bits";
import ScoreTrack from "../../components/ScoreTrack";
import ScannerCanvas from "../../components/ScannerCanvas";
import { SCENARIOS, TIMES } from "../../lib/scanner";

// Small, self-running pictures used inside the feature tiles and the walkthrough.
// They illustrate how the product behaves; the numbers inside are recorded from real runs where they appear.

export function ReviewMock({ compact = false }) {
  const [picked, setPicked] = useState(null);
  const chip = SCENARIOS.chip;
  return (
    <div className={`review-mock ${compact ? "compact" : ""}`}>
      <div className="rm-photo">
        <ScannerCanvas scenario="chip" time={TIMES.idle + TIMES.scan + TIMES.lock + 3 * TIMES.step + 0.2} label="small chip" ariaLabel="The whole photo with the chip boxed" />
      </div>
      <div className="rm-side">
        <div className="rm-crops">
          {["Inspected", "Reference", "Difference"].map((t, i) => (
            <figure key={t}>
              <div className={`crop c${i}`}><span /></div>
              <figcaption>{t}</figcaption>
            </figure>
          ))}
        </div>
        <p className="rm-note">The agent stopped at <b className="num">0.07</b>. A check can never clear a defect, so this one is yours to call.</p>
        <div className="rm-buttons">
          {[["defect", "It is a defect", "btn-danger"], ["ok", "It is fine", "btn-good"], ["unsure", "Ask an expert", "btn-ghost"]].map(([k, label, cls]) => (
            <button key={k} className={`btn btn-sm ${cls}`} onClick={() => setPicked(k)} aria-pressed={picked === k}>{label}</button>
          ))}
        </div>
        <AnimatePresence>
          {picked ? (
            <motion.p className="rm-saved" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Check size={16} /> Saved with your name, then sealed in the log.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// A score track that keeps adding steps, over and over: the "looks again before it decides" picture.
export function LoopingTrack() {
  const steps = SCENARIOS.break.defects[0].steps.map(([name, score]) => ({ by: name.toLowerCase(), score }));
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((k) => (k >= steps.length ? 1 : k + 1)), 1500);
    return () => clearInterval(id);
  }, [steps.length]);
  return <ScoreTrack key={n === 1 ? "reset" : "run"} history={steps.slice(0, n)} tone="bad" />;
}

export function SafetyVisual() {
  const [lowered, setLowered] = useState(false);
  useEffect(() => { const id = setInterval(() => setLowered((v) => !v), 2400); return () => clearInterval(id); }, []);
  return (
    <div className="safety">
      <div className="safety-bar"><i style={{ width: "68%" }} /><motion.b animate={{ left: lowered ? "7%" : "68%" }} transition={{ type: "spring", stiffness: 120, damping: 18 }} /></div>
      <div className="safety-row">
        <span className="chip">Contrast check: 0.68 to 0.07</span>
        <ChevronsRight size={18} />
        <motion.span className="tag warn" animate={{ scale: lowered ? [1, 1.12, 1] : 1 }}><Lock size={13} /> still needs a person</motion.span>
      </div>
    </div>
  );
}

export function StampVisual() {
  return (
    <div className="stamp-visual" aria-hidden="true">
      <div className="screw"><span /><span /><span /></div>
      <motion.div className="stamp" animate={{ rotate: [-9, -6, -9], scale: [1, 1.04, 1] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
        <Stamp size={16} /> Not the product
      </motion.div>
    </div>
  );
}

export function NormalVisual() {
  return (
    <div className="normal-visual" aria-hidden="true">
      <svg viewBox="0 0 220 120">
        <defs><linearGradient id="nv" x1="0" x2="1"><stop offset="0" stopColor="#7b1fa2" /><stop offset=".5" stopColor="#e6446e" /><stop offset="1" stopColor="#ffd76b" /></linearGradient></defs>
        <path d="M10 110 A100 100 0 0 1 210 110" fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
        <motion.path d="M10 110 A100 100 0 0 1 210 110" fill="none" stroke="url(#nv)" strokeWidth="14" strokeLinecap="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 0.5 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }} />
        <text x="110" y="92" textAnchor="middle" className="nv-big">13.8</text>
        <text x="110" y="112" textAnchor="middle" className="nv-small">normal level, from 40 good photos</text>
      </svg>
    </div>
  );
}

const SPARK = [3, 5, 4, 7, 6, 9, 8, 12, 10, 14, 13, 17, 15, 19];
export function LiveVisual() {
  const max = Math.max(...SPARK);
  return (
    <div className="live-visual" aria-hidden="true">
      <div className="lv-top"><span className="dot-live" /> Live <TrendingUp size={15} /></div>
      <div className="lv-bars">
        {SPARK.map((v, i) => (
          <motion.i key={i} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.04, type: "spring", stiffness: 160, damping: 16 }}
            style={{ height: `${(v / max) * 100}%`, transformOrigin: "bottom" }} />
        ))}
      </div>
    </div>
  );
}

export function RolesVisual() {
  const people = [["Ada Okafor", "Administrator"], ["Rex Lindqvist", "Reviewer"], ["Mina Cho", "Viewer"]];
  return (
    <ul className="roles-visual">
      {people.map(([name, role], i) => (
        <motion.li key={name} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
          <Avatar name={name} size={30} /><span>{name}</span><span className="chip">{role}</span>
        </motion.li>
      ))}
    </ul>
  );
}

export function FilesVisual() {
  const names = ["bottle_0412.png", "bottle_0413.png", "bottle_0414.png"];
  return (
    <div className="files-visual" aria-hidden="true">
      {names.map((n, i) => (
        <motion.div key={n} className="file-chip" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
          <i /> {n} <span className={`tag plain ${i === 1 ? "bad" : "ok"}`}>{i === 1 ? "defect" : "passed"}</span>
        </motion.div>
      ))}
    </div>
  );
}

export function ChainVisual() {
  const [n, setN] = useState(2);
  useEffect(() => { const id = setInterval(() => setN((k) => (k >= 5 ? 2 : k + 1)), 1100); return () => clearInterval(id); }, []);
  return (
    <div className="chain-visual" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <motion.span key={i} className="block" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
          <ShieldCheck size={14} />
        </motion.span>
      ))}
    </div>
  );
}

// ---------- the labs ----------
const STRESS_STEPS = [
  { strength: 0.2, tone: "mute", text: "Not noticed", score: "" },
  { strength: 0.5, tone: "warn", text: "Sent to a person", score: "0.42" },
  { strength: 0.95, tone: "bad", text: "Caught", score: "0.92" },
];
export function StressVisual() {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => (v + 1) % STRESS_STEPS.length), 2000); return () => clearInterval(id); }, []);
  const s = STRESS_STEPS[i];
  return (
    <div className="sv" aria-hidden="true">
      <div className="sv-photo"><motion.i animate={{ opacity: s.strength, scale: 0.8 + s.strength * 0.5 }} transition={{ duration: 0.6 }} /></div>
      <div className="sv-side">
        <span className="muted">Paint strength</span>
        <div className="sv-meter"><motion.i animate={{ width: `${s.strength * 100}%` }} transition={{ duration: 0.6 }} /></div>
        <AnimatePresence mode="wait"><motion.span key={s.text} className={`tag ${s.tone}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{s.text} {s.score}</motion.span></AnimatePresence>
      </div>
    </div>
  );
}

export function ChallengeVisual() {
  const [round, setRound] = useState(0);
  useEffect(() => { const id = setInterval(() => setRound((v) => (v + 1) % 5), 1500); return () => clearInterval(id); }, []);
  const you = [0, 1, 3, 4, 6][round], agent = [0, 2, 3, 5, 6][round];
  return (
    <div className="cv" aria-hidden="true">
      {[["You", you, "var(--gold)"], ["Agent", agent, "var(--info)"]].map(([who, n, c]) => (
        <div key={who} className="cv-row"><span>{who}</span><div><motion.i style={{ background: c }} animate={{ width: `${(n / 7) * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 20 }} /></div><b className="num">{n}</b></div>
      ))}
      <span className="chip">Round {round + 1} of 5: you both see the same photo</span>
    </div>
  );
}

const DOTS = { good: [0.02, 0.03, 0.05, 0.06, 0.08, 0.1, 0.11, 0.13, 0.14, 0.2], bad: [0.12, 0.35, 0.5, 0.62, 0.74, 0.8, 0.85, 0.88, 0.9, 0.93, 0.95, 0.97] };
const LINE_SETS = [{ d: 0.15, c: 0.7, text: "1 missed, 4 for a person" }, { d: 0.08, c: 0.45, text: "0 missed, 7 for a person" }];
export function LinesVisual() {
  const [k, setK] = useState(0);
  useEffect(() => { const id = setInterval(() => setK((v) => (v + 1) % LINE_SETS.length), 2600); return () => clearInterval(id); }, []);
  const { d, c, text } = LINE_SETS[k];
  const X = (v) => 10 + v * 280;
  const color = (v) => (v <= d ? "var(--ok)" : v >= c ? "var(--bad)" : "var(--warn)");
  return (
    <div className="lv" aria-hidden="true">
      <svg viewBox="0 0 300 104">
        {[["good", 30], ["bad", 74]].map(([lane, y]) => DOTS[lane].map((v, n) => {
          const mistake = (lane === "bad" && v <= d) || (lane === "good" && v >= c);
          return <circle key={`${lane}${n}`} cx={X(v)} cy={y + (n % 2 ? 7 : -7)} r="5" style={{ fill: color(v), transition: "fill .4s" }} stroke={mistake ? "var(--text)" : "none"} strokeWidth="2" />;
        }))}
        {[d, c].map((v, n) => <motion.line key={n} y1="6" y2="98" stroke="var(--gold)" strokeWidth="2" animate={{ x1: X(v), x2: X(v) }} transition={{ type: "spring", stiffness: 90, damping: 16 }} />)}
      </svg>
      <span className="chip">{text}</span>
    </div>
  );
}

export function HotspotVisual() {
  return (
    <div className="hv" aria-hidden="true">
      <div className="hv-photo">
        {[[62, 34, 54], [34, 66, 38], [74, 70, 30]].map(([x, y, s], n) => <motion.i key={n} style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }} animate={{ opacity: [0.55, 1, 0.55], scale: [0.9, 1.15, 0.9] }} transition={{ duration: 3 + n, repeat: Infinity, ease: "easeInOut" }} />)}
      </div>
      <div className="hv-side"><span className="muted">Confirmed defects, all inspections</span><b>38% sit in the top right</b><div className="hv-scale"><i /></div></div>
    </div>
  );
}
