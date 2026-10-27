import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

// A number that counts up when it scrolls into view, and counts from the old value when it changes.
export default function Counter({ value, decimals = 0, duration = 1.3, prefix = "", suffix = "", className = "", once = true }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-8% 0px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) { setShown(value); return undefined; }
    const controls = animate(from.current, value, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { from.current = v; setShown(v); } });
    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  const text = decimals ? Number(shown).toFixed(decimals) : Math.round(shown).toLocaleString();
  return <span ref={ref} className={`num ${className}`}>{prefix}{text}{suffix}</span>;
}
