import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Fingerprint, Link2, LoaderCircle, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Avatar, EmptyState, Segmented, Skeleton } from "../../components/bits";
import { api, thumbUrl } from "../../lib/api";
import { useApi, useDebounced, useNow } from "../../lib/hooks";
import { describeEvent, isPerson } from "../../lib/events";
import { ago, downloadFile, fmtTime, prettyName, toCsv } from "../../lib/format";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function VerifyPanel({ autorun }) {
  const [st, setSt] = useState({ status: "idle", data: null, shown: 0 });
  const started = useRef(false);
  const run = async () => {
    setSt({ status: "running", data: null, shown: 0 });
    try {
      const data = await api("/api/audit/verify");
      const n = data.items.length, step = Math.max(1, Math.ceil(n / 40)), wait = Math.min(70, 1500 / Math.max(1, n / step));
      for (let i = step; i < n + step; i += step) { await sleep(wait); setSt({ status: "running", data, shown: Math.min(i, n) }); }
      setSt({ status: "done", data, shown: n });
    } catch { setSt({ status: "error", data: null, shown: 0 }); }
  };
  useEffect(() => { if (autorun && !started.current) { started.current = true; run(); } }, [autorun]);

  const d = st.data;
  return (
    <section className={`card card-pad verify ${st.status === "done" ? (d.intact ? "ok" : "bad") : ""}`}>
      <div className="verify-top">
        <div className="verify-icon">{st.status === "running" ? <LoaderCircle size={26} className="spin" /> : st.status === "done" ? (d.intact ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />) : <Fingerprint size={26} />}</div>
        <div className="grow">
          <h2>{st.status === "done" ? (d.intact ? "Every log is intact" : `${d.broken.length} log${d.broken.length === 1 ? " has" : "s have"} been altered`) : st.status === "running" ? "Checking every fingerprint" : "Verify the whole record"}</h2>
          <p className="muted">{st.status === "done" ? `${d.checked} logs and ${d.entries} entries checked. Each entry carries a fingerprint of the one before it, and each log's end marker is checked too.` : "Walks every log from its first entry to its last and checks that nothing was edited, reordered or removed."}</p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={st.status === "running"}>{st.status === "done" ? "Verify again" : "Verify every log"}</button>
      </div>
      {d ? (
        <div className="vdots" role="img" aria-label={`${d.checked} logs, ${d.broken.length} altered`}>
          {d.items.map((it, i) => (
            <Link key={it.inspection_id} to={`/app/audit/${it.inspection_id}`} title={`${prettyName(it.photo_name)}: ${it.entries} entries, ${it.intact ? "intact" : "ALTERED"}`}
              className={`vdot ${i < st.shown ? (it.intact ? "ok" : "bad") : ""}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventRow({ e, now, showPhoto }) {
  const x = describeEvent(e);
  const Icon = x.icon;
  const person = isPerson(e.who);
  return (
    <li className={`ev ${x.tone}`}>
      <span className="ev-dot"><Icon size={17} /></span>
      <div className="ev-body">
        <h3>{x.title}{showPhoto ? <Link to={`/app/inspections/${e.inspection_id}`} className="ev-photo"> {prettyName(e.photo_name)}</Link> : null}</h3>
        {x.note ? <p className="ev-note">{x.note}</p> : null}
        {x.facts ? <div className="chips-row">{x.facts.map(([k, v]) => <span key={k} className="chip">{k}: {v}</span>)}</div> : null}
        <div className="ev-meta">
          <span className="num">#{e.step}</span>
          <span className="num" title={e.time}>{fmtTime(e.time, true)}{now ? `, ${ago(e.time, now)}` : ""}</span>
          <span className={`who ${person ? "person" : ""}`}>{person ? <Avatar name={e.who} size={20} /> : null}{e.who === "rule-agent" ? "agent" : e.who}</span>
          <span className="hash" title="Fingerprint of the previous entry, which this entry carries"><Link2 size={12} /> {e.prev_hash === "start" ? "start of log" : e.prev_hash.slice(0, 12)}</span>
        </div>
      </div>
    </li>
  );
}

function ByInspection({ list }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useNow(30000);
  const [q, setQ] = useState("");
  const current = list.find((i) => i.inspection_id === id)?.inspection_id || list[0]?.inspection_id;
  const { data: log, error } = useApi(current ? `/api/log/${current}` : null, { enabled: !!current });
  const rows = list.filter((i) => !q.trim() || i.photo_name.toLowerCase().includes(q.trim().toLowerCase()) || i.inspection_id.includes(q.trim()));
  const meta = list.find((i) => i.inspection_id === current);
  const csv = () => downloadFile(`audit-${current}.csv`, toCsv([["step", "time", "who", "event", "details"], ...log.events.map((e) => [e.step, e.time, e.who, e.event, JSON.stringify(e.details)])]), "text/csv");

  return (
    <div className="audit-grid">
      <aside className="card queue-card">
        <div className="card-head"><h2>Inspections</h2></div>
        <div style={{ padding: "12px 14px 4px" }}><label className="input-icon"><Search size={16} /><input className="input input-sm" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inspections" /></label></div>
        <ul className="queue-list tall">
          {rows.map((i) => (
            <li key={i.inspection_id}><button className={i.inspection_id === current ? "on" : ""} onClick={() => navigate(`/app/audit/${i.inspection_id}`)} aria-current={i.inspection_id === current}>
              <img src={thumbUrl(i.inspection_id, 96)} alt="" /><span><b>{prettyName(i.photo_name)}</b><small>{ago(i.created, now)}</small></span></button></li>
          ))}
        </ul>
      </aside>
      <section className="stack">
        {!log ? (error ? <div className="form-error">{error.message}</div> : <Skeleton h={420} r={18} />) : (
          <>
            <div className="row">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 720 }}>{prettyName(meta?.photo_name || current)}</h2>
              <Link to={`/app/inspections/${current}`} className="btn btn-quiet btn-sm">Open inspection</Link>
              <button className="btn btn-ghost btn-sm spacer" onClick={() => downloadFile(`audit-${current}.json`, JSON.stringify({ intact: log.intact, events: log.events }, null, 2))}><Download size={15} /> JSON</button>
              <button className="btn btn-ghost btn-sm" onClick={csv}><Download size={15} /> CSV</button>
            </div>
            <div className={`integrity ${log.intact ? "ok" : "bad"}`} role="status">{log.intact ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
              <span>{log.intact ? <><b>Intact.</b> No entry has been changed, reordered or removed, including the last ones.</> : <><b>Altered.</b> This log no longer matches its own fingerprints. Do not rely on it.</>}</span></div>
            <section className="card card-pad">
              <h2 className="panel-title">{log.events.length} entries</h2>
              <ol className="timeline">
                {log.events.map((e) => <EventRow key={e.step} e={e} now={now} />)}
              </ol>
            </section>
          </>
        )}
      </section>
    </div>
  );
}

function AllActivity() {
  const now = useNow(30000);
  const [event, setEvent] = useState("");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 250);
  const size = 25;
  useEffect(() => setPage(0), [event, who, dq]);
  const { data } = useApi(`/api/audit/events?limit=${size}&offset=${page * size}&event=${encodeURIComponent(event)}&who=${encodeURIComponent(who)}&q=${encodeURIComponent(dq)}`, { interval: 8000 });
  if (!data) return <Skeleton h={420} r={18} />;
  const pages = Math.max(1, Math.ceil(data.total / size));
  return (
    <section className="stack">
      <div className="card card-pad toolbar">
        <div className="tb-row">
          <label className="input-icon tb-search"><Search size={17} /><input className="input" type="search" placeholder="Search the whole record" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the record" /></label>
          <select className="select tb-select" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event type"><option value="">All events</option>{data.kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select>
          <select className="select tb-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who"><option value="">Everyone</option>{data.whos.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </div>
      </div>
      <section className="card card-pad">
        <h2 className="panel-title">{data.total} entr{data.total === 1 ? "y" : "ies"}</h2>
        {data.events.length ? <ol className="timeline"><AnimatePresence initial={false}>{data.events.map((e) => <EventRow key={`${e.inspection_id}-${e.step}`} e={e} now={now} showPhoto />)}</AnimatePresence></ol> : <p className="muted">Nothing matches.</p>}
        <div className="pager" style={{ marginTop: 16 }}>
          <span className="muted">Page {page + 1} of {pages}</span>
          <div className="row tight spacer">
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button>
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button>
          </div>
        </div>
      </section>
    </section>
  );
}

export default function Audit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data: list } = useApi("/api/inspections?limit=500", { interval: 10000 });
  const [tab, setTab] = useState(id ? "inspection" : "activity");
  useEffect(() => { if (id) setTab("inspection"); }, [id]);

  if (!list) return <Skeleton h={520} r={18} />;
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Audit log</h1><p>Every step, in order, with who did it and why. Each entry carries a fingerprint of the one before it, so a change or a missing entry shows up.</p></div>
      </header>
      <VerifyPanel autorun={params.get("verify") === "1"} />
      {!list.length ? <div className="card"><EmptyState title="No records yet" text="The log starts when the first photo is inspected." /></div> : (
        <>
          <div className="tabs-row"><Segmented id="audit-tab" label="Audit view" value={tab} onChange={setTab} options={[{ value: "activity", label: "All activity" }, { value: "inspection", label: "By inspection" }]} /></div>
          {tab === "inspection" ? <ByInspection list={list} /> : <AllActivity />}
        </>
      )}
    </div>
  );
}
