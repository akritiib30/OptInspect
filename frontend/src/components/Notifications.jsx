import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CircleCheck, ClipboardCheck } from "lucide-react";
import { feedLine } from "../lib/events";
import { ago } from "../lib/format";
import { useNow } from "../lib/hooks";

export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

export default function Notifications({ waiting = 0, activity = [] }) {
  const { open, setOpen, ref } = usePopover();
  const now = useNow(30000);
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="btn btn-quiet btn-icon" onClick={() => setOpen(!open)} aria-label={`Notifications${waiting ? `, ${waiting} waiting for review` : ""}`} aria-expanded={open}>
        <Bell size={19} />
        {waiting > 0 ? <motion.span key={waiting} className="bell-badge" initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>{waiting}</motion.span> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="pop pop-wide" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16 }}>
            <header className="pop-head"><h3>Notifications</h3></header>
            {waiting > 0 ? (
              <Link to="/app/review" className="pop-hot" onClick={() => setOpen(false)}>
                <ClipboardCheck size={18} /><span><b>{waiting} defect{waiting === 1 ? "" : "s"}</b> waiting for a person</span>
              </Link>
            ) : <p className="pop-empty"><CircleCheck size={16} /> Nothing is waiting for you.</p>}
            <ul className="pop-list">
              {activity.slice(0, 8).map((e) => {
                const l = feedLine(e);
                const Icon = l.icon;
                return (
                  <li key={`${e.inspection_id}-${e.step}`}>
                    <Link to={`/app/inspections/${e.inspection_id}`} onClick={() => setOpen(false)}>
                      <span className={`pop-icon ${l.tone}`}><Icon size={15} /></span>
                      <span className="pop-text">{l.text}<small>{ago(e.time, now)}</small></span>
                    </Link>
                  </li>
                );
              })}
              {!activity.length ? <li className="pop-empty">Activity will show up here.</li> : null}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
