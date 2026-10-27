import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { STATUSES, VERDICTS } from "../lib/constants";
import { hueOf, initials } from "../lib/format";

export function VerdictTag({ value }) {
  const v = VERDICTS[value] || { label: value, tone: "mute" };
  return <span className={`tag ${v.tone}`}>{v.label}</span>;
}

export function StatusTag({ value }) {
  const v = STATUSES[value] || { label: value, tone: "mute" };
  return <span className={`tag ${v.tone}`}>{v.label}</span>;
}

export function Avatar({ name, size = 34 }) {
  const h = hueOf(name);
  return (
    <span className="avatar" aria-hidden="true"
      style={{ "--s": `${size}px`, background: `linear-gradient(135deg, hsl(${h} 70% 54%), hsl(${(h + 52) % 360} 76% 42%))` }}>
      {initials(name)}
    </span>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 10, style }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

// A pill that glides between options.
export function Segmented({ options, value, onChange, id = "seg", label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {value === o.value ? <motion.span layoutId={`${id}-pill`} className="pill" transition={{ type: "spring", stiffness: 520, damping: 40 }} /> : null}
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// Concentric rings that breathe: the empty-state picture, and the idle picture for "nothing yet".
export function Rings({ size = 92, color = "var(--gold)" }) {
  return (
    <svg className="rings" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {[44, 31, 18].map((r, i) => (
        <motion.circle key={r} cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="1.6" strokeOpacity={0.9 - i * 0.2}
          animate={{ scale: [1, 1.06, 1], opacity: [1, 0.55, 1] }} transition={{ duration: 3.2, delay: i * 0.35, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "50px 50px" }} />
      ))}
      <circle cx="50" cy="50" r="4" fill={color} />
    </svg>
  );
}

export function EmptyState({ title, text, children }) {
  return (
    <div className="empty">
      <Rings />
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {children ? <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>{children}</div> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 560, dismissible = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && dismissible) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => ref.current?.querySelector("input, textarea, select, button.btn-primary")?.focus(), 60);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; clearTimeout(t); };
  }, [open, onClose, dismissible]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}>
          <motion.div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 26, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}>
            <div className="modal-head">
              <h2>{title}</h2>
              {dismissible ? <button className="btn btn-quiet btn-sm btn-icon spacer" onClick={onClose} aria-label="Close"><X size={18} /></button> : null}
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-foot">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
