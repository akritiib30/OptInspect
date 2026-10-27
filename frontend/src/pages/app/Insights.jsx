import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { Donut, HBars, Histogram, StackedBars } from "../../components/charts";
import Counter from "../../components/Counter";
import Hotspots from "../../components/Hotspots";
import { Skeleton } from "../../components/bits";
import { useApi } from "../../lib/hooks";
import { num } from "../../lib/format";
import { STATUSES, TOOLS } from "../../lib/constants";

const SERIES_KEYS = [
  { key: "ok", label: "Passed", color: "var(--ok)" }, { key: "review", label: "Needs a person", color: "var(--warn)" },
  { key: "defect", label: "Defect found", color: "var(--bad)" }, { key: "invalid", label: "Not the product", color: "var(--mute)" },
];
const VERDICT_COLORS = { OK: "var(--ok)", DEFECT: "var(--bad)", NEEDS_REVIEW: "var(--warn)", NEEDS_EXPERT: "#ffd27a", INVALID_PHOTO: "var(--mute)" };
const VERDICT_LABELS = { OK: "Passed", DEFECT: "Defect found", NEEDS_REVIEW: "Needs a person", NEEDS_EXPERT: "Sent to an expert", INVALID_PHOTO: "Not the product" };
const BENCH = [["Good bottles", 20, 0, 1, 0, 19], ["Broken, large", 20, 20, 0, 0, 0], ["Broken, small", 22, 19, 3, 0, 0], ["Contamination", 21, 18, 0, 3, 0]];

// Where each human decision landed on the score scale
function PeopleVsAgent({ points, cfg }) {
  const lanes = [["HUMAN_DEFECT", "Marked defect", "var(--bad)"], ["HUMAN_OK", "Marked fine", "var(--ok)"], ["NEEDS_EXPERT", "Asked an expert", "var(--warn)"]];
  return (
    <div className="pva">
      <div className="pva-zones" aria-hidden="true"><i style={{ width: `${cfg.dismiss * 100}%`, background: "var(--ok-bg)" }} /><i style={{ width: `${(cfg.confirm - cfg.dismiss) * 100}%`, background: "var(--warn-bg)" }} /><i style={{ width: `${(1 - cfg.confirm) * 100}%`, background: "var(--bad-bg)" }} /></div>
      {lanes.map(([k, label, color]) => (
        <div className="pva-lane" key={k}>
          <span>{label}</span>
          <div>{points.filter((p) => p.decision === k).map((p, i) => (
            <motion.i key={i} style={{ left: `${Math.min(0.985, Math.max(0.015, p.score)) * 100}%`, background: color, top: `${22 + ((i * 37) % 44)}%` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.05, type: "spring", stiffness: 420, damping: 16 }} title={`score ${num(p.score)}`} />
          ))}</div>
        </div>
      ))}
      <div className="pva-axis"><span>0</span><span>agent's final score</span><span>1</span></div>
    </div>
  );
}

export default function Insights() {
  const { data: s } = useApi("/api/stats", { interval: 8000 });
  const { data: cfg } = useApi("/api/config");
  if (!s || !cfg) return <div className="grid g-12"><Skeleton h={320} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={320} r={18} style={{ gridColumn: "span 4" }} /></div>;

  const thresholds = { dismiss: cfg.dismiss, confirm: cfg.confirm };
  const verdicts = Object.keys(VERDICT_COLORS).filter((k) => s.verdicts[k]).map((k) => ({ label: VERDICT_LABELS[k], value: s.verdicts[k], color: VERDICT_COLORS[k] }));
  const tools = ["compare", "contrast", "zoom"].map((t) => ({ t, ...(s.tools[t] || { runs: 0, raised: 0, lowered: 0, net: 0 }) }));
  const reviewers = Object.entries(s.reviewers).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: "var(--gold)" }));
  const inspectors = Object.entries(s.inspectors).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: "var(--info)" }));
  const people = s.people_vs_agent;
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b.score, 0) / arr.length : null);
  const mDef = mean(people.filter((p) => p.decision === "HUMAN_DEFECT")), mOk = mean(people.filter((p) => p.decision === "HUMAN_OK"));

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Insights</h1><p>How the inspector is behaving: what it settles by itself, where the extra checks help, and where people step in. Everything here is computed from your own inspections.</p></div>
      </header>

      <div className="grid g-12">
        <section className="card card-pad span-8">
          <div className="panel-title"><h2>Inspections per day</h2><div className="legend spacer">{SERIES_KEYS.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label}</span>)}</div></div>
          <StackedBars series={s.series} keys={SERIES_KEYS} height={230} />
        </section>
        <section className="card card-pad span-4">
          <h2 className="panel-title">Verdict mix</h2>
          {verdicts.length ? (
            <div className="donut-row stacked-col">
              <Donut segments={verdicts} size={170} center={<><b><Counter value={s.inspections} once={false} /></b><span>photos</span></>} />
              <ul className="donut-legend">{verdicts.map((v) => <li key={v.label}><i style={{ background: v.color }} />{v.label}<b className="num">{v.value}</b></li>)}</ul>
            </div>
          ) : <p className="muted">No inspections yet.</p>}
        </section>
      </div>

      <section className="card card-pad">
        <div className="panel-title"><h2>Where defects happen</h2><span className="chip spacer">Confirmed defects, all inspections</span></div>
        <Hotspots boxes={s.hotspots || []} />
      </section>

      <div className="grid g-12">
        <section className="card card-pad span-6">
          <h2 className="panel-title">First look</h2>
          <p className="hint" style={{ marginBottom: 12 }}>The detector's score for each defect before any extra check.</p>
          <Histogram bins={s.scores.first} cfg={thresholds} height={190} label="First-look scores" />
        </section>
        <section className="card card-pad span-6">
          <h2 className="panel-title">After the agent is done</h2>
          <p className="hint" style={{ marginBottom: 12 }}>Where the same defects ended up. Scores that left the middle band were settled by the agent.</p>
          <Histogram bins={s.scores.final} cfg={thresholds} height={190} label="Final scores" />
        </section>
      </div>

      <div className="grid g-12">
        <section className="card card-pad span-7">
          <h2 className="panel-title">Do the extra checks help?</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Check</th><th>Runs</th><th>Raised the score</th><th>Lowered it</th><th>Average change</th></tr></thead>
              <tbody>
                {tools.map((r) => { const T = TOOLS[r.t]; const Icon = T.icon; return (
                  <tr key={r.t}>
                    <td><span className="row tight"><span className="tl-icon"><Icon size={16} /></span><b>{T.label}</b></span></td>
                    <td className="num">{r.runs}</td>
                    <td className="num"><span className="up"><ArrowUp size={14} /> {r.raised}</span></td>
                    <td className="num"><span className="down"><ArrowDown size={14} /> {r.lowered}</span></td>
                    <td className="num">{r.runs ? `${r.net > 0 ? "+" : ""}${r.net.toFixed(3)}` : "-"}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Checks that lower a score do not clear the defect: it goes to a person. That is the safety rule.</p>
        </section>
        <section className="card card-pad span-5">
          <h2 className="panel-title">People and the agent</h2>
          {people.length ? (
            <>
              <PeopleVsAgent points={people} cfg={thresholds} />
              <p className="hint" style={{ marginTop: 12 }}>{people.length >= 3 && mDef != null && mOk != null ? `People marked defects at an average agent score of ${num(mDef)} and fine ones at ${num(mOk)}.` : `${people.length} decision${people.length === 1 ? "" : "s"} so far. A pattern needs a few more.`}</p>
            </>
          ) : <p className="muted">When people decide on unsure cases, their choices are plotted here against the agent's score.</p>}
        </section>
      </div>

      <div className="grid g-12">
        <section className="card card-pad span-6">
          <h2 className="panel-title">Decisions by person</h2>
          {reviewers.length ? <HBars items={reviewers} /> : <p className="muted">No one has decided on a case yet.</p>}
        </section>
        <section className="card card-pad span-6">
          <h2 className="panel-title">Inspections run by person</h2>
          {inspectors.length ? <HBars items={inspectors} /> : <p className="muted">No inspections have been run yet.</p>}
        </section>
      </div>

      <section className="card card-pad bench">
        <div className="panel-title"><h2>Offline benchmark</h2><span className="chip spacer"><Info size={14} /> Fixed figures, not from your data</span></div>
        <p className="muted">Measured once with the project's test script on 83 real MVTec AD bottle photos. The edge setting was tuned on the same photos, so treat these as somewhat optimistic.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Photo type</th><th>Photos</th><th>Confirmed</th><th>Sent to a person</th><th>Missed</th><th>Normal</th></tr></thead>
            <tbody>{BENCH.map(([l, n, c, p, m, nrm]) => <tr key={l}><td><b>{l}</b></td><td className="num">{n}</td><td className="num">{c}</td><td className="num">{p}</td><td className="num">{m ? <b style={{ color: "var(--warn)" }}>{m}</b> : 0}</td><td className="num">{nrm}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
