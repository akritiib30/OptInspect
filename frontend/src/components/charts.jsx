import { useId, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Counter from "./Counter";

// Hand-drawn SVG charts. They animate in when they scroll into view and are readable without colour alone.

export function Sparkline({ data, width = 132, height = 40, color = "var(--gold)" }) {
  const id = useId();
  const max = Math.max(1, ...data);
  const step = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 4 - (v / max) * (height - 10)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      {last ? <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} /> : null}
    </svg>
  );
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
export function StackedBars({ series, keys, height = 200 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((s) => keys.reduce((a, k) => a + (s[k.key] || 0), 0)));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  return (
    <div className="sbars" ref={ref} style={{ "--h": `${height}px` }}>
      <div className="sb-grid" aria-hidden="true">{[1, 0.75, 0.5, 0.25, 0].map((f) => <div key={f}><span>{Math.round(top * f)}</span></div>)}</div>
      <div className="sb-cols">
        {series.map((s, i) => {
          const day = new Date(`${s.date}T12:00:00`);
          const total = keys.reduce((a, k) => a + (s[k.key] || 0), 0);
          return (
            <div key={s.date} className={`sb-col ${hover === i ? "on" : ""}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              role="img" aria-label={`${day.toLocaleDateString([], { day: "numeric", month: "short" })}: ${total} inspections`}>
              <div className="sb-stack">
                {keys.map((k) => (s[k.key] ? (
                  <motion.i key={k.key} style={{ height: `${(s[k.key] / top) * 100}%`, background: k.color, transformOrigin: "bottom" }}
                    initial={{ scaleY: 0 }} animate={inView ? { scaleY: 1 } : {}} transition={{ delay: i * 0.035, type: "spring", stiffness: 150, damping: 17 }} />
                ) : null))}
              </div>
              <span className="sb-x">{WEEKDAY[day.getDay()]}</span>
              {hover === i ? (
                <div className="sb-tip">
                  <b>{day.toLocaleDateString([], { day: "numeric", month: "short" })}</b>
                  <span>{total} inspection{total === 1 ? "" : "s"}</span>
                  {keys.filter((k) => s[k.key]).map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label} {s[k.key]}</span>)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Donut({ segments, size = 188, thickness = 22, center }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  let acc = 0;
  return (
    <div className="donut" ref={ref} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ") || "No data"}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {total ? segments.map((s, i) => {
          const len = (s.value / total) * C;
          const offset = -acc;
          acc += len;
          return (
            <motion.circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDashoffset={offset}
              initial={{ strokeDasharray: `0 ${C}` }} animate={inView ? { strokeDasharray: `${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}` } : {}}
              transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }} />
          );
        }) : null}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  );
}

export function RadialGauge({ value, size = 120, label, display }) {
  const id = useId();
  const r = (size - 16) / 2, cx = size / 2, cy = size / 2;
  const start = 135, sweep = 270;
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = pt(start), [x2, y2] = pt(start + sweep);
  const arc = `M${x1} ${y1} A${r} ${r} 0 1 1 ${x2} ${y2}`;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs><linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="#7b1fa2" /><stop offset=".5" stopColor="#e6446e" /><stop offset="1" stopColor="#ffd76b" /></linearGradient></defs>
        <path d={arc} fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinecap="round" />
        <motion.path d={arc} fill="none" stroke={`url(#${id})`} strokeWidth="9" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: v }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} />
      </svg>
      <div className="gauge-center"><b>{display ?? <Counter value={v * 100} suffix="%" />}</b>{label ? <span>{label}</span> : null}</div>
    </div>
  );
}

export function HBars({ items, max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  return (
    <div className="hbars" ref={ref}>
      {items.map((it, i) => (
        <div className="hbar" key={it.label}>
          <span className="hb-label">{it.label}</span>
          <div className="hb-track"><motion.i style={{ background: it.color || "var(--gold)" }} initial={{ width: 0 }} animate={inView ? { width: `${(it.value / top) * 100}%` } : {}} transition={{ duration: 0.9, delay: i * 0.08, ease: [0.2, 0.8, 0.2, 1] }} /></div>
          <span className="hb-value num">{it.display ?? it.value}</span>
        </div>
      ))}
    </div>
  );
}

// Ten bins from 0 to 1, tinted by the zone they fall in, with the two thresholds marked.
export function Histogram({ bins, cfg = { dismiss: 0.15, confirm: 0.7 }, height = 150, label = "Score distribution" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const max = Math.max(1, ...bins);
  const tone = (i) => ((i + 0.5) / bins.length >= cfg.confirm ? "var(--bad)" : (i + 0.5) / bins.length > cfg.dismiss ? "var(--warn)" : "var(--ok)");
  return (
    <div className="hist" ref={ref} style={{ "--h": `${height}px` }} role="img" aria-label={`${label}: ${bins.join(", ")}`}>
      <div className="hist-bars">
        {bins.map((n, i) => (
          <div key={i} className="hist-col">
            <motion.i style={{ height: `${(n / max) * 100}%`, background: tone(i), transformOrigin: "bottom" }} initial={{ scaleY: 0 }} animate={inView ? { scaleY: 1 } : {}} transition={{ delay: i * 0.05, type: "spring", stiffness: 150, damping: 16 }} />
            {n ? <b style={{ bottom: `calc(${(n / max) * 100}% + 4px)` }}>{n}</b> : null}
          </div>
        ))}
        <span className="hist-mark" style={{ left: `${cfg.dismiss * 100}%` }}><em>{cfg.dismiss}</em></span>
        <span className="hist-mark" style={{ left: `${cfg.confirm * 100}%` }}><em>{cfg.confirm}</em></span>
      </div>
      <div className="hist-axis"><span>0</span><span>score</span><span>1</span></div>
    </div>
  );
}
