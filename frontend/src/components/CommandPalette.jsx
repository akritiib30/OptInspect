import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Boxes, ClipboardCheck, CornerDownLeft, FlaskConical, History, LayoutDashboard, LifeBuoy, LogOut, Moon, Search, ScanLine, Settings, ShieldCheck, SlidersHorizontal, Sun, Swords, Users } from "lucide-react";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { prettyName } from "../lib/format";

/** Ctrl+K: jump anywhere, run an action, or find an inspection by name. */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { can, signOut } = useAuth();
  const { effective, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef(null);
  const { data: recent } = useApi("/api/inspections?limit=60", { enabled: open });

  const items = useMemo(() => {
    const go = (to) => () => navigate(to);
    const list = [
      { group: "Go to", label: "Dashboard", icon: LayoutDashboard, run: go("/app/dashboard") },
      ...(can.inspect ? [{ group: "Go to", label: "Inspect photos", icon: ScanLine, run: go("/app/inspect") }] : []),
      { group: "Go to", label: "Inspections", icon: History, run: go("/app/inspections") },
      { group: "Go to", label: "Review queue", icon: ClipboardCheck, run: go("/app/review") },
      { group: "Go to", label: "Audit log", icon: ShieldCheck, run: go("/app/audit") },
      { group: "Go to", label: "Insights", icon: Activity, run: go("/app/insights") },
      { group: "Go to", label: "Stress test: paint a defect", icon: FlaskConical, run: go("/app/stress") },
      { group: "Go to", label: "Challenge: you against the agent", icon: Swords, run: go("/app/challenge") },
      { group: "Go to", label: "Tolerance lab: move the decision lines", icon: SlidersHorizontal, run: go("/app/lab") },
      { group: "Go to", label: "Products", icon: Boxes, run: go("/app/products") },
      ...(can.admin ? [{ group: "Go to", label: "Team", icon: Users, run: go("/app/team") }] : []),
      { group: "Go to", label: "Settings", icon: Settings, run: go("/app/settings") },
      { group: "Go to", label: "Help and shortcuts", icon: LifeBuoy, run: go("/app/help") },
      { group: "Actions", label: `Switch to ${effective === "dark" ? "light" : "dark"} theme`, icon: effective === "dark" ? Sun : Moon, run: toggle },
      { group: "Actions", label: "Verify every audit log", icon: ShieldCheck, run: go("/app/audit?verify=1") },
      { group: "Actions", label: "Sign out", icon: LogOut, run: signOut },
      ...(recent || []).map((r) => ({ group: "Inspections", label: prettyName(r.photo_name), hint: r.product, icon: ScanLine, run: go(`/app/inspections/${r.inspection_id}`) })),
    ];
    const s = q.trim().toLowerCase();
    return s ? list.filter((x) => x.label.toLowerCase().includes(s) || (x.hint || "").toLowerCase().includes(s)) : list.filter((x) => x.group !== "Inspections").concat(list.filter((x) => x.group === "Inspections").slice(0, 4));
  }, [q, recent, can, effective, navigate, signOut, toggle]);

  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => setI(0), [q]);

  const choose = (item) => { onClose(); item?.run(); };
  const onKey = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[i]); }
  };
  useEffect(() => { document.querySelector(".cp-item.on")?.scrollIntoView({ block: "nearest" }); }, [i]);

  let lastGroup = null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="overlay cp-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div className="cp" role="dialog" aria-modal="true" aria-label="Command palette" initial={{ opacity: 0, y: -18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: "spring", stiffness: 460, damping: 34 }}>
            <div className="cp-input"><Search size={18} /><input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Jump to a page, run an action, or find an inspection" aria-label="Search commands" /><span className="kbd">Esc</span></div>
            <ul className="cp-list" role="listbox">
              {items.map((it, n) => {
                const header = it.group !== lastGroup ? <li key={`h-${it.group}`} className="cp-group" role="presentation">{it.group}</li> : null;
                lastGroup = it.group;
                const Icon = it.icon;
                return [header, (
                  <li key={`${it.group}-${it.label}-${n}`} role="option" aria-selected={n === i} className={`cp-item ${n === i ? "on" : ""}`} onMouseEnter={() => setI(n)} onClick={() => choose(it)}>
                    <Icon size={17} /><span>{it.label}</span>{it.hint ? <small>{it.hint}</small> : null}{n === i ? <CornerDownLeft size={15} className="cp-enter" /> : null}
                  </li>
                )];
              })}
              {!items.length ? <li className="cp-empty">Nothing matches "{q}".</li> : null}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
