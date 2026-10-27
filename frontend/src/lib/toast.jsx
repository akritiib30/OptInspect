import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, Info, X } from "lucide-react";

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const ICON = { ok: CircleCheck, bad: CircleX, info: Info };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(({ tone = "info", title, message, ms = 4200 }) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list.slice(-3), { id, tone, title, message }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const value = useMemo(() => ({
    toast,
    ok: (title, message) => toast({ tone: "ok", title, message }),
    error: (title, message) => toast({ tone: "bad", title, message, ms: 6500 }),
    info: (title, message) => toast({ tone: "info", title, message }),
  }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICON[t.tone] || Info;
            return (
              <motion.div key={t.id} layout className={`toast ${t.tone}`}
                initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>
                <Icon size={20} />
                <div><b>{t.title}</b>{t.message ? <p>{t.message}</p> : null}</div>
                <button className="btn btn-quiet btn-sm btn-icon" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={16} /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
