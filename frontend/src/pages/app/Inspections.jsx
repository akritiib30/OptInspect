import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, LayoutGrid, List, ScanLine, Search, X } from "lucide-react";
import { EmptyState, Segmented, Skeleton, VerdictTag } from "../../components/bits";
import { thumbUrl } from "../../lib/api";
import { useApi, useDebounced, useNow } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { ago, downloadFile, fmtTime, num, prettyName, toCsv } from "../../lib/format";
import { SOURCES, VERDICTS } from "../../lib/constants";

const WORDS = { CONFIRMED: "confirmed", CLEARED: "normal", NEEDS_REVIEW: "waiting", HUMAN_DEFECT: "person: defect", HUMAN_OK: "person: fine", NEEDS_EXPERT: "expert" };
const SORTS = { new: "Newest first", old: "Oldest first", score: "Highest score first" };

export default function Inspections() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const now = useNow(30000);
  const [params] = useSearchParams();
  const { data: all } = useApi("/api/inspections?limit=1000", { interval: 8000 });
  const [q, setQ] = useState(params.get("q") || "");
  const [verdict, setVerdict] = useState(params.get("verdict") || "");
  const [product, setProduct] = useState("");
  const [who, setWho] = useState("");
  const [sort, setSort] = useState("new");
  const [view, setView] = useState("list");
  const [size, setSize] = useState(12);
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 200);

  useEffect(() => setPage(0), [dq, verdict, product, who, sort, size]);

  const counts = useMemo(() => {
    const c = {};
    (all || []).forEach((i) => { c[i.verdict] = (c[i.verdict] || 0) + 1; });
    return c;
  }, [all]);
  const products = useMemo(() => [...new Set((all || []).map((i) => i.product).filter(Boolean))], [all]);
  const people = useMemo(() => [...new Set((all || []).map((i) => i.created_by).filter(Boolean))], [all]);

  const rows = useMemo(() => {
    const s = dq.trim().toLowerCase();
    let r = (all || []).filter((i) => (!verdict || i.verdict === verdict) && (!product || i.product === product) && (!who || i.created_by === who)
      && (!s || i.photo_name.toLowerCase().includes(s) || i.inspection_id.toLowerCase().includes(s) || (i.original_name || "").toLowerCase().includes(s)));
    if (sort === "old") r = [...r].reverse();
    if (sort === "score") r = [...r].sort((a, b) => (b.top_score ?? -1) - (a.top_score ?? -1));
    return r;
  }, [all, dq, verdict, product, who, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = rows.slice(page * size, page * size + size);
  const exportCsv = () => downloadFile("inspections.csv", toCsv([["id", "photo", "product", "verdict", "defects", "top_score", "inspected_by", "created"],
    ...rows.map((i) => [i.inspection_id, i.photo_name, i.product, i.verdict, i.defect_count, i.top_score ?? "", i.created_by ?? "", i.created])]), "text/csv");

  if (!all) return <Skeleton h={520} r={18} />;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Inspections</h1><p>{all.length} in total. Search, filter, and open any one to see the photo, the boxes and every step the agent took.</p></div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export {rows.length} as CSV</button>
          {can.inspect ? <Link to="/app/inspect" className="btn btn-primary"><ScanLine size={17} /> Inspect photos</Link> : null}
        </div>
      </header>

      <section className="card card-pad toolbar">
        <div className="tb-row">
          <label className="input-icon tb-search"><Search size={17} /><input className="input" type="search" placeholder="Search by photo name or id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inspections" /></label>
          <select className="select tb-select" value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Product"><option value="">All products</option>{products.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select className="select tb-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Inspected by"><option value="">Everyone</option>{people.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select className="select tb-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <Segmented id="view" label="Layout" value={view} onChange={setView} options={[{ value: "list", label: "List", icon: <List size={15} /> }, { value: "grid", label: "Grid", icon: <LayoutGrid size={15} /> }]} />
        </div>
        <div className="chips-row">
          <button className="filter-chip" aria-pressed={!verdict} onClick={() => setVerdict("")}>All <b>{all.length}</b></button>
          {Object.entries(VERDICTS).map(([k, v]) => counts[k] ? <button key={k} className="filter-chip" aria-pressed={verdict === k} onClick={() => setVerdict(verdict === k ? "" : k)}>{v.label} <b>{counts[k]}</b></button> : null)}
          {(q || verdict || product || who) ? <button className="filter-chip" onClick={() => { setQ(""); setVerdict(""); setProduct(""); setWho(""); }}><X size={14} /> Clear filters</button> : null}
        </div>
      </section>

      {!rows.length ? (
        <div className="card"><EmptyState title={all.length ? "Nothing matches those filters" : "No inspections yet"} text={all.length ? "Clear a filter to see more." : "They appear here the moment the first photo is inspected."}>
          {all.length ? <button className="btn btn-ghost" onClick={() => { setQ(""); setVerdict(""); setProduct(""); setWho(""); }}>Clear filters</button> : can.inspect ? <Link to="/app/inspect" className="btn btn-primary">Inspect photos</Link> : null}
        </EmptyState></div>
      ) : view === "list" ? (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th /><th>Photo</th><th>Product</th><th>Verdict</th><th>Defects</th><th>Top score</th><th>Inspected by</th><th>When</th></tr></thead>
              <tbody>
                {shown.map((i, n) => (
                  <motion.tr key={i.inspection_id} className="click" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.02 }} onClick={() => navigate(`/app/inspections/${i.inspection_id}`)}>
                    <td style={{ width: 66 }}><img className="thumb-s" src={thumbUrl(i.inspection_id, 120)} alt="" loading="lazy" /></td>
                    <td><Link to={`/app/inspections/${i.inspection_id}`} onClick={(e) => e.stopPropagation()} className="row-link">{prettyName(i.photo_name)}</Link>{i.source ? <span className="chip tiny" style={{ marginLeft: 8 }}>{SOURCES[i.source] || i.source}</span> : null}<div className="faint num small">{i.inspection_id}</div></td>
                    <td>{i.product || "-"}</td>
                    <td><VerdictTag value={i.verdict} /></td>
                    <td>{i.defect_count ? <div className="row tight">{Object.entries(i.statuses).map(([k, c]) => <span key={k} className="chip">{c} {WORDS[k] || k}</span>)}</div> : <span className="faint">none</span>}</td>
                    <td className="num">{i.top_score == null ? "-" : num(i.top_score)}</td>
                    <td>{i.created_by || "-"}</td>
                    <td title={fmtTime(i.created, true)}>{ago(i.created, now)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="grid-cards">
          {shown.map((i, n) => (
            <motion.div key={i.inspection_id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.03 }}>
              <Link to={`/app/inspections/${i.inspection_id}`} className="gcard card">
                <div className="gc-img"><img src={thumbUrl(i.inspection_id, 420)} alt="" loading="lazy" /><span className="gc-score num">{i.top_score == null ? "" : num(i.top_score)}</span></div>
                <div className="gc-body"><b>{prettyName(i.photo_name)}{i.source ? <span className="chip tiny" style={{ marginLeft: 8 }}>{SOURCES[i.source] || i.source}</span> : null}</b><div className="row tight"><VerdictTag value={i.verdict} /></div><small className="faint">{i.created_by || "-"}, {ago(i.created, now)}</small></div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {rows.length ? (
        <div className="pager">
          <span className="muted">{page * size + 1} to {Math.min(rows.length, page * size + size)} of {rows.length}</span>
          <select className="select input-sm" style={{ width: 110 }} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Rows per page">{[12, 24, 48].map((n) => <option key={n} value={n}>{n} per page</option>)}</select>
          <div className="row tight spacer">
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button>
            <span className="num muted">Page {page + 1} of {pages}</span>
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
