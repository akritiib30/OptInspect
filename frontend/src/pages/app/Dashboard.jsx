import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ClipboardCheck, Cpu, FlaskConical, Gauge, History, LoaderCircle, ScanLine, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Swords, Timer } from "lucide-react";
import Viewer from "../../components/Viewer";
import ScoreTrack from "../../components/ScoreTrack";
import Steps from "../../components/Steps";
import Counter from "../../components/Counter";
import { RadialGauge, Sparkline } from "../../components/charts";
import { Skeleton, StatusTag, VerdictTag } from "../../components/bits";
import { useApi, useNow } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { api, productImage, thumbUrl } from "../../lib/api";
import { ago, greeting, num, prettyName, uptime } from "../../lib/format";
import { feedLine } from "../../lib/events";
import { STATUSES, toneOf } from "../../lib/constants";
import { useToast } from "../../lib/toast";

function Kpi({ icon: Icon, label, children, foot }) {
  return (
    <div className="card kpi">
      <div className="kpi-top"><span>{label}</span><Icon size={18} /></div>
      <div className="kpi-value">{children}</div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(30000);
  const { data: stats } = useApi("/api/stats", { interval: 5000 });
  const { data: list } = useApi("/api/inspections?limit=24", { interval: 7000 });
  const { data: activity } = useApi("/api/activity?limit=12", { interval: 4000 });
  const { data: cfg } = useApi("/api/config");
  const { data: verify, reload: reverify } = useApi("/api/audit/verify", { interval: 45000 });
  const { data: products } = useApi("/api/products");
  const latest = list?.find((i) => i.verdict !== "INVALID_PHOTO") || list?.[0];
  const { data: latestResult } = useApi(latest ? `/api/result/${latest.inspection_id}` : null, { enabled: !!latest });
  const [running, setRunning] = useState(null);

  const quickRun = async (product, sample) => {
    setRunning(sample);
    try {
      const r = await api(`/api/inspect-sample/${product}/${sample}`, { method: "POST" });
      navigate(`/app/inspections/${r.inspection_id}`);
    } catch (e) { toast.error("Could not run that inspection", e.message); setRunning(null); }
  };

  if (!stats || !list || !cfg) {
    return <div className="grid g-12"><Skeleton h={420} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={420} r={18} style={{ gridColumn: "span 4" }} /><Skeleton h={160} r={18} style={{ gridColumn: "span 12" }} /></div>;
  }

  const o = stats.outcomes;
  const confirmed = (o.CONFIRMED || 0) + (o.HUMAN_DEFECT || 0);
  const settled = stats.defects ? stats.resolved_by_agent / stats.defects : 0;
  const waiting = stats.awaiting_review;
  const focus = latestResult?.defects.find((d) => d.status === "NEEDS_REVIEW") || latestResult?.defects[0];
  const totals = stats.series.map((s) => s.total);
  const sample = products?.find((p) => p.samples.length);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>{greeting()}, {user.name.split(" ")[0]}.</h1>
          <p>{waiting ? `${waiting} defect${waiting === 1 ? " is" : "s are"} waiting for a person. Everything else is settled.` : stats.inspections ? "Everything the agent could settle is settled. Here is the picture." : "Nothing has been inspected yet. Start with a photo and watch the agent work."}</p>
        </div>
        <div className="actions">
          {can.inspect ? <Link to="/app/inspect" className="btn btn-primary"><ScanLine size={17} /> Inspect photos</Link> : null}
          {waiting && can.review ? <Link to="/app/review" className="btn btn-ghost"><ClipboardCheck size={17} /> Review {waiting}</Link> : null}
        </div>
      </header>

      <div className="grid g-12">
        <section className="card span-8 hero-card">
          {latestResult ? (
            <>
              <div className="card-head">
                <h2>Latest: {prettyName(latestResult.photo_name)}</h2>
                <VerdictTag value={latestResult.verdict} />
                <span className="muted fi-time">{ago(latestResult.created, now)}</span>
                <Link to={`/app/inspections/${latestResult.inspection_id}`} className="btn btn-quiet btn-sm" style={{ marginLeft: "auto" }}>Open <ArrowRight size={15} /></Link>
              </div>
              <div className="card-body hero-body">
                <Viewer result={latestResult} controls={false} maxHeight="430px" onSelect={() => navigate(`/app/inspections/${latestResult.inspection_id}`)} />
                <div className="hero-story">
                  {focus ? (
                    <>
                      <div className="row tight"><span className="badge-n" style={{ background: "var(--ink-chip, #3a4660)" }}>{focus.defect + 1}</span><StatusTag value={focus.status} /><span className="muted num">score {num(focus.final_score)}</span></div>
                      <ScoreTrack history={focus.history} tone={toneOf(STATUSES, focus.status)} cfg={{ dismiss: cfg.dismiss, confirm: cfg.confirm }} />
                      <Steps history={focus.history} />
                    </>
                  ) : <p className="muted">{latestResult.verdict === "INVALID_PHOTO" ? "This photo was refused: it does not look like the product." : "No defects: nothing rose above the normal level for this product."}</p>}
                  <Link to={`/app/inspections/${latestResult.inspection_id}`} className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }}>See every step <ArrowRight size={15} /></Link>
                </div>
              </div>
            </>
          ) : (
            <div className="welcome">
              <div className="welcome-art">{sample ? <img src={productImage(sample.name, null, 520)} alt={`Good reference photo for ${sample.name}`} /> : null}<span /></div>
              <div className="stack">
                <h2>Nothing inspected yet</h2>
                <p className="muted">Pick a ready-made photo from a real MVTec bottle set, or upload your own. The agent compares it with the good reference and shows every step it takes.</p>
                {can.inspect && sample ? (
                  <div className="row">
                    {sample.samples.slice(0, 3).map((s) => (
                      <button key={s.id} className="btn btn-primary" onClick={() => quickRun(sample.name, s.id)} disabled={!!running}>
                        {running === s.id ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} {prettyName(s.label)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {can.inspect ? <Link to="/app/inspect" className="btn btn-ghost" style={{ justifySelf: "start" }}>Upload your own photos <ArrowRight size={16} /></Link> : <p className="muted">Ask an administrator for a reviewer account to run inspections.</p>}
              </div>
            </div>
          )}
        </section>

        <div className="span-4 stack">
          <section className="card needs">
            <div className={`needs-ring ${waiting ? "hot" : ""}`}><b><Counter value={waiting} once={false} /></b></div>
            <div>
              <h2>{waiting ? "Waiting for a person" : "All caught up"}</h2>
              <p className="muted">{waiting ? "The agent could not settle these. A check can never clear a defect, so they are yours to decide." : "No defect is waiting. New cases appear here the moment the agent is unsure."}</p>
              {waiting && can.review ? <Link to="/app/review" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Review now <ArrowRight size={15} /></Link> : null}
            </div>
          </section>
          <section className="card card-pad health">
            <h2 className="panel-title">System health</h2>
            <div className="health-row">
              {verify ? (verify.intact ? <ShieldCheck size={20} className="ok" /> : <ShieldAlert size={20} className="bad" />) : <LoaderCircle size={20} className="spin" />}
              <div>
                <b>{verify ? (verify.intact ? "Audit log intact" : `${verify.broken.length} log(s) altered`) : "Checking the audit log"}</b>
                <small>{verify ? `${verify.checked} logs, ${verify.entries} entries` : "Verifying every fingerprint"}</small>
              </div>
              <button className="btn btn-quiet btn-sm spacer" onClick={reverify}>Verify</button>
            </div>
            <div className="health-row"><Cpu size={20} /><div><b>OpenCV {cfg.engine.opencv}</b><small>Python {cfg.engine.python}, Flask {cfg.engine.flask}</small></div></div>
            <div className="health-row"><Timer size={20} /><div><b>Up for {uptime(cfg.uptime_seconds)}</b><small>{stats.duration.avg != null ? `${stats.duration.avg} ms per inspection on average` : "No inspections timed yet"}</small></div></div>
          </section>
        </div>
      </div>

      <div className="kpis">
        <Kpi icon={History} label="Photos inspected" foot={<><span>last 14 days</span><Sparkline data={totals} /></>}>
          <Counter value={stats.inspections} once={false} />
        </Kpi>
        <Kpi icon={ShieldAlert} label="Defects confirmed" foot={<span>of <b className="num">{stats.defects}</b> defects found, by the agent or a person</span>}>
          <Counter value={confirmed} once={false} />
        </Kpi>
        <Kpi icon={Gauge} label="Settled without a person" foot={<span>{stats.resolved_by_agent} of {stats.defects} defects</span>}>
          <div className="kpi-gauge"><RadialGauge value={settled} size={92} display={<Counter value={settled * 100} suffix="%" once={false} />} /></div>
        </Kpi>
        <Kpi icon={Timer} label="Analysis time" foot={<span>{stats.duration.n ? `slowest 5%: ${stats.duration.p95} ms, ${stats.duration.n} runs` : "no runs yet"}</span>}>
          {stats.duration.avg != null ? <><Counter value={stats.duration.avg} once={false} /><small>ms</small></> : "-"}
        </Kpi>
      </div>

      <div className="grid g-12">
        <section className="card card-pad span-7">
          <div className="panel-title"><h2>Live activity</h2><span className="live-tag spacer"><i className="dot-live" /> updating</span></div>
          <ul className="feed-list">
            <AnimatePresence initial={false}>
              {(activity || []).slice(0, 7).map((e) => {
                const l = feedLine(e);
                const Icon = l.icon;
                return (
                  <motion.li key={`${e.inspection_id}-${e.step}`} layout className="feed-item" initial={{ opacity: 0, x: -18, height: 0 }} animate={{ opacity: 1, x: 0, height: "auto" }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                    <span className={`fi-icon ${l.tone}`}><Icon size={17} /></span>
                    <Link to={`/app/inspections/${e.inspection_id}`} className="fi-text">{l.text}</Link>
                    <span className="fi-time">{ago(e.time, now)}</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {!activity?.length ? <li className="muted" style={{ padding: "12px 4px" }}>Activity appears here as people inspect and decide.</li> : null}
          </ul>
        </section>
        <section className="card card-pad span-5">
          <h2 className="panel-title">Try the labs</h2>
          <div className="lab-links">
            <Link to="/app/stress" className="lab-link"><span className="lab-icon"><FlaskConical size={22} /></span><span><b>Stress test</b><small>Paint a defect and try to fool the agent</small></span><ArrowRight size={18} /></Link>
            <Link to="/app/challenge" className="lab-link"><span className="lab-icon"><Swords size={22} /></span><span><b>Challenge</b><small>Judge real photos against the agent</small></span><ArrowRight size={18} /></Link>
            <Link to="/app/lab" className="lab-link"><span className="lab-icon"><SlidersHorizontal size={22} /></span><span><b>Tolerance lab</b><small>Move its decision lines on 83 real photos</small></span><ArrowRight size={18} /></Link>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>They use the same agent as your inspections and write nothing to your record unless you save.</p>
        </section>
      </div>

      <section>
        <div className="panel-title"><h2>Recent inspections</h2><Link to="/app/inspections" className="btn btn-quiet btn-sm spacer">See all <ArrowRight size={15} /></Link></div>
        {list.length ? (
          <div className="recent-strip">
            {list.slice(0, 10).map((i, n) => (
              <motion.div key={i.inspection_id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.04 }}>
                <Link to={`/app/inspections/${i.inspection_id}`} className="recent-card">
                  <div className="rc-img"><img src={thumbUrl(i.inspection_id, 360)} alt="" loading="lazy" /></div>
                  <b>{prettyName(i.photo_name)}</b>
                  <div className="row tight"><VerdictTag value={i.verdict} /><span className="fi-time">{ago(i.created, now)}</span></div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : <p className="muted">Your inspections will line up here.</p>}
      </section>
    </div>
  );
}
