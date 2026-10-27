import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const MAX_SIDE = 1024;

/**
 * A photo you can paint a defect on. The paint is a soft mask; the picture is the photo blended toward black or white by
 * (mask x strength), which is exactly how the server paints its test defects (labs.paint), so what you see is what is inspected.
 * Tools: brush (a soft blob), scratch (a thin line), eraser. Children are drawn on top (boxes from the agent).
 */
const Painter = forwardRef(function Painter({ src, tool, size, strength, tone, spotMode = false, spot = null, onSpot, onStrokeEnd, onPainted, scanning = false, children }, ref) {
  const canvas = useRef(null);
  const ring = useRef(null);
  const [dims, setDims] = useState(null);
  const live = useRef({});
  live.current = { tool, size, strength, tone };
  const cb = useRef({});
  cb.current = { onSpot, onStrokeEnd, onPainted, spotMode };
  const st = useRef({ base: null, mask: null, w: 0, h: 0, undo: [], drawing: false, last: null, painted: false });

  const render = useCallback((x0, y0, x1, y1) => {
    const s = st.current;
    if (!s.base) return;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(s.w, Math.ceil(x1)); y1 = Math.min(s.h, Math.ceil(y1));
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;
    const ctx = canvas.current.getContext("2d");
    const out = ctx.createImageData(rw, rh);
    const k = live.current.strength, target = live.current.tone === "light" ? 255 : 0;
    const bd = s.base.data, md = s.mask, od = out.data;
    for (let y = 0; y < rh; y++) {
      let mi = (y0 + y) * s.w + x0, bi = mi * 4, oi = y * rw * 4;
      for (let x = 0; x < rw; x++, mi++, bi += 4, oi += 4) {
        const a = md[mi] * k, b = 1 - a;
        od[oi] = bd[bi] * b + target * a;
        od[oi + 1] = bd[bi + 1] * b + target * a;
        od[oi + 2] = bd[bi + 2] * b + target * a;
        od[oi + 3] = 255;
      }
    }
    ctx.putImageData(out, x0, y0);
  }, []);

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = canvas.current;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      st.current = { base: ctx.getImageData(0, 0, w, h), mask: new Float32Array(w * h), w, h, undo: [], drawing: false, last: null, painted: false };
      setDims({ w, h });
      cb.current.onPainted?.(false);
    };
    img.src = src;
    return () => { alive = false; };
  }, [src]);

  useEffect(() => {                                   // strength or tone changed: repaint what is already there
    const s = st.current;
    if (s.base && s.painted) render(0, 0, s.w, s.h);
  }, [strength, tone, render]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect(), s = st.current;
    return { x: ((e.clientX - r.left) / r.width) * s.w, y: ((e.clientY - r.top) / r.height) * s.h, k: s.w / r.width, nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  };

  const stamp = (cx, cy, k) => {
    const s = st.current, { tool: t, size: sz } = live.current;
    const R = Math.max(1, sz * k), scratch = t === "scratch";
    const sigma = Math.max(1, R * 0.08);              // a scratch is thin: a few pixels wide however big the slider
    const reach = scratch ? sigma * 3 : R;
    const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(s.w, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(s.h, Math.ceil(cy + reach));
    const md = s.mask;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
        let w;
        if (scratch) w = Math.exp(-d2 / (2 * sigma * sigma));
        else { const d = d2 / (R * R); w = d >= 1 ? 0 : Math.pow(1 - d, 1.4); }
        if (w <= 0.002) continue;
        const i = y * s.w + x;
        if (t === "eraser") md[i] = Math.max(0, md[i] - w * 1.6);
        else if (w > md[i]) md[i] = w;
      }
    }
    render(x0, y0, x1, y1);
  };

  const strokeTo = (x, y, k) => {
    const s = st.current, last = s.last;
    s.last = { x, y };
    if (!last) { stamp(x, y, k); return; }
    const step = Math.max(1, live.current.tool === "scratch" ? 1.5 : live.current.size * k * 0.28);
    const dx = x - last.x, dy = y - last.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
    for (let i = 1; i <= n; i++) stamp(last.x + (dx * i) / n, last.y + (dy * i) / n, k);
  };

  const moveRing = (e) => {
    const r = canvas.current.getBoundingClientRect(), el = ring.current;
    if (!el) return;
    el.style.opacity = 1;
    el.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
  };

  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = point(e), s = st.current;
    if (cb.current.spotMode) { cb.current.onSpot?.({ x: p.nx, y: p.ny }); return; }
    if (!s.base) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* capture is a nicety: strokes still work without it */ }
    s.undo.push(s.mask.slice());
    if (s.undo.length > 12) s.undo.shift();
    s.drawing = true; s.last = null; s.painted = true;
    strokeTo(p.x, p.y, p.k);
  };
  const onMove = (e) => {
    moveRing(e);
    if (st.current.drawing) { const p = point(e); strokeTo(p.x, p.y, p.k); }
  };
  const end = () => {
    const s = st.current;
    if (!s.drawing) return;
    s.drawing = false; s.last = null;
    cb.current.onPainted?.(true);
    cb.current.onStrokeEnd?.();
  };

  useImperativeHandle(ref, () => ({
    blob: () => new Promise((resolve) => canvas.current.toBlob(resolve, "image/png")),
    undo() {
      const s = st.current, m = s.undo.pop();
      if (!m) return;
      s.mask = m;
      render(0, 0, s.w, s.h);
      s.painted = m.some((v) => v > 0);
      cb.current.onPainted?.(s.painted);
      cb.current.onStrokeEnd?.();
    },
    clear() {
      const s = st.current;
      if (!s.base) return;
      s.undo.push(s.mask.slice());
      s.mask.fill(0); s.painted = false;
      render(0, 0, s.w, s.h);
      cb.current.onPainted?.(false);
    },
    /** Put one defect at a spot (0..1) with the current tool and settings. */
    drop(nx, ny) {
      const s = st.current;
      if (!s.base) return;
      const k = s.w / canvas.current.getBoundingClientRect().width, len = live.current.size * k * 2.6;
      s.undo.push(s.mask.slice());
      s.painted = true; s.last = null;
      const cx = nx * s.w, cy = ny * s.h;
      if (live.current.tool === "scratch") {
        const a = (35 * Math.PI) / 180;
        strokeTo(cx - Math.cos(a) * len / 2, cy - Math.sin(a) * len / 2, k);
        strokeTo(cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2, k);
      } else strokeTo(cx, cy, k);
      s.last = null;
      cb.current.onPainted?.(true);
      cb.current.onStrokeEnd?.();
    },
    canUndo: () => st.current.undo.length > 0,
  }), [render]);

  const ringSize = tool === "scratch" ? 12 : Math.max(8, size * 2);
  return (
    <div className={`vw painter ${scanning ? "scanning" : ""} ${spotMode ? "spot-mode" : ""}`}
      style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : "1 / 1", "--inv": 1 }}>
      <canvas ref={canvas} className="painter-canvas" aria-label="Photo to paint a defect on. Drag to paint."
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
        onPointerLeave={() => { if (ring.current) ring.current.style.opacity = 0; end(); }} />
      <div ref={ring} className={`painter-ring ${spotMode ? "spot" : tool}`} style={{ width: spotMode ? 34 : ringSize, height: spotMode ? 34 : ringSize }} aria-hidden="true" />
      {spot ? <span className="painter-spot" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }} aria-hidden="true"><i /><i /></span> : null}
      {children}
    </div>
  );
});

export default Painter;
