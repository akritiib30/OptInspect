import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Crosshair, FileText, Fingerprint, Layers, ScanSearch, UserCheck } from "lucide-react";
import ScannerCanvas from "../../components/ScannerCanvas";
import HashChain from "../../components/HashChain";
import { TIMES } from "../../lib/scanner";
import { useMedia } from "../../lib/hooks";
import { ReviewMock } from "./visuals";

const STEPS = [
  { icon: Crosshair, title: "Line it up", text: "The good reference is shifted and turned until it sits exactly on your photo, and its lighting is matched. Without this, every edge would look like a defect." },
  { icon: Layers, title: "Compare", text: "What is left is a map of real differences. Small mismatches along strong edges are forgiven, because edges never line up perfectly." },
  { icon: ScanSearch, title: "Score", text: "Each difference is scored against the biggest difference ever seen on good photos of this product: normal is learned from your own good parts, not guessed." },
  { icon: FileText, title: "Look again", text: "Between 0.15 and 0.70 the agent tries a fresh comparison, a contrast boost and a zoom, up to three times. A check can raise a score. It can never clear a defect." },
  { icon: UserCheck, title: "Ask a person", text: "If it is still unsure, the case goes to a reviewer with the whole photo and the exact region, zoomed, next to the good reference. Their name goes on the decision." },
  { icon: Fingerprint, title: "Write it down", text: "Every step lands in a log where each entry carries a fingerprint of the one before it. Edit or delete an entry and the chain visibly breaks." },
];

const T = TIMES;
const A = T.idle + 0.25, B = T.idle + T.scan, Cc = B + T.lock, D = Cc + 3 * T.step;
const RANGES = [[0, A], [A, B], [B, Cc], [Cc, D]];
const lerp = (a, b, t) => a + (b - a) * t;

const CHAIN = [
  { text: "Inspection started by Rex" }, { text: "Detector found 2 possible defects" }, { text: "Compare result: 0.53 to 0.44" },
  { text: "Zoom result: 0.24 to 0.93" }, { text: "Decision for defect 1: confirmed" }, { text: "Inspection finished: defect found" },
];

export default function Walkthrough() {
  const ref = useRef(null);
  const narrow = useMedia("(max-width: 980px)");
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setP);
  const [tamper, setTamper] = useState(null);

  const f = Math.min(0.9999, Math.max(0, p)) * STEPS.length;
  const idx = Math.floor(f), q = f - idx;
  const time = idx <= 3 ? lerp(RANGES[idx][0], RANGES[idx][1], q) : D;

  return (
    <section className="walk" id="how" ref={ref} style={narrow ? undefined : { height: `${STEPS.length * 78}vh` }}>
      <div className={`walk-stick ${narrow ? "narrow" : ""}`}>
        <div className="container walk-grid">
          <div className="walk-copy">
            <h2 className="h2">How it decides</h2>
            <p className="sub">Six steps, in this order, every time. Scroll to run them.</p>
            <ol className="walk-steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const on = narrow || i === idx;
                return (
                  <motion.li key={s.title} className={`walk-step ${on ? "on" : ""} ${i < idx ? "done" : ""}`} animate={{ opacity: on ? 1 : 0.42 }} transition={{ duration: 0.3 }}>
                    <span className="ws-badge"><Icon size={17} /></span>
                    <div>
                      <h3>{s.title}</h3>
                      <AnimatePresence initial={false}>
                        {on ? (
                          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }}>{s.text}</motion.p>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
            {!narrow ? <div className="walk-rail" aria-hidden="true"><i style={{ height: `${Math.round(p * 100)}%` }} /></div> : null}
          </div>

          <div className="walk-visual">
            <AnimatePresence mode="wait">
              {narrow || idx <= 3 ? (
                <motion.div key="scan" className="walk-pane" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3 }}>
                  <div className="lens small"><ScannerCanvas scenario="break" time={narrow ? null : time} ariaLabel="The scanner, driven by how far you have scrolled" /></div>
                </motion.div>
              ) : idx === 4 ? (
                <motion.div key="review" className="walk-pane" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
                  <ReviewMock />
                </motion.div>
              ) : (
                <motion.div key="chain" className="walk-pane" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
                  <div className="card card-pad chain-card">
                    <HashChain entries={CHAIN} tamperAt={tamper} compact />
                    <button className="btn btn-ghost btn-sm" onClick={() => setTamper(tamper == null ? 3 : null)}>
                      {tamper == null ? "Try to change an entry" : "Put it back"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
