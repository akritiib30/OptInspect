import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { SCENARIOS, ORDER, TIMES, drawScene, duration, defectView, makeScene, stateAt } from "../lib/scanner";

/**
 * The live scanner. Three ways to run it:
 *   autoplay (default)  loops through the scenarios on its own clock, for the hero
 *   runKey + scenario   plays one scenario each time runKey changes, for the demo
 *   time                draws the scenario at exactly this many seconds, for scroll-driven storytelling
 * `onChange` receives { scenario, phase, stepIdx, views, done } whenever the phase or step changes.
 */
export default function ScannerCanvas({ scenario = "auto", runKey = 0, time = null, order = ORDER, paused = false, onChange, label = "bottle", normal = "13.8", className = "", ariaLabel }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const reduced = useReducedMotion();
  const live = useRef({});
  live.current = { scenario, runKey, time, order, paused, onChange, label, normal, reduced };

  useEffect(() => {
    const el = canvas.current, box = wrap.current, g = el.getContext("2d");
    let raf = 0, scene = null, size = 0, visible = true;
    let startedAt = performance.now(), lastKey = live.current.runKey, seq = 0, lastSig = "";
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      const r = box.getBoundingClientRect();
      const s = Math.round(r.width);
      if (!s || s === size) return;
      size = s;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = el.height = Math.round(s * dpr);
      el.style.width = el.style.height = `${s}px`;
      scene = makeScene(s, dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(box);
    const onMove = (e) => {
      const r = box.getBoundingClientRect();
      mouse.tx = clamp((e.clientX - (r.left + r.width / 2)) / window.innerWidth * 2);
      mouse.ty = clamp((e.clientY - (r.top + r.height / 2)) / window.innerHeight * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const p = live.current;
      if (!scene || !visible) return;
      if (p.runKey !== lastKey) { lastKey = p.runKey; startedAt = now; }
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;

      let sc, t;
      const wall = now / 1000;
      if (p.time != null) {
        sc = SCENARIOS[p.scenario === "auto" ? p.order[0] : p.scenario];
        t = p.time;
      } else if (p.reduced) {
        sc = SCENARIOS[p.scenario === "auto" ? p.order[0] : p.scenario];
        t = duration(sc) - TIMES.hold * 0.6;
      } else if (p.scenario === "auto") {
        let local = (now - startedAt) / 1000;
        let sc0 = SCENARIOS[p.order[seq % p.order.length]];
        while (local > duration(sc0)) { local -= duration(sc0); startedAt += duration(sc0) * 1000; seq += 1; sc0 = SCENARIOS[p.order[seq % p.order.length]]; }
        sc = sc0; t = local;
      } else {
        sc = SCENARIOS[p.scenario];
        t = Math.min((now - startedAt) / 1000, duration(sc));
        if (p.paused) t = 0;
      }
      const st = drawScene(g, scene, sc, t, { time: p.reduced ? 3 : wall, mouse: p.reduced ? { x: 0, y: 0 } : mouse, label: p.label, normal: p.normal });

      if (p.onChange) {
        const sig = `${sc.id}|${st.phase}|${st.stepIdx}`;
        if (sig !== lastSig) {
          lastSig = sig;
          p.onChange({ scenario: sc.id, phase: st.phase, stepIdx: st.stepIdx, views: sc.defects.map((d) => defectView(d, st)), done: st.phase === "hold" || (p.scenario !== "auto" && t >= duration(sc) - 0.001) });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <div ref={wrap} className={`scanner ${className}`} role="img" aria-label={ariaLabel || "Animated scan of a bottle opening, with a defect being found and checked again"}>
      <canvas ref={canvas} />
    </div>
  );
}

const clamp = (x) => Math.max(-1, Math.min(1, x));
