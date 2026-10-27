import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Play, RotateCcw } from "lucide-react";
import ScannerCanvas from "../../components/ScannerCanvas";
import ScoreTrack from "../../components/ScoreTrack";
import HashChain from "../../components/HashChain";
import { Segmented } from "../../components/bits";
import { SCENARIOS } from "../../lib/scanner";

const OPTIONS = [{ value: "break", label: "Broken rim" }, { value: "chip", label: "Small chip" }, { value: "clean", label: "Normal bottle" }];
const TONE = { break: "bad", chip: "warn", clean: "ok" };
const OUTCOME = {
  break: "Defect confirmed. The first look was unsure, two checks did not help, and the zoom lifted the score above 0.70.",
  chip: "Needs a person. The checks lowered the score, but a check can never clear a defect, so a person decides.",
  clean: "Passed. Nothing rose above the normal level for this product.",
};
const DECISIONS = { defect: "it is a defect", ok: "it is fine", unsure: "not sure, passed to an expert" };

export default function Demo() {
  const [scenario, setScenario] = useState("break");
  const [runKey, setRunKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [info, setInfo] = useState(null);
  const [decision, setDecision] = useState(null);
  const [tamper, setTamper] = useState(null);
  const sc = SCENARIOS[scenario];

  useEffect(() => { setStarted(false); setDecision(null); setInfo(null); setTamper(null); }, [scenario]);
  const run = () => { setStarted(true); setDecision(null); setTamper(null); setRunKey((k) => k + 1); };

  const d0 = sc.defects[0];
  const reached = !info || ["idle", "scan"].includes(info.phase) || !started ? -1 : Math.min(info.stepIdx, d0 ? d0.steps.length - 1 : 0);
  const history = d0 && started ? d0.steps.slice(0, reached + 1).map(([name, score]) => ({ by: name.toLowerCase(), score })) : [];
  const finished = started && info && (info.phase === "verdict" || info.phase === "hold");

  const entries = useMemo(() => {
    const list = [{ text: "Inspection started by you" }, { text: `Detector found ${sc.defects.length} possible defect${sc.defects.length === 1 ? "" : "s"}` }];
    sc.defects[0]?.steps.slice(1).forEach(([name, score], i) => list.push({ text: `${name} result for defect 1: ${score.toFixed(2)}` }));
    list.push({ text: `Decision: ${sc.verdictText}` });
    if (decision) list.push({ text: `A person reviewed defect 1: ${DECISIONS[decision]}` });
    list.push({ text: "Inspection finished" });
    return list;
  }, [sc, decision]);

  return (
    <section className="section demo" id="demo">
      <div className="container">
        <div className="section-head">
          <h2 className="h2">Run an inspection right here</h2>
          <p className="sub">A walkthrough with scores recorded from real runs. Sign in to inspect real photos.</p>
        </div>

        <div className="demo-grid">
          <div className="demo-stage card">
            <div className="demo-bar">
              <Segmented id="demo-seg" label="Choose a bottle" options={OPTIONS} value={scenario} onChange={setScenario} />
              <button className="btn btn-primary" onClick={run}>{started ? <RotateCcw size={16} /> : <Play size={16} />} {started ? "Run again" : "Run inspection"}</button>
            </div>
            <div className="lens small">
              <ScannerCanvas scenario={scenario} runKey={runKey} paused={!started} onChange={setInfo} label={sc.title} />
            </div>
            <p className="demo-note">{sc.note}</p>
          </div>

          <div className="demo-side">
            <div className="card card-pad">
              <h3 className="demo-h">What the agent is doing</h3>
              <div className="demo-track">
                {history.length ? <ScoreTrack history={history} tone={TONE[scenario]} /> : <p className="muted">{sc.defects.length || !started ? "Press Run inspection to start." : "Looking for differences..."}</p>}
              </div>
              <AnimatePresence mode="wait">
                {finished ? (
                  <motion.div key={`${scenario}-done`} className={`outcome ${TONE[scenario]}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <b>{sc.verdictText}</b>
                    <p>{OUTCOME[scenario]}</p>
                    {scenario === "chip" && !decision ? (
                      <div className="rm-buttons">
                        <span className="muted">You decide:</span>
                        <button className="btn btn-sm btn-danger" onClick={() => setDecision("defect")}>It is a defect</button>
                        <button className="btn btn-sm btn-good" onClick={() => setDecision("ok")}>It is fine</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setDecision("unsure")}>Ask an expert</button>
                      </div>
                    ) : null}
                    {decision ? <p className="rm-saved"><Check size={16} /> Saved, then sealed in the record below.</p> : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="card card-pad">
              <div className="row">
                <h3 className="demo-h">The record</h3>
                {finished ? <button className="btn btn-ghost btn-sm spacer" onClick={() => setTamper(tamper == null ? 1 : null)}>{tamper == null ? "Try to change an entry" : "Put it back"}</button> : null}
              </div>
              {finished ? <HashChain entries={entries} tamperAt={tamper} compact /> : <p className="muted">Entries appear here, each sealed to the one before it.</p>}
            </div>

            <Link to="/signup" className="btn btn-ghost demo-cta">Inspect your own photos <ArrowRight size={16} /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
