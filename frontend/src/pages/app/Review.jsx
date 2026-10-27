import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCheck, Lock, LoaderCircle, SkipForward } from "lucide-react";
import Viewer from "../../components/Viewer";
import ScoreTrack from "../../components/ScoreTrack";
import ZoomTriplet from "../../components/ZoomTriplet";
import { EmptyState, Skeleton, StatusTag } from "../../components/bits";
import { api, thumbUrl } from "../../lib/api";
import { clearCache, useApi, useHotkeys, useNow } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { ago, num, prettyName } from "../../lib/format";
import { feedLine } from "../../lib/events";
import { REASONS, STATUSES, TOOLS, toneOf } from "../../lib/constants";

const DONE_WORDS = { defect: "Marked as a defect", ok: "Marked as fine", unsure: "Passed to an expert" };

export default function Review() {
  const { id: paramId, defect: paramDefect } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const now = useNow(30000);
  const { data: queue, reload, setData } = useApi("/api/review-queue", { interval: 8000 });
  const { data: cfg } = useApi("/api/config");
  const { data: activity } = useApi("/api/activity?limit=40", { interval: 8000 });
  const [sel, setSel] = useState(paramId ? `${paramId}:${paramDefect ?? 0}` : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [decidedThisSession, setDecided] = useState(0);
  const [dir, setDir] = useState(0);
  const [focusKey, setFocusKey] = useState(1);
  const noteRef = useRef(null);

  const items = useMemo(() => (queue || []).flatMap((r) => r.defects.filter((d) => d.status === "NEEDS_REVIEW").map((d) => ({ r, d, key: `${r.inspection_id}:${d.defect}` }))), [queue]);
  const idx = Math.max(0, items.findIndex((x) => x.key === sel));
  const cur = items[idx];
  const recent = (activity || []).filter((e) => e.event === "human_review").slice(0, 5);

  const choose = (key) => { setSel(key); setNote(""); setFocusKey((k) => k + 1); };
  const move = (n) => { if (items.length) choose(items[(idx + n + items.length) % items.length].key); };

  const decide = async (decision) => {
    if (!cur || busy || !can.review) return;
    setBusy(decision);
    try {
      await api(`/api/review/${cur.r.inspection_id}`, { method: "POST", body: { defect: cur.d.defect, decision, note } });
      toast.ok(DONE_WORDS[decision], "Saved under your name and sealed in the audit log.");
      setDir(decision === "defect" ? -1 : decision === "ok" ? 1 : 0);
      const next = items[idx + 1] || items[idx - 1];
      const newStatus = { defect: "HUMAN_DEFECT", ok: "HUMAN_OK", unsure: "NEEDS_EXPERT" }[decision];
      setData((queue || []).map((r) => (r.inspection_id === cur.r.inspection_id ? { ...r, defects: r.defects.map((d) => (d.defect === cur.d.defect ? { ...d, status: newStatus } : d)) } : r)));
      setDecided((n) => n + 1);
      choose(next?.key ?? null);
      clearCache("/api/");
      reload();
    } catch (e) { toast.error("Could not save the decision", e.message); } finally { setBusy(null); }
  };

  useHotkeys({ d: () => decide("defect"), o: () => decide("ok"), u: () => decide("unsure"), s: () => move(1), arrowright: () => move(1), arrowleft: () => move(-1) });

  if (!queue || !cfg) return <div className="grid g-12"><Skeleton h={520} r={18} style={{ gridColumn: "span 4" }} /><Skeleton h={520} r={18} style={{ gridColumn: "span 8" }} /></div>;

  const total = items.length + decidedThisSession;
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Review</h1><p>Defects the agent could not settle. Look at the exact region, decide, and your name goes on the decision in the audit log.</p></div>
        <div className="actions">
          {decidedThisSession ? <span className="session-pill"><CheckCheck size={16} /> {decidedThisSession} decided this session</span> : null}
        </div>
      </header>

      {total > 0 ? <div className="progress" aria-label="Session progress"><motion.i animate={{ width: `${(decidedThisSession / total) * 100}%` }} /></div> : null}

      {!can.review ? <div className="note-box"><Lock size={17} /><span>Your role can look at this queue but not decide. Ask an administrator to make you a reviewer.</span></div> : null}

      {!items.length ? (
        <div className="card">
          <EmptyState title={decidedThisSession ? "Queue cleared" : "Nothing is waiting for you"} text={decidedThisSession ? "Every unsure case has a decision. New ones appear the moment the agent is unsure again." : "When the agent cannot decide on its own, the case shows up here with the exact region to look at."}>
            <Link to="/app/inspections" className="btn btn-ghost">Browse inspections</Link>
            {can.inspect ? <Link to="/app/inspect" className="btn btn-primary">Inspect photos <ArrowRight size={16} /></Link> : null}
          </EmptyState>
        </div>
      ) : (
        <div className="review-grid">
          <aside className="stack">
            <section className="card queue-card">
              <div className="card-head"><h2>Waiting ({items.length})</h2></div>
              <ul className="queue-list">
                {items.map((x) => (
                  <li key={x.key}>
                    <button className={x.key === cur.key ? "on" : ""} onClick={() => choose(x.key)} aria-current={x.key === cur.key}>
                      <img src={thumbUrl(x.r.inspection_id, 110)} alt="" />
                      <span><b>{prettyName(x.r.photo_name)}</b><small>Defect {x.d.defect + 1}, score {num(x.d.final_score)}, {x.d.tools_tried.length} extra checks</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {recent.length ? (
              <section className="card card-pad">
                <h2 className="panel-title">Decided recently</h2>
                <ul className="feed-list">
                  {recent.map((e) => { const l = feedLine(e); const Icon = l.icon; return (
                    <li key={`${e.inspection_id}-${e.step}`} className="feed-item"><span className={`fi-icon ${l.tone}`}><Icon size={16} /></span><Link className="fi-text" to={`/app/inspections/${e.inspection_id}`}>{l.text}</Link><span className="fi-time">{ago(e.time, now)}</span></li>
                  ); })}
                </ul>
              </section>
            ) : null}
          </aside>

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={cur.key} className="review-main" custom={dir}
              initial={{ opacity: 0, x: dir * -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * 70, scale: 0.98 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
              <div className="grid g-12">
                <section className="card span-7">
                  <div className="card-head">
                    <h2>{prettyName(cur.r.photo_name)}, defect {cur.d.defect + 1}</h2>
                    <StatusTag value={cur.d.status} />
                    <Link to={`/app/inspections/${cur.r.inspection_id}`} className="btn btn-quiet btn-sm spacer">Full inspection <ArrowRight size={15} /></Link>
                  </div>
                  <div className="card-body"><Viewer result={cur.r} only={cur.d.defect} selected={cur.d.defect} focusKey={focusKey} showBoxes /></div>
                </section>
                <section className="card card-pad span-5 stack">
                  <h2 className="panel-title">What the agent saw</h2>
                  <ScoreTrack history={cur.d.history} tone={toneOf(STATUSES, cur.d.status)} cfg={{ dismiss: cfg.dismiss, confirm: cfg.confirm }} />
                  <ul className="steps">
                    {cur.d.history.map((h, i) => { const T = TOOLS[h.by] || TOOLS.detector; const Icon = T.icon; return (
                      <li key={i}><span className="st-icon"><Icon size={16} /></span><div><b>{T.label}</b><small>{h.reason}</small></div><span className="num st-score">{num(h.score)}</span></li>
                    ); })}
                  </ul>
                  <ZoomTriplet result={cur.r} defect={cur.d} />
                </section>
              </div>

              <section className="card card-pad decision-card">
                <h2 className="panel-title">Your decision</h2>
                <p className="muted">The agent stopped at <b className="num">{num(cur.d.final_score)}</b>, between {cfg.dismiss} and {cfg.confirm}. A check can only confirm a defect, never clear one, so this one is yours to call.</p>
                <div className="chips-row">{REASONS.map((r) => <button key={r} type="button" className="filter-chip" onClick={() => { setNote((n) => (n ? `${n}, ${r.toLowerCase()}` : r)); noteRef.current?.focus(); }}>{r}</button>)}</div>
                <textarea ref={noteRef} className="input" placeholder="What did you see? (saved with your decision)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Note" disabled={!can.review} />
                <div className="row decision-row">
                  <button className="btn btn-danger btn-lg" disabled={!can.review || !!busy} onClick={() => decide("defect")}>{busy === "defect" ? <LoaderCircle size={17} className="spin" /> : null} It is a defect <span className="kbd">D</span></button>
                  <button className="btn btn-good btn-lg" disabled={!can.review || !!busy} onClick={() => decide("ok")}>{busy === "ok" ? <LoaderCircle size={17} className="spin" /> : null} It is fine <span className="kbd">O</span></button>
                  <button className="btn btn-ghost btn-lg" disabled={!can.review || !!busy} onClick={() => decide("unsure")}>Ask an expert <span className="kbd">U</span></button>
                  <button className="btn btn-quiet btn-lg spacer" onClick={() => move(1)} disabled={items.length < 2}><SkipForward size={17} /> Skip <span className="kbd">S</span></button>
                </div>
              </section>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
