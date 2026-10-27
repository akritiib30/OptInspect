import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Columns2, Contrast, Copy, Download, Image as ImageIcon, Layers, LoaderCircle, MessageSquarePlus, Printer, ShieldCheck, SlidersHorizontal, UserCheck } from "lucide-react";
import Viewer from "../../components/Viewer";
import ScoreTrack from "../../components/ScoreTrack";
import ZoomTriplet from "../../components/ZoomTriplet";
import { Avatar, EmptyState, Segmented, Skeleton, StatusTag, VerdictTag } from "../../components/bits";
import { api } from "../../lib/api";
import { clearCache, useApi, useHotkeys, useNow } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { ago, downloadFile, fmtTime, num, prettyName } from "../../lib/format";
import { REASONS, ROLE_LABEL, SOURCES, STATUSES, TOOLS, colorOf, toneOf } from "../../lib/constants";

const MODES = [
  { value: "test", label: "Photo", icon: <ImageIcon size={15} /> }, { value: "reference", label: "Reference", icon: <Layers size={15} /> },
  { value: "diff", label: "Difference", icon: <Contrast size={15} /> }, { value: "blend", label: "Blend", icon: <SlidersHorizontal size={15} /> },
  { value: "split", label: "Split", icon: <Columns2 size={15} /> },
];
const CAPTIONS = {
  test: "Boxes mark where the detector saw a difference. Select one to jump to that defect. Scroll to zoom, drag to pan, double-click to zoom in.",
  reference: "The good sample, lined up with this photo and matched for lighting.",
  diff: "Brighter means a bigger difference from the good sample. Full brightness is twice the largest difference ever seen on a good photo.",
  blend: "Slide to fade between the good sample and this photo.",
  split: "Slide to wipe between the good sample (right) and this photo (left) on the same spot.",
};
const DECISION_WORDS = { defect: "it is a defect", ok: "it is fine", unsure: "not sure, passed to an expert" };

function Steps({ history }) {
  return (
    <ol className="steps">
      {history.map((h, i) => {
        const T = TOOLS[h.by] || TOOLS.detector;
        const Icon = T.icon;
        const prev = i ? history[i - 1].score : null;
        const delta = prev == null ? null : h.score - prev;
        return (
          <li key={i}>
            <span className="st-icon"><Icon size={16} /></span>
            <div><b>{T.label}</b><small>{h.reason}</small></div>
            <span className="num st-score">{num(h.score)}{delta != null ? <em className={delta > 0.005 ? "up" : delta < -0.005 ? "down" : ""}>{delta > 0 ? "+" : ""}{delta.toFixed(2)}</em> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

function InlineDecision({ id, index, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const send = async (decision) => {
    setBusy(decision);
    try {
      const r = await api(`/api/review/${id}`, { method: "POST", body: { defect: index, decision, note } });
      toast.ok("Decision saved", `Recorded under your name: ${DECISION_WORDS[decision]}.`);
      onDone(r);
    } catch (e) { toast.error("Could not save the decision", e.message); setBusy(null); }
  };
  return (
    <div className="inline-decision">
      <div className="chips-row">{REASONS.map((r) => <button key={r} type="button" className="filter-chip" onClick={() => setNote((n) => (n ? `${n}, ${r.toLowerCase()}` : r))}>{r}</button>)}</div>
      <textarea className="input" placeholder="What did you see? (saved with your decision)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Note" />
      <div className="row">
        <button className="btn btn-danger" disabled={!!busy} onClick={() => send("defect")}>{busy === "defect" ? <LoaderCircle size={16} className="spin" /> : null} It is a defect</button>
        <button className="btn btn-good" disabled={!!busy} onClick={() => send("ok")}>{busy === "ok" ? <LoaderCircle size={16} className="spin" /> : null} It is fine</button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => send("unsure")}>Ask an expert</button>
      </div>
    </div>
  );
}

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const now = useNow(30000);
  const { data: result, error, setData: setResult } = useApi(`/api/result/${id}`);
  const { data: log, reload: reloadLog } = useApi(`/api/log/${id}`);
  const { data: comments, setData: setComments } = useApi(`/api/inspections/${id}/comments`);
  const { data: cfg } = useApi("/api/config");
  const { data: list } = useApi("/api/inspections?limit=500");
  const [mode, setMode] = useState("test");
  const [boxes, setBoxes] = useState(true);
  const [selected, setSelected] = useState(null);
  const [focusKey, setFocusKey] = useState(0);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const events = log?.events || [];
  const waiting = result?.defects.filter((d) => d.status === "NEEDS_REVIEW") || [];
  useEffect(() => { setSelected(null); setMode("test"); }, [id]);
  useEffect(() => { if (result && selected == null && result.defects.length) setSelected(waiting.length ? waiting[0].defect : 0); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = list ? list.findIndex((x) => x.inspection_id === id) : -1;
  const newer = pos > 0 ? list[pos - 1] : null;
  const older = pos >= 0 && list && pos < list.length - 1 ? list[pos + 1] : null;
  const pick = (i) => { setSelected(i); setFocusKey((k) => k + 1); document.getElementById(`defect-${i}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

  useHotkeys({
    1: () => setMode("test"), 2: () => setMode("reference"), 3: () => setMode("diff"), 4: () => setMode("blend"), 5: () => setMode("split"),
    b: () => setBoxes((v) => !v),
    "[": () => result && selected > 0 && pick(selected - 1),
    "]": () => result && selected < result.defects.length - 1 && pick((selected ?? -1) + 1),
  });

  if (error?.status === 404 || error?.status === 400) {
    return <div className="card"><EmptyState title="That inspection does not exist" text="It may have been mistyped, or it belongs to a different installation."><Link to="/app/inspections" className="btn btn-primary">Back to inspections</Link></EmptyState></div>;
  }
  if (!result || !cfg) return <div className="grid g-12"><Skeleton h={560} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={560} r={18} style={{ gridColumn: "span 4" }} /></div>;

  const rejected = result.verdict === "INVALID_PHOTO";
  const rej = events.find((e) => e.event === "input_rejected")?.details || {};
  const started = events.find((e) => e.event === "inspection_started");
  const thresholds = { dismiss: cfg.dismiss, confirm: cfg.confirm };

  const decided = (r) => { setResult(r); clearCache("/api/"); reloadLog(); };
  const post = async () => {
    setPosting(true);
    try {
      const c = await api(`/api/inspections/${id}/comments`, { method: "POST", body: { text } });
      setComments([...(comments || []), c]);
      setText("");
      reloadLog();
    } catch (e) { toast.error("Could not post the comment", e.message); } finally { setPosting(false); }
  };

  return (
    <div className="stack-lg detail">
      <header className="page-head">
        <div>
          <Link to="/app/inspections" className="crumb"><ArrowLeft size={15} /> All inspections</Link>
          <h1>{prettyName(result.photo_name)}</h1>
          <p>Product <b>{result.product}</b>, inspected {fmtTime(result.created)} by {result.created_by?.name || "unknown"}{result.source ? `, from ${(SOURCES[result.source] || result.source).toLowerCase()}` : ""} ({ago(result.created, now)}).</p>
        </div>
        <div className="actions">
          <button className="btn btn-quiet btn-icon" disabled={!older} onClick={() => navigate(`/app/inspections/${older.inspection_id}`)} aria-label="Older inspection" title="Older inspection"><ChevronLeft size={18} /></button>
          <button className="btn btn-quiet btn-icon" disabled={!newer} onClick={() => navigate(`/app/inspections/${newer.inspection_id}`)} aria-label="Newer inspection" title="Newer inspection"><ChevronRight size={18} /></button>
          <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.ok("Link copied"); }}><Copy size={16} /> Copy link</button>
          <button className="btn btn-ghost no-print" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn btn-ghost" onClick={() => downloadFile(`inspection-${id}.json`, JSON.stringify({ exported_at: new Date().toISOString(), result, log_intact: log?.intact ?? null, log: events, comments: comments || [] }, null, 2))}><Download size={16} /> Export</button>
        </div>
      </header>

      <div className="grid g-12">
        <section className="card span-8 viewer-card">
          <div className="card-head">
            <VerdictTag value={result.verdict} />
            {!rejected ? <Segmented id="vmode" label="View" options={MODES} value={mode} onChange={setMode} /> : null}
            {!rejected && ["test", "diff"].includes(mode) ? <label className="checkbox spacer"><input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} /> Show boxes</label> : null}
          </div>
          <div className="card-body">
            <Viewer result={result} mode={rejected ? "test" : mode} showBoxes={boxes && !rejected} selected={selected} onSelect={pick} focusKey={focusKey} />
            <p className="caption">{rejected ? "This photo was not inspected." : CAPTIONS[mode]}</p>
            <p className="hint no-print">Shortcuts: <span className="kbd">1</span> to <span className="kbd">5</span> change view, <span className="kbd">B</span> boxes, <span className="kbd">[</span> <span className="kbd">]</span> previous and next defect, <span className="kbd">+</span> <span className="kbd">-</span> <span className="kbd">0</span> zoom.</p>
          </div>
        </section>

        <div className="span-4 stack">
          <section className="card card-pad">
            <h2 className="panel-title">Summary</h2>
            <dl className="facts">
              <dt>Verdict</dt><dd><VerdictTag value={result.verdict} /></dd>
              <dt>Possible defects</dt><dd>{result.defects.length}{waiting.length ? `, ${waiting.length} waiting for a person` : ""}</dd>
              <dt>Calibrated</dt><dd>{started?.details?.calibrated ? `Yes, normal level ${num(started.details.normal_level, 1)}` : "No"}</dd>
              <dt>Photo</dt><dd>{(result.display_size || []).join(" x ")} px, analysed at {(result.work_size || []).join(" x ")}</dd>
              <dt>Analysis time</dt><dd>{result.duration_ms != null ? `${result.duration_ms} ms` : "-"}</dd>
              <dt>Audit log</dt><dd>{log ? (log.intact ? <span className="tag ok">Intact</span> : <span className="tag bad">Altered</span>) : "-"} <Link to={`/app/audit/${id}`} className="link">Open</Link></dd>
              <dt>Id</dt><dd className="num">{id}</dd>
            </dl>
          </section>

          {rejected ? (
            <section className="card card-pad">
              <h2 className="panel-title">Why it was not inspected</h2>
              <p>This does not look like a photo of the selected product, so no defects were searched for. Check the file and the product.</p>
              <dl className="facts" style={{ marginTop: 14 }}>
                <dt>Reason</dt><dd>{result.reason || rej.reason || "-"}</dd>
                <dt>Shape match</dt><dd>{num(rej.structure_match)} (a photo of this product needs at least {cfg.min_structure.toFixed(2)})</dd>
                <dt>Pixels that differ</dt><dd>{Math.round((rej.share_unlike || 0) * 100)}%</dd>
              </dl>
              {can.inspect ? <Link to={`/app/inspect?product=${result.product}`} className="btn btn-ghost" style={{ marginTop: 16 }}>Try another photo</Link> : null}
            </section>
          ) : !result.defects.length ? (
            <section className="card card-pad"><h2 className="panel-title">No defects</h2><p className="muted">Nothing rose above the normal level for this product, so there is nothing to review.</p></section>
          ) : (
            <section className="card">
              <div className="card-head"><h2>Defects ({result.defects.length})</h2></div>
              <div className="defects">
                {result.defects.map((d, i) => {
                  const open = selected === i;
                  const human = events.find((e) => e.event === "human_review" && e.details.defect === i);
                  return (
                    <article key={i} id={`defect-${i}`} className={`defect-card ${open ? "sel" : ""}`}>
                      <button className="dc-head" onClick={() => (open ? setSelected(null) : pick(i))} aria-expanded={open}>
                        <span className="badge-n" style={{ background: colorOf(STATUSES, d.status) }}>{i + 1}</span>
                        <StatusTag value={d.status} />
                        <span className="num muted">{num(d.final_score)}</span>
                        <ChevronDown size={18} className="dc-chev" />
                      </button>
                      <AnimatePresence initial={false}>
                        {open ? (
                          <motion.div className="dc-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
                            <div className="dc-inner">
                              <ScoreTrack history={d.history} tone={toneOf(STATUSES, d.status)} cfg={thresholds} />
                              <Steps history={d.history} />
                              <ZoomTriplet result={result} defect={d} />
                              {human ? <div className="note-box"><UserCheck size={17} /><span><b>{human.who}</b> decided: {DECISION_WORDS[human.details.decision]}.{human.details.note ? ` "${human.details.note}"` : ""}</span></div> : null}
                              {d.status === "NEEDS_REVIEW" ? (can.review ? <InlineDecision id={id} index={i} onDone={decided} /> : <p className="hint">Waiting for a reviewer. Your role can look but not decide.</p>) : null}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="panel-title">Comments {comments?.length ? <span className="chip">{comments.length}</span> : null}</h2>
            <ul className="comments">
              {(comments || []).map((c) => (
                <li key={c.id}><Avatar name={c.author} size={32} /><div><b>{c.author}</b> <span className="chip">{ROLE_LABEL[c.role] || c.role}</span> <small>{ago(c.time, now)}</small><p>{c.text}</p></div></li>
              ))}
              {!comments?.length ? <li className="muted">No comments yet.</li> : null}
            </ul>
            {can.review ? (
              <div className="comment-form no-print">
                <textarea className="input" placeholder={`Add a note for the team, ${user.name.split(" ")[0]}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Comment" />
                <button className="btn btn-primary btn-sm" disabled={!text.trim() || posting} onClick={post}>{posting ? <LoaderCircle size={15} className="spin" /> : <MessageSquarePlus size={15} />} Post comment</button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
