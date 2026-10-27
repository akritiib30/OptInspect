import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Info, RotateCcw, ShieldCheck } from "lucide-react";
import Counter from "../../components/Counter";
import { EmptyState, Skeleton } from "../../components/bits";
import { useApi } from "../../lib/hooks";
import { num, prettyName } from "../../lib/format";

const VB_W = 1000, X0 = 236, X1 = 968, R = 6.5, LABEL_X = 122, BIN_X = 176;
const OUTCOME = {
  DEFECT: { label: "Confirmed defect", color: "var(--bad)" },
  REVIEW: { label: "Sent to a person", color: "var(--warn)" },
  OK: { label: "Called normal", color: "var(--ok)" },
};
const CATEGORY = { good: "Good bottles", broken_large: "Broken, large", broken_small: "Broken, small", contamination: "Contamination" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;

// The agent's own rule (agent.inspect), replayed from the stored scores: any pair of lines, no re-running the photos.
function verdictAt(photo, dismiss, confirm, maxTries) {
  let confirmed = false, review = false;
  for (const d of photo.defects) {
    let score = d.first, k = 0;
    while (score < confirm && score > dismiss && k < Math.min(maxTries, d.steps.length)) { score = d.steps[k].score; k += 1; }
    if (score >= confirm) confirmed = true;
    else if (!(score <= dismiss && k === 0)) review = true;
  }
  return confirmed ? "DEFECT" : review ? "REVIEW" : "OK";
}
const firstLook = (p) => p.defects.reduce((m, d) => Math.max(m, d.first), 0);

function tally(photos, dismiss, confirm, maxTries) {
  const t = { byId: {}, misses: 0, falseAlarms: 0, review: 0, cat: {} };
  for (const p of photos) {
    const v = verdictAt(p, dismiss, confirm, maxTries);
    t.byId[p.id] = v;
    const c = (t.cat[p.category] ||= { DEFECT: 0, REVIEW: 0, OK: 0, n: 0 });
    c[v] += 1; c.n += 1;
    if (v === "REVIEW") t.review += 1;
    if (p.defective && v === "OK") t.misses += 1;
    if (!p.defective && v === "DEFECT") t.falseAlarms += 1;
  }
  return t;
}

/** Spread the dots of one lane so none overlap (a "beeswarm"). Depends only on the first-look scores, so it stays still while you drag. */
function swarm(items) {
  const placed = [], offset = {};
  const step = R * 1.85;
  [...items].sort((a, b) => a.x - b.x).forEach((it) => {
    for (let k = 0; k < 60; k++) {
      const dy = (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2)) * step;
      if (placed.every((p) => Math.hypot(p.x - it.x, p.y - dy) >= 2 * R + 1.4)) { placed.push({ x: it.x, y: dy }); offset[it.id] = dy; return; }
    }
    offset[it.id] = 0;
  });
  return offset;
}

function Stat({ label, value, base, tone, sub, lowerIsBetter = true, suffix = "" }) {
  const delta = value - base;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className={`lb-stat ${tone}`}>
      <span>{label}</span>
      <b><Counter value={value} suffix={suffix} once={false} duration={0.5} /></b>
      <small>{sub}</small>
      {delta !== 0 ? <em className={good ? "up" : "down"}>{delta > 0 ? "+" : ""}{delta}{suffix} vs the agent's lines</em> : <em>same as the agent's lines</em>}
    </div>
  );
}

export default function Lab() {
  const [product, setProduct] = useState(null);
  const [every, setEvery] = useState(0);                       // poll while the first replay is still running
  const { data: d, error } = useApi(`/api/lab/data${product ? `?product=${product}` : ""}`, { interval: every });
  useEffect(() => { setEvery(d?.status === "computing" ? 1100 : 0); }, [d?.status]);

  const base = d?.config || { dismiss: 0.15, confirm: 0.7, max_tries: 3 };
  const [lines, setLines] = useState(null);                     // null = the agent's real lines
  const dismiss = lines ? lines.dismiss : base.dismiss;
  const confirm = lines ? lines.confirm : base.confirm;
  const maxTries = base.max_tries;
  const photos = d?.status === "ready" ? d.photos : null;
  const [tip, setTip] = useState(null);
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const drag = useRef(null);

  const layout = useMemo(() => {
    if (!photos) return null;
    const xOf = (p) => X0 + firstLook(p) * (X1 - X0);
    const scoredGood = photos.filter((p) => p.defects.length && !p.defective), scoredBad = photos.filter((p) => p.defects.length && p.defective);
    const emptyGood = photos.filter((p) => !p.defects.length && !p.defective), emptyBad = photos.filter((p) => !p.defects.length && p.defective);
    const og = swarm(scoredGood.map((p) => ({ id: p.id, x: xOf(p) }))), ob = swarm(scoredBad.map((p) => ({ id: p.id, x: xOf(p) })));
    // photos where the agent found nothing at all have no score: they sit in their own little block instead of one tall column
    const block = (list) => {
      const cols = 3, gap = 2 * R + 4, rows = Math.ceil(list.length / cols), out = {};
      list.forEach((p, i) => { out[p.id] = { dx: ((i % cols) - 1) * gap, dy: (Math.floor(i / cols) - (rows - 1) / 2) * gap }; });
      return { out, half: ((rows - 1) / 2) * gap };
    };
    const eg = block(emptyGood), eb = block(emptyBad);
    const ext = (o) => Math.max(0, ...Object.values(o).map((v) => Math.abs(v)));
    const hg = Math.max(ext(og), eg.half, R * 2) + R + 8, hb = Math.max(ext(ob), eb.half, R * 2) + R + 8;
    const top = 56, gap = 40;
    const yG = top + hg, yB = top + 2 * hg + gap + hb;
    const pos = {};
    scoredGood.forEach((p) => { pos[p.id] = { x: xOf(p), y: yG + og[p.id] }; });
    scoredBad.forEach((p) => { pos[p.id] = { x: xOf(p), y: yB + ob[p.id] }; });
    emptyGood.forEach((p) => { pos[p.id] = { x: BIN_X + eg.out[p.id].dx, y: yG + eg.out[p.id].dy }; });
    emptyBad.forEach((p) => { pos[p.id] = { x: BIN_X + eb.out[p.id].dx, y: yB + eb.out[p.id].dy }; });
    return { pos, yG, yB, hg, hb, height: yB + hb + 46, top, nGood: scoredGood.length + emptyGood.length, nBad: scoredBad.length + emptyBad.length };
  }, [photos]);

  const now = useMemo(() => (photos ? tally(photos, dismiss, confirm, maxTries) : null), [photos, dismiss, confirm, maxTries]);
  const real = useMemo(() => (photos ? tally(photos, base.dismiss, base.confirm, maxTries) : null), [photos, base.dismiss, base.confirm, maxTries]);

  // every pair of lines on a grid: how many people it needs against how many mistakes it makes
  const grid = useMemo(() => {
    if (!photos) return null;
    const pts = [];
    for (let a = 0.02; a <= 0.4001; a += 0.02) {
      for (let b = 0.3; b <= 0.9801; b += 0.02) {
        if (b - a < 0.1) continue;
        const t = tally(photos, round2(a), round2(b), maxTries);
        pts.push({ dismiss: round2(a), confirm: round2(b), work: t.review / photos.length, bad: t.misses + t.falseAlarms, misses: t.misses, falseAlarms: t.falseAlarms, review: t.review });
      }
    }
    const best = [...pts].sort((p, q) => p.bad - q.bad || p.review - q.review || Math.abs(p.confirm - base.confirm) - Math.abs(q.confirm - base.confirm))[0];
    const front = [];
    [...pts].sort((p, q) => p.work - q.work || p.bad - q.bad).forEach((p) => { if (!front.length || p.bad < front[front.length - 1].bad) front.push(p); });
    return { pts, best, front, maxWork: Math.max(...pts.map((p) => p.work)), maxBad: Math.max(...pts.map((p) => p.bad)) };
  }, [photos, maxTries, base.confirm]);

  const valueAt = useCallback((clientX) => {
    const r = svgRef.current.getBoundingClientRect();
    return clamp((((clientX - r.left) / r.width) * VB_W - X0) / (X1 - X0), 0, 1);
  }, []);
  const set = (which, v) => setLines((cur) => {
    const c = cur || { dismiss: base.dismiss, confirm: base.confirm };
    return which === "dismiss" ? { ...c, dismiss: round2(clamp(v, 0.02, c.confirm - 0.05)) } : { ...c, confirm: round2(clamp(v, c.dismiss + 0.05, 0.98)) };
  });
  const onDown = (which) => (e) => {
    drag.current = which;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* the svg also listens for moves, so dragging still works */ }
    setTip(null);
  };
  const onMove = (e) => { if (drag.current) set(drag.current, valueAt(e.clientX)); };
  const onUp = () => { drag.current = null; };
  const onKey = (which) => (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { set(which, (which === "dismiss" ? dismiss : confirm) - step); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { set(which, (which === "dismiss" ? dismiss : confirm) + step); e.preventDefault(); }
  };

  const showTip = (p, e) => {
    const w = wrapRef.current.getBoundingClientRect(), c = e.currentTarget.getBoundingClientRect();
    setTip({ p, x: c.left - w.left + c.width / 2, y: c.top - w.top, flip: c.left - w.left > w.width * 0.6 });
  };

  if (!d && !error) return <div className="grid g-12"><Skeleton h={420} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={420} r={18} style={{ gridColumn: "span 4" }} /></div>;
  const header = (
    <header className="page-head">
      <div>
        <h1>Tolerance lab</h1>
        <p>Move the agent's two decision lines and see what it would have done on every real test photo. Nothing here changes how the live system decides.</p>
      </div>
      {d?.products?.length > 1 ? <select className="select input-sm" value={d.product} onChange={(e) => { setProduct(e.target.value); setLines(null); }} aria-label="Product">{d.products.map((p) => <option key={p}>{p}</option>)}</select> : null}
    </header>
  );

  if (d?.status === "unavailable" || error) {
    return <div className="stack-lg">{header}<div className="card"><EmptyState title="The test photos are not on this computer" text={d?.message || error?.message} /></div></div>;
  }
  if (!photos) {
    const done = d?.progress || 0, total = d?.total || 83;
    return (
      <div className="stack-lg">{header}
        <section className="card lb-loading">
          <div className="lb-loading-art" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <motion.i key={i} animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 1.6, delay: i * 0.07, repeat: Infinity }} />)}</div>
          <h2>Replaying the real photos</h2>
          <p className="muted">The agent is inspecting each test photo and keeping every score it sees, so any decision line can be tried instantly afterwards. This happens once and is saved.</p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><motion.i style={{ display: "block", height: "100%", background: "var(--gold)" }} animate={{ width: `${(done / total) * 100}%` }} /></div>
          <small className="muted num">{done} of {total} photos</small>
        </section>
      </div>
    );
  }

  const total = photos.length;
  const tradeX = (w) => 36 + (w / Math.max(0.01, grid.maxWork)) * 292;
  const tradeY = (b) => 188 - (b / Math.max(1, grid.maxBad)) * 160;
  const atDefault = !lines || (lines.dismiss === base.dismiss && lines.confirm === base.confirm);
  const hovered = tip ? now.byId[tip.p.id] : null;

  return (
    <div className="stack-lg lb">
      {header}
      <section className="card lb-plot-card">
        <div className="lb-plot-head">
          <div><h2>{total} real photos, placed by the agent's first look</h2><p className="hint">Each dot is a photo. Its colour is what the agent ends up doing at the current lines. A white ring marks a mistake.</p></div>
          <div className="row tight">
            <button className="btn btn-ghost btn-sm" onClick={() => setLines(null)} disabled={atDefault}><RotateCcw size={15} /> The agent's lines</button>
            <button className="btn btn-primary btn-sm" onClick={() => setLines({ dismiss: grid.best.dismiss, confirm: grid.best.confirm })} title="Fewest mistakes, then fewest photos for a person"><ShieldCheck size={15} /> Fewest mistakes</button>
          </div>
        </div>
        <div className="lb-plot">
          <div className="lb-plot-inner" ref={wrapRef}>
          <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${layout.height}`} className="lb-svg" role="group" aria-label="Test photos by first-look score with two draggable decision lines"
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <rect x={X0} y={layout.top - 26} width={(dismiss) * (X1 - X0)} height={layout.height - layout.top - 6} fill="var(--ok)" opacity="0.07" className="lb-zone" />
            <rect x={X0 + dismiss * (X1 - X0)} y={layout.top - 26} width={(confirm - dismiss) * (X1 - X0)} height={layout.height - layout.top - 6} fill="var(--warn)" opacity="0.08" className="lb-zone" />
            <rect x={X0 + confirm * (X1 - X0)} y={layout.top - 26} width={(1 - confirm) * (X1 - X0)} height={layout.height - layout.top - 6} fill="var(--bad)" opacity="0.07" className="lb-zone" />
            <text x={X0 + (confirm + dismiss) / 2 * (X1 - X0)} y={layout.top - 6} textAnchor="middle" className="t-label">the agent looks again here</text>
            <rect x={BIN_X - 40} y={layout.top - 26} width="80" height={layout.height - layout.top - 6} rx="12" fill="var(--text)" opacity="0.04" />
            <text x={BIN_X} y={layout.top - 6} textAnchor="middle" className="t-label">nothing found</text>
            {[["Good bottles", layout.yG, layout.nGood], ["Defective photos", layout.yB, layout.nBad]].map(([t, y, n]) => (
              <g key={t}><line x1={X0} x2={X1} y1={y} y2={y} stroke="var(--line-2)" strokeDasharray="2 6" /><text x={LABEL_X} y={y - 4} textAnchor="end" className="t-step">{t}</text><text x={LABEL_X} y={y + 12} textAnchor="end" className="t-label">{n} photos</text></g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={X0 + v * (X1 - X0)} x2={X0 + v * (X1 - X0)} y1={layout.height - 34} y2={layout.height - 28} stroke="var(--text-3)" /><text x={X0 + v * (X1 - X0)} y={layout.height - 12} textAnchor="middle" className="t-label">{v.toFixed(2).replace(/0$/, "")}</text></g>)}
            <text x={(X0 + X1) / 2} y={layout.height - 1} textAnchor="middle" className="t-label">first-look score</text>

            {photos.map((p) => {
              const v = now.byId[p.id], pos = layout.pos[p.id];
              const mistake = (p.defective && v === "OK") || (!p.defective && v === "DEFECT");
              return (
                <circle key={p.id} cx={pos.x} cy={pos.y} r={R} className={`lb-dot ${mistake ? "mistake" : ""}`} style={{ fill: OUTCOME[v].color }}
                  onMouseEnter={(e) => showTip(p, e)} onMouseLeave={() => setTip(null)} />
              );
            })}

            {[["dismiss", dismiss, "Clear at or below"], ["confirm", confirm, "Confirm at or above"]].map(([which, v, text]) => {
              const x = X0 + v * (X1 - X0);
              return (
                <g key={which} className="lb-line" role="slider" tabIndex={0} aria-label={text} aria-valuemin={0} aria-valuemax={1} aria-valuenow={v}
                  onPointerDown={onDown(which)} onKeyDown={onKey(which)}>
                  <rect x={x - 16} y={layout.top - 30} width="32" height={layout.height - layout.top - 4} fill="transparent" />
                  <line x1={x} x2={x} y1={layout.top - 26} y2={layout.height - 36} stroke="var(--gold)" strokeWidth="2.2" />
                  <g transform={`translate(${x} ${layout.top - 34})`}><rect x="-62" y="-16" width="124" height="28" rx="14" className="lb-pill" /><text x="0" y="3" textAnchor="middle" className="lb-pill-text">{which === "dismiss" ? "clear ≤" : "confirm ≥"} {v.toFixed(2)}</text></g>
                  <circle cx={x} cy={layout.height - 36} r="8" className="lb-grip" />
                </g>
              );
            })}
          </svg>
          {tip ? (
            <div key={tip.p.id} className={`lb-tip-pos ${tip.flip ? "flip" : ""}`} style={{ left: tip.x, top: tip.y }}>
              <motion.div className="lb-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
                <img src={`/api/lab/photo/${d.product}/${tip.p.id}?size=200`} alt="" />
                <div>
                  <b>{prettyName(tip.p.name)}</b>
                  <small>{tip.p.defective ? "Really defective" : "Really a good bottle"}</small>
                  <small>First look {num(firstLook(tip.p))}{tip.p.defects[0]?.steps.length ? `, then ${tip.p.defects[0].steps.map((st) => `${prettyName(st.by)} ${num(st.score)}`).join(", ")}` : ""}</small>
                  <span className="lb-tip-out" style={{ color: OUTCOME[hovered].color }}>At these lines: {OUTCOME[hovered].label.toLowerCase()}</span>
                </div>
              </motion.div>
            </div>
          ) : null}
          </div>
        </div>
        <ul className="lb-legend">{Object.entries(OUTCOME).map(([k, o]) => <li key={k}><i style={{ background: o.color }} />{o.label}</li>)}<li><i className="ring" />A mistake</li></ul>
      </section>

      <div className="lb-stats">
        <Stat label="Missed defects" tone="bad" value={now.misses} base={real.misses} sub={`of ${layout.nBad} defective photos`} />
        <Stat label="False alarms" tone="bad" value={now.falseAlarms} base={real.falseAlarms} sub={`of ${layout.nGood} good photos`} />
        <Stat label="Photos for a person" tone="warn" value={now.review} base={real.review} sub={`${Math.round((now.review / total) * 100)}% of all photos`} />
        <Stat label="Settled by the agent" tone="ok" value={Math.round(((total - now.review) / total) * 100)} base={Math.round(((total - real.review) / total) * 100)} sub="without anyone looking" lowerIsBetter={false} suffix="%" />
      </div>

      <div className="grid g-12">
        <section className="card card-pad span-7">
          <h2 className="panel-title">By photo type</h2>
          <div className="lb-bars">
            {Object.entries(now.cat).map(([c, t]) => (
              <div key={c} className="lb-bar-row">
                <span>{CATEGORY[c] || prettyName(c)}</span>
                <div className="stacked">
                  {["DEFECT", "REVIEW", "OK"].map((k) => t[k] ? <motion.i key={k} layout style={{ background: OUTCOME[k].color }} animate={{ width: `${(t[k] / t.n) * 100}%` }} transition={{ type: "spring", stiffness: 260, damping: 30 }} title={`${t[k]} ${OUTCOME[k].label.toLowerCase()}`}>{t[k]}</motion.i> : null)}
                </div>
                <span className="num muted">{t.n}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad span-5">
          <h2 className="panel-title">Every pair of lines</h2>
          <p className="hint">Each dot is one pair. Lower left is better: fewer people needed and fewer mistakes. Click one to try it.</p>
          <svg viewBox="0 0 340 226" className="lb-trade" role="img" aria-label="Trade-off between photos needing a person and mistakes">
            <line x1="36" x2="332" y1="188" y2="188" stroke="var(--line-2)" /><line x1="36" x2="36" y1="20" y2="188" stroke="var(--line-2)" />
            <text x="184" y="216" textAnchor="middle" className="t-label">photos that need a person</text>
            <text x="12" y="104" textAnchor="middle" className="t-label" transform="rotate(-90 12 104)">mistakes</text>
            <text x="36" y="204" textAnchor="middle" className="t-label">0%</text><text x="328" y="204" textAnchor="end" className="t-label">{Math.round(grid.maxWork * 100)}%</text>
            <text x="30" y="192" textAnchor="end" className="t-label">0</text><text x="30" y="30" textAnchor="end" className="t-label">{grid.maxBad}</text>
            {grid.pts.map((p, i) => <circle key={i} cx={tradeX(p.work)} cy={tradeY(p.bad)} r="3.2" className="lb-pt" onClick={() => setLines({ dismiss: p.dismiss, confirm: p.confirm })} />)}
            <polyline points={grid.front.map((p) => `${tradeX(p.work)},${tradeY(p.bad)}`).join(" ")} fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinejoin="round" pointerEvents="none" />
            <motion.circle r="7" fill="none" stroke="var(--text)" strokeWidth="2.4" animate={{ cx: tradeX(now.review / total), cy: tradeY(now.misses + now.falseAlarms) }} transition={{ type: "spring", stiffness: 300, damping: 26 }} pointerEvents="none" />
          </svg>
          <p className="hint">The gold line is the best trade-off found.</p>
        </section>
      </div>

      <p className="lb-note"><Info size={16} /> The agent's lines and its edge setting were chosen while looking at these same photos, so lines that look perfect here would do worse on new ones. This is a way to understand the trade-off, not a guarantee.</p>
    </div>
  );
}
