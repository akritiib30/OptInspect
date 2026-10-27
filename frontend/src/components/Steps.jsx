import { TOOLS } from "../lib/constants";
import { num } from "../lib/format";

/** The agent's path for one defect: each look, why it was taken, and how the score moved. */
export default function Steps({ history }) {
  return (
    <ol className="steps">
      {history.map((h, i) => {
        const T = TOOLS[h.by] || TOOLS.detector;
        const Icon = T.icon;
        const delta = i ? h.score - history[i - 1].score : null;
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
