import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { fakeHash } from "../lib/format";

/**
 * A picture of how the audit log protects itself: every entry carries a fingerprint of the entry before it.
 * Pass `tamperAt` to change that entry's text and watch every later link break.
 * (The product uses SHA-256 over each stored line; this illustration uses a short stand-in hash.)
 */
export default function HashChain({ entries, tamperAt = null, compact = false }) {
  const rows = useMemo(() => {
    const sealed = [];
    let prev = "start";
    entries.forEach((e, i) => { const h = fakeHash(prev + e.text); sealed.push({ prev, hash: h }); prev = h; });
    const now = [];
    prev = "start";
    entries.forEach((e, i) => {
      const text = tamperAt === i ? `${e.text} (edited)` : e.text;
      const h = fakeHash(prev + text);
      now.push({ text, prev, hash: h });
      prev = h;
    });
    const broken = now.findIndex((r, i) => r.hash !== sealed[i].hash);
    return { sealed, now, broken };
  }, [entries, tamperAt]);

  return (
    <div className={`chain ${compact ? "compact" : ""}`}>
      <AnimatePresence initial={false}>
        {rows.now.map((r, i) => {
          const bad = rows.broken !== -1 && i >= rows.broken;
          const edited = tamperAt === i;
          return (
            <motion.div key={i} layout className={`chain-row ${bad ? "bad" : ""}`}
              initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30, delay: compact ? 0 : i * 0.05 }}>
              <span className="chain-dot">{bad ? <ShieldAlert size={14} /> : <Link2 size={14} />}</span>
              <div className="chain-body">
                <b>{r.text}</b>
                <span className="chain-hash num">
                  <i>previous</i> {r.prev === "start" ? "start of log" : r.prev}
                  <i>this entry</i> {r.hash}
                </span>
              </div>
              {edited ? <span className="tag bad plain">edited</span> : bad ? <span className="tag bad plain">link broken</span> : <span className="tag ok plain">sealed</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className={`chain-verdict ${rows.broken === -1 ? "ok" : "bad"}`} role="status">
        {rows.broken === -1 ? <><ShieldCheck size={18} /> Chain intact. Nothing changed, reordered or removed.</>
          : <><ShieldAlert size={18} /> Chain broken at entry {rows.broken + 1}. Everything after it no longer matches.</>}
      </div>
    </div>
  );
}
