import { motion } from "framer-motion";
import { TONE_COLOR, TOOLS } from "../lib/constants";
import { num } from "../lib/format";

const clamp = (x) => Math.min(1, Math.max(0, x));
const toolLabel = (by) => TOOLS[by]?.label || by;
const CHAR = 6.3;                                  // about how wide one character of the step label is
const ROW_GAP = 13;

/** Put each step label on the first row where it does not touch the one before it. */
function layoutLabels(items) {
  const ends = [];
  const rows = {};
  [...items].sort((a, b) => a.cx - b.cx).forEach((it) => {
    let r = 0;
    while (ends[r] != null && it.cx - it.w / 2 < ends[r] + 5) r += 1;
    ends[r] = it.cx + it.w / 2;
    rows[it.i] = r;
  });
  return { rows, count: ends.length };
}

/**
 * Where a score sits (normal / needs a look / confirmed) and the path the agent took to get there.
 * history: [{ by, score }]. New steps animate in, so passing a growing list shows the agent working.
 */
export default function ScoreTrack({ history, cfg = { dismiss: 0.15, confirm: 0.7 }, tone = "warn", className = "" }) {
  const W = 420, X0 = 12, X1 = 408, L = X1 - X0;
  const x = (s) => X0 + clamp(s) * L;
  const labelOf = (h) => `${toolLabel(h.by)} ${num(h.score)}`;
  const items = history.map((h, i) => ({ i, cx: Math.max(38, Math.min(W - 38, x(h.score))), w: labelOf(h).length * CHAR }));
  const { rows, count } = layoutLabels(items);
  const Y = 14 + Math.max(count, 2) * ROW_GAP + 22;      // the bar sits below however many label rows are needed
  const zones = [[0, cfg.dismiss, "ok", "normal"], [cfg.dismiss, cfg.confirm, "warn", "needs a look"], [cfg.confirm, 1, "bad", "confirmed"]];
  const label = history.map((h) => labelOf(h)).join(", ");

  return (
    <svg className={`track ${className}`} viewBox={`0 0 ${W} ${Y + 54}`} role="img" aria-label={`Score history: ${label}`}>
      {zones.map(([a, b, t, text]) => (
        <g key={text}>
          <rect x={x(a)} y={Y - 7} width={x(b) - x(a)} height={14} rx={4} fill={TONE_COLOR[t]} opacity={0.22} />
          <text x={(x(a) + x(b)) / 2} y={Y + 29} textAnchor="middle" className="t-label">{text}</text>
        </g>
      ))}
      {[cfg.dismiss, cfg.confirm].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={Y - 11} y2={Y + 11} stroke="var(--text-3)" strokeWidth="1" />
          <text x={x(v)} y={Y + 46} textAnchor="middle" className="t-label">{v.toFixed(2)}</text>
        </g>
      ))}
      {history.slice(1).map((h, i) => {
        const x1 = x(history[i].score), x2 = x(h.score);
        return (
          <motion.path key={`arc-${i}`} d={`M${x1} ${Y} Q${(x1 + x2) / 2} ${Y - 24} ${x2} ${Y}`} fill="none" stroke="var(--text-2)" strokeWidth="1.3"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.6 }} transition={{ duration: 0.55, ease: "easeOut" }} />
        );
      })}
      {history.map((h, i) => {
        const last = i === history.length - 1 && history.length > 1;
        return (
          <g key={`dot-${i}`}>
            <motion.text x={items[i].cx} y={11 + rows[i] * ROW_GAP} textAnchor="middle" className="t-step" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              {labelOf(h)}
            </motion.text>
            <motion.circle cx={x(h.score)} cy={Y} r={last ? 7.5 : 5.5} stroke="var(--surface)" strokeWidth="2.2"
              fill={last ? TONE_COLOR[tone] : i === 0 ? "var(--text)" : "var(--gold)"}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} />
          </g>
        );
      })}
    </svg>
  );
}
