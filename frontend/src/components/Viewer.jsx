import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minus, Plus } from "lucide-react";
import { viewUrl } from "../lib/api";
import { STATUSES, colorOf } from "../lib/constants";
import { num } from "../lib/format";

const MAX_ZOOM = 8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * The viewing field. Zoom with the wheel or the buttons, drag to pan, double-click to zoom in or out.
 * modes: test | reference | diff | blend | split. Boxes lock on when they first appear.
 */
export default function Viewer({ result, mode = "test", showBoxes = true, selected = null, onSelect, only = null, focusKey = null, scanning = false, className = "", controls = true, maxHeight = "76vh" }) {
  const [dw, dh] = result.display_size || [256, 256];
  const [ww, wh] = result.work_size || [dw, dh];
  const sx = dw / ww, sy = dh / wh;
  const id = result.inspection_id;
  const wrap = useRef(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const [mix, setMix] = useState(50);
  const drag = useRef(null);
  const size = useRef({ w: 1, h: 1 });

  const measure = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) size.current = { w: r.width, h: r.height };
  }, []);
  useEffect(() => { measure(); const ro = new ResizeObserver(measure); ro.observe(wrap.current); return () => ro.disconnect(); }, [measure]);

  const bound = (x, y, k) => ({ k, x: clamp(x, size.current.w * (1 - k), 0), y: clamp(y, size.current.h * (1 - k), 0) });
  const zoomAt = useCallback((cx, cy, factor) => setT((p) => {
    const k = clamp(p.k * factor, 1, MAX_ZOOM), ratio = k / p.k;
    return bound(cx - (cx - p.x) * ratio, cy - (cy - p.y) * ratio, k);
  }), []);

  useEffect(() => {
    const el = wrap.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // zoom to a defect when asked (focusKey changes)
  useEffect(() => {
    if (!focusKey || selected == null || !result.defects[selected]) return;
    const [bx, by, bw, bh] = result.defects[selected].box;
    const { w, h } = size.current;
    const cx = ((bx + bw / 2) * sx / dw) * w, cy = ((by + bh / 2) * sy / dh) * h;
    const wpx = (bw * sx / dw) * w;
    const k = clamp((0.3 * w) / Math.max(wpx, 8), 2, 5);
    setT(bound(w / 2 - cx * k, h / 2 - cy * k, k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const onDown = (e) => {
    if (e.target.closest("button, input, .vw-controls")) return;
    drag.current = { x: e.clientX, y: e.clientY, t };
    wrap.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current || t.k === 1) return;
    const d = drag.current;
    setT(bound(d.t.x + e.clientX - d.x, d.t.y + e.clientY - d.y, d.t.k));
  };
  const onUp = () => { drag.current = null; };
  const onDouble = (e) => {
    const r = wrap.current.getBoundingClientRect();
    if (t.k > 1) setT({ x: 0, y: 0, k: 1 }); else zoomAt(e.clientX - r.left, e.clientY - r.top, 2.6);
  };
  const center = (f) => zoomAt(size.current.w / 2, size.current.h / 2, f);
  const onKey = (e) => {
    if (e.key === "+" || e.key === "=") { center(1.4); e.preventDefault(); }
    else if (e.key === "-") { center(1 / 1.4); e.preventDefault(); }
    else if (e.key === "0") { setT({ x: 0, y: 0, k: 1 }); e.preventDefault(); }
  };

  const boxes = showBoxes && mode !== "reference" && mode !== "split" && mode !== "blend";
  const base = mode === "reference" ? "reference" : mode === "diff" ? "diff" : "test";

  return (
    <div ref={wrap} className={`vw ${t.k > 1 ? "zoomed" : ""} ${scanning ? "scanning" : ""} ${className}`} style={{ aspectRatio: `${dw} / ${dh}`, maxWidth: `calc(${maxHeight} * ${dw / dh})`, marginInline: "auto", "--inv": 1 / t.k, "--pos": `${mix}%` }}
      tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDouble}
      role="group" aria-label="Photo viewer. Use plus and minus to zoom, zero to reset.">
      <div className="vp" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}>
        {mode === "blend" || mode === "split" ? (
          <>
            <img src={viewUrl(id, "reference")} alt="Good reference" draggable="false" />
            <img className={mode === "blend" ? "blend-top" : "split-top"} style={mode === "blend" ? { opacity: mix / 100 } : undefined} src={viewUrl(id, "test")} alt="Inspected photo" draggable="false" />
            {mode === "split" ? <div className="split-handle" /> : null}
          </>
        ) : (
          <img src={viewUrl(id, base)} alt={base === "test" ? `Photo ${result.photo_name}` : base === "diff" ? "Difference heat map" : "Good reference"} draggable="false" />
        )}
        {boxes ? result.defects.map((d, i) => {
          if (only != null && only !== i) return null;
          const [bx, by, bw, bh] = d.box, pad = 6;
          const color = colorOf(STATUSES, d.status);
          return (
            <motion.button key={i} type="button" className={`vbox ${selected === i ? "sel" : ""}`} onClick={() => onSelect?.(i)} aria-label={`Defect ${i + 1}, ${STATUSES[d.status]?.label || d.status}, score ${num(d.final_score)}`}
              style={{ left: `${((bx - pad) * sx / dw) * 100}%`, top: `${((by - pad) * sy / dh) * 100}%`, width: `${((bw + 2 * pad) * sx / dw) * 100}%`, height: `${((bh + 2 * pad) * sy / dh) * 100}%`, "--c": color }}
              initial={{ opacity: 0, scale: 1.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 + i * 0.12 }}>
              <i className="vc a" /><i className="vc b" /><i className="vc c" /><i className="vc d" />
              <span className="vlabel">{i + 1}<small className="num">{num(d.final_score)}</small></span>
            </motion.button>
          );
        }) : null}
      </div>
      {mode === "blend" || mode === "split" ? (
        <input className="vw-slider" type="range" min="0" max="100" value={mix} onChange={(e) => setMix(Number(e.target.value))} aria-label={mode === "blend" ? "Blend between the good reference and the inspected photo" : "Slide between the good reference and the inspected photo"} />
      ) : null}
      {mode === "split" ? <><span className="cmp-tag left">Inspected</span><span className="cmp-tag right">Reference</span></> : null}
      {["tl", "tr", "bl", "br"].map((c) => <i key={c} className={`vcorner ${c}`} />)}
      {controls ? (
        <div className="vw-controls">
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => center(1 / 1.5)} aria-label="Zoom out"><Minus size={16} /></button>
          <span className="num" aria-live="polite">{Math.round(t.k * 100)}%</span>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => center(1.5)} aria-label="Zoom in"><Plus size={16} /></button>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setT({ x: 0, y: 0, k: 1 })} aria-label="Fit to view"><Maximize2 size={15} /></button>
        </div>
      ) : null}
    </div>
  );
}
