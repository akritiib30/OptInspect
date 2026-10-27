// The animated bottle-mouth scanner. Pure canvas, and everything is a function of time:
// the same code runs on its own clock (hero), under a click (demo) or driven by scrolling (walkthrough).
// The scores in SCENARIOS are recorded from real runs of the inspector on MVTec AD bottle photos.

const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const outBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export const THRESHOLDS = { dismiss: 0.15, confirm: 0.7 };
const C = { amber: [255, 176, 32], rose: [255, 84, 112], mint: [61, 220, 151], gold: [255, 226, 170], white: [240, 244, 255] };

export const SCENARIOS = {
  break: {
    id: "break", title: "Broken rim", verdict: "defect", verdictText: "Defect confirmed",
    note: "Scores recorded from a real run on the MVTec bottle photo broken_large_0.",
    defects: [
      { angle: -0.62, r: 0.352, size: 0.062, kind: "shard", seed: 11, steps: [["Detector", 0.53, "first look"], ["Compare", 0.44, "fresh comparison with the good sample"], ["Contrast", 0.24, "local contrast boost"], ["Zoom", 0.93, "four times closer"]] },
      { angle: 2.5, r: 0.372, size: 0.04, kind: "shard", seed: 29, steps: [["Detector", 0.65, "first look"], ["Compare", 0.71, "fresh comparison with the good sample"]] },
    ],
  },
  chip: {
    id: "chip", title: "Small chip", verdict: "review", verdictText: "Needs a person",
    note: "Scores recorded from a real run on the MVTec bottle photo broken_small_0.",
    defects: [{ angle: 2.2, r: 0.33, size: 0.034, kind: "chip", seed: 5, steps: [["Detector", 0.68, "first look"], ["Compare", 0.68, "fresh comparison with the good sample"], ["Contrast", 0.07, "local contrast boost"]] }],
  },
  clean: {
    id: "clean", title: "Normal bottle", verdict: "pass", verdictText: "Passed",
    note: "Nothing rose above the normal level for this product.", defects: [],
  },
};
export const ORDER = ["break", "chip", "clean"];

// ---------- the timeline ----------
const T = { idle: 0.7, scan: 1.9, lock: 0.9, step: 1.2, clear: 0.6, verdict: 1.5, hold: 2.4 };
export const TIMES = T;
const extraSteps = (sc) => Math.max(0, ...sc.defects.map((d) => d.steps.length - 1));

export function duration(sc) {
  return T.idle + T.scan + (sc.defects.length ? T.lock + extraSteps(sc) * T.step : T.clear) + T.verdict + T.hold;
}

export function stateAt(sc, t) {
  const n = extraSteps(sc);
  const base = { phase: "idle", p: 0, scanP: 0, lockP: 0, stepIdx: 0, stepP: 0, verdictP: 0, holdP: 0 };
  let x = Math.max(0, t);
  if (x < T.idle) return { ...base, phase: "idle", p: x / T.idle };
  x -= T.idle;
  if (x < T.scan) return { ...base, phase: "scan", scanP: x / T.scan };
  const st = { ...base, scanP: 1 };
  x -= T.scan;
  if (sc.defects.length) {
    if (x < T.lock) return { ...st, phase: "lock", lockP: x / T.lock };
    st.lockP = 1;
    x -= T.lock;
    if (x < n * T.step) return { ...st, phase: "recheck", stepIdx: 1 + Math.floor(x / T.step), stepP: (x % T.step) / T.step };
    x -= n * T.step;
    st.stepIdx = n;
    st.stepP = 1;
  } else {
    if (x < T.clear) return { ...st, phase: "clear", p: x / T.clear };
    x -= T.clear;
  }
  if (x < T.verdict) return { ...st, phase: "verdict", verdictP: x / T.verdict };
  st.verdictP = 1;
  return { ...st, phase: "hold", holdP: clamp((x - T.verdict) / T.hold) };
}

// What one defect shows at this moment: which step, the (counting) score, whether it is settled.
export function defectView(d, st) {
  const last = d.steps.length - 1;
  const k = Math.min(st.stepIdx, last);
  const [name, score, why] = d.steps[k];
  let shown = score;
  if (st.phase === "recheck" && k > 0 && st.stepIdx <= last) shown = lerp(d.steps[k - 1][1], score, outCubic(clamp(st.stepP / 0.7)));
  const settled = st.phase === "verdict" || st.phase === "hold" || (st.phase === "recheck" && k === last && (st.stepIdx > last || st.stepP > 0.75));
  const final = d.steps[last][1];
  return { name, why, score: shown, step: k, steps: d.steps.length, settled, confirmed: final >= THRESHOLDS.confirm };
}

// ---------- the still part: lens, glass, opening, noise ----------
function buildBase(S, dpr) {
  const U = Math.max(2, Math.round(S * dpr));
  const cv = document.createElement("canvas");
  cv.width = cv.height = U;
  const g = cv.getContext("2d");
  const cx = U / 2, cy = U / 2;
  const circle = (r) => { g.beginPath(); g.arc(cx, cy, r * U, 0, TAU); };
  const annulus = (r0, r1, stops) => {
    const gr = g.createRadialGradient(cx, cy, r0 * U, cx, cy, r1 * U);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r1 * U, 0, TAU); g.arc(cx, cy, r0 * U, 0, TAU, true); g.fill("evenodd");
  };
  g.fillStyle = "#04060b";
  g.fillRect(0, 0, U, U);
  let gr = g.createRadialGradient(cx, cy, 0, cx, cy, U * 0.5);
  gr.addColorStop(0, "#111c38"); gr.addColorStop(0.7, "#0a0f1e"); gr.addColorStop(1, "#04060b");
  g.fillStyle = gr; circle(0.5); g.fill();
  annulus(0.465, 0.5, [[0, "#0a0f1d"], [0.5, "#1b2745"], [1, "#05070d"]]);
  // the ring light: a warm halo, like the lighting rings used in machine-vision rigs
  g.save();
  g.strokeStyle = "rgba(255,206,130,.18)"; g.lineWidth = U * 0.03; circle(0.452); g.stroke();
  g.shadowColor = "rgba(255,196,100,.95)"; g.shadowBlur = U * 0.035;
  g.strokeStyle = "rgba(255,232,186,.97)"; g.lineWidth = U * 0.0062; circle(0.452); g.stroke();
  g.restore();
  // the glass rim of the bottle
  annulus(0.2, 0.418, [[0, "#08101f"], [0.08, "#2c406a"], [0.3, "#172443"], [0.62, "#21345c"], [0.88, "#3a507f"], [1, "#0b1224"]]);
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = `rgba(190,210,255,${0.035 + (i % 3 === 0 ? 0.06 : 0)})`;
    g.lineWidth = U * 0.0022; circle(0.222 + i * 0.0158); g.stroke();
  }
  if (g.createConicGradient) {
    const glint = (r, w, start, stops) => {
      const cg = g.createConicGradient(start, cx, cy);
      stops.forEach(([o, col]) => cg.addColorStop(o, col));
      g.strokeStyle = cg; g.lineWidth = U * w; circle(r); g.stroke();
    };
    glint(0.408, 0.015, -1.05, [[0, "rgba(255,255,255,0)"], [0.05, "rgba(255,244,214,.8)"], [0.11, "rgba(255,255,255,0)"], [0.5, "rgba(255,255,255,0)"], [0.55, "rgba(150,190,255,.55)"], [0.62, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]]);
    glint(0.213, 0.011, 1.85, [[0, "rgba(255,255,255,0)"], [0.07, "rgba(190,215,255,.55)"], [0.15, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]]);
  }
  gr = g.createRadialGradient(cx, cy, 0, cx, cy, U * 0.2);
  gr.addColorStop(0, "#010205"); gr.addColorStop(0.75, "#04070f"); gr.addColorStop(1, "#0d1527");
  g.fillStyle = gr; circle(0.2); g.fill();
  g.strokeStyle = "rgba(120,150,230,.14)"; g.lineWidth = U * 0.004; circle(0.105); g.stroke();
  const rand = rng(7);
  for (let i = 0; i < 4200; i++) {
    const a = rand() * TAU, rr = Math.sqrt(rand()) * 0.5;
    g.fillStyle = `rgba(${rand() < 0.5 ? "200,220,255" : "255,235,200"},${0.012 + rand() * 0.05})`;
    g.fillRect(cx + Math.cos(a) * rr * U, cy + Math.sin(a) * rr * U, U * 0.0025, U * 0.0025);
  }
  gr = g.createRadialGradient(cx, cy, U * 0.3, cx, cy, U * 0.5);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = gr; circle(0.5); g.fill();
  return cv;
}

export function makeScene(size, dpr = 1) {
  return { size, dpr, base: buildBase(size, dpr) };
}

// ---------- the moving parts ----------
function defectShape(g, d, S) {
  const cx = S / 2 + Math.cos(d.angle) * d.r * S, cy = S / 2 + Math.sin(d.angle) * d.r * S;
  const r = rng(d.seed);
  const size = d.size * S;
  const n = d.kind === "chip" ? 6 : 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.55;
    const rad = size * (0.55 + r() * 0.65);
    pts.push([Math.cos(a) * rad * 1.35, Math.sin(a) * rad * 0.8]);
  }
  g.save();
  g.translate(cx, cy);
  g.rotate(d.angle + Math.PI / 2);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
  glow.addColorStop(0, "rgba(255,240,205,.55)"); glow.addColorStop(1, "rgba(255,240,205,0)");
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, size * 1.6, 0, TAU); g.fill();
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const fill = g.createLinearGradient(-size, -size * 0.6, size, size * 0.6);
  fill.addColorStop(0, "#fffbe9"); fill.addColorStop(0.55, "#ffe9b4"); fill.addColorStop(1, "#c9b183");
  g.fillStyle = fill; g.fill();
  g.strokeStyle = "rgba(20,16,10,.7)"; g.lineWidth = Math.max(1, S * 0.0022); g.stroke();
  g.strokeStyle = "rgba(20,16,10,.55)";
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * size * 1.1, Math.sin(a) * size * 0.8); g.stroke();
  }
  g.restore();
  return { x: cx, y: cy };
}

function reticle(g, x, y, half, color, k, alpha, text, S) {
  const h = half * k;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = rgba(color); g.lineWidth = Math.max(2, S * 0.0042); g.lineCap = "round";
  const L = Math.min(S * 0.034, h * 0.85);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.beginPath();
    g.moveTo(x + sx * h, y + sy * (h - L)); g.lineTo(x + sx * h, y + sy * h); g.lineTo(x + sx * (h - L), y + sy * h);
    g.stroke();
  }
  g.fillStyle = rgba(color, 0.9);
  g.beginPath(); g.arc(x, y, Math.max(1.6, S * 0.0034), 0, TAU); g.fill();
  if (text) {
    const fs = Math.max(11, S * 0.0235);
    g.font = `640 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
    const w = g.measureText(text).width + fs * 1.1, hh = fs * 1.75;
    let bx = x - h, by = y - h - hh - 6;
    bx = clamp(bx, 6, S - w - 6);
    if (by < 6) by = y + h + 6;
    g.fillStyle = "rgba(5,7,13,.86)";
    g.beginPath(); g.roundRect(bx, by, w, hh, hh / 2); g.fill();
    g.strokeStyle = rgba(color, 0.9); g.lineWidth = 1.4; g.stroke();
    g.fillStyle = rgba(color);
    g.textBaseline = "middle";
    g.fillText(text, bx + fs * 0.55, by + hh / 2 + 1);
  }
  g.restore();
}

function dial(g, S, time) {
  const cx = S / 2, cy = S / 2, R = S * 0.497;
  g.save();
  g.translate(cx, cy);
  g.rotate(time * 0.035);
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TAU, long = i % 10 === 0, mid = i % 5 === 0;
    const r0 = R - (long ? S * 0.022 : mid ? S * 0.014 : S * 0.008);
    g.strokeStyle = rgba(C.gold, long ? 0.5 : mid ? 0.3 : 0.14);
    g.lineWidth = long ? 1.6 : 1;
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke();
  }
  g.restore();
  const sweep = (time * 0.55) % TAU;
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = rgba(C.gold, (1 - k / 26) * 0.5);
    g.lineWidth = Math.max(1.5, S * 0.0042);
    g.beginPath(); g.arc(cx, cy, R - S * 0.004, sweep - (k + 1) * 0.013, sweep - k * 0.013); g.stroke();
  }
}

function hud(g, S, time, label, normal, tone) {
  const fs = Math.max(9.5, S * 0.0185), m = S * 0.05;
  g.save();
  g.font = `620 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
  if ("letterSpacing" in g) g.letterSpacing = `${fs * 0.1}px`;
  g.fillStyle = rgba(C.gold, 0.78);
  g.textBaseline = "top"; g.textAlign = "left";
  g.fillText("OPTIINSPECT", m, m);
  g.fillStyle = rgba(C.white, 0.42); g.fillText(label.toUpperCase(), m, m + fs * 1.5);
  g.textAlign = "right"; g.fillStyle = rgba(C.white, 0.42);
  g.fillText(`ALIGN ${(0.2 + 0.12 * Math.sin(time * 1.7)).toFixed(2)} PX`, S - m, m);
  g.textBaseline = "bottom"; g.textAlign = "left";
  g.fillText(`NORMAL ${normal}`, m, S - m);
  g.textAlign = "right";
  g.fillStyle = tone ? rgba(tone, 0.9) : rgba(C.white, 0.42);
  g.fillText(`FRAME ${String(Math.floor(time * 24) % 10000).padStart(4, "0")}`, S - m, S - m);
  g.restore();
}

export function toneFor(score) {
  return mixc(C.amber, C.rose, clamp((score - 0.55) / 0.18));
}

// Draw one frame. `t` is seconds into the scenario; `time` is wall-clock seconds for ambient motion.
export function drawScene(g, scene, sc, t, { time = 0, mouse = { x: 0, y: 0 }, label = "bottle", normal = "13.8" } = {}) {
  const S = scene.size;
  const st = stateAt(sc, t);
  const cx = S / 2, cy = S / 2;
  const ox = mouse.x * S * 0.014, oy = mouse.y * S * 0.014;
  g.clearRect(0, 0, S, S);
  g.drawImage(scene.base, -S * 0.015 + ox, -S * 0.015 + oy, S * 1.03, S * 1.03);

  const fade = st.phase === "idle" ? outCubic(st.p) : st.phase === "hold" ? 1 - clamp((st.holdP - 0.82) / 0.18) : 1;
  const verdictTone = sc.verdict === "defect" ? C.rose : sc.verdict === "review" ? C.amber : C.mint;

  // registration marks settle during the first moment
  g.save();
  g.globalAlpha = 0.9 * fade;
  const jitter = (st.phase === "idle" ? 1 - outCubic(st.p) : 0) * S * 0.03;
  g.strokeStyle = rgba(C.gold, 0.55); g.lineWidth = 1.4; g.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + Math.PI / 4, r = S * 0.43;
    const x = cx + Math.cos(a) * r + Math.sin(time * 9 + i) * jitter, y = cy + Math.sin(a) * r + Math.cos(time * 7 + i) * jitter, l = S * 0.014;
    g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.moveTo(x, y - l); g.lineTo(x, y + l); g.stroke();
  }
  g.restore();

  // defects sit on the glass, so they move with it
  g.save();
  g.translate(ox, oy);
  const spots = sc.defects.map((d) => ({ d, ...defectShape(g, d, S) }));
  const beamY = lerp(S * 0.03, S * 0.97, inOut(st.scanP));

  // heat: where the scan has passed, differences glow in the colours of the difference map
  if (st.scanP > 0) {
    g.save();
    g.beginPath(); g.arc(cx, cy, S * 0.485, 0, TAU); g.clip();
    g.globalCompositeOperation = "screen";
    for (const s of spots) {
      const reveal = clamp((beamY - s.y) / (S * 0.1)) * (st.scanP >= 1 ? 1 : 1);
      if (reveal <= 0) continue;
      const rad = s.d.size * S * 2.6, pulse = 0.78 + 0.22 * Math.sin(time * 3.2 + s.d.seed);
      const h = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
      h.addColorStop(0, `rgba(255,215,107,${0.7 * reveal * pulse * fade})`);
      h.addColorStop(0.35, `rgba(255,138,61,${0.45 * reveal * pulse * fade})`);
      h.addColorStop(0.7, `rgba(230,68,110,${0.22 * reveal * fade})`);
      h.addColorStop(1, "rgba(123,31,162,0)");
      g.fillStyle = h; g.beginPath(); g.arc(s.x, s.y, rad, 0, TAU); g.fill();
    }
    g.restore();
  }
  g.restore();

  // the scan beam
  if (st.phase === "scan" || (st.phase === "idle" && st.p > 0.92)) {
    g.save();
    g.beginPath(); g.arc(cx, cy, S * 0.486, 0, TAU); g.clip();
    const band = S * 0.2, y = st.phase === "scan" ? beamY : S * 0.03;
    g.fillStyle = "rgba(123,31,162,.07)"; g.fillRect(0, 0, S, y);
    const bg = g.createLinearGradient(0, y - band, 0, y);
    bg.addColorStop(0, "rgba(123,31,162,0)"); bg.addColorStop(0.55, "rgba(230,68,110,.16)"); bg.addColorStop(0.9, "rgba(255,138,61,.42)"); bg.addColorStop(1, "rgba(255,226,170,.95)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = bg; g.fillRect(0, y - band, S, band);
    g.fillStyle = "rgba(255,240,205,.95)"; g.fillRect(0, y - 1, S, 2);
    g.restore();
  }

  g.save();
  g.translate(ox, oy);
  // reticles lock onto each defect
  if (["lock", "recheck", "verdict", "hold"].includes(st.phase)) {
    spots.forEach((s, i) => {
      const v = defectView(s.d, st);
      const color = toneFor(v.score);
      const lock = st.phase === "lock" ? outBack(clamp(st.lockP * 1.15)) : 1;
      const k = st.phase === "lock" ? lerp(2.2, 1, lock) : 1;
      const half = s.d.size * S * 1.45;
      const text = `${i + 1}  ${v.name} ${v.score.toFixed(2)}`;
      reticle(g, s.x, s.y, half, color, k, (st.phase === "lock" ? clamp(st.lockP * 3) : 1) * fade, text, S);
    });
  }
  g.restore();

  dial(g, S, time);
  hud(g, S, time, label, normal, st.phase === "verdict" || st.phase === "hold" ? verdictTone : null);

  // the verdict: a stamp and one ring of light
  if (st.phase === "verdict" || st.phase === "hold") {
    const p = st.phase === "verdict" ? st.verdictP : 1;
    const k = outBack(clamp(p / 0.5));
    g.save();
    g.globalAlpha = fade;
    if (st.phase === "verdict") {
      g.strokeStyle = rgba(verdictTone, (1 - p) * 0.6); g.lineWidth = S * 0.008;
      g.beginPath(); g.arc(cx, cy, S * lerp(0.1, 0.5, outCubic(p)), 0, TAU); g.stroke();
    }
    const fs = Math.max(13, S * 0.034);
    g.font = `700 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
    if ("letterSpacing" in g) g.letterSpacing = `${fs * 0.06}px`;
    const text = sc.verdictText.toUpperCase();
    const w = g.measureText(text).width + fs * 2.6, h = fs * 2.5;
    g.translate(cx, S * 0.868);
    g.scale(k, k);
    g.fillStyle = "rgba(5,7,13,.88)";
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill();
    g.strokeStyle = rgba(verdictTone); g.lineWidth = 2; g.stroke();
    g.fillStyle = rgba(verdictTone);
    g.beginPath(); g.arc(-w / 2 + fs * 1.15, 0, fs * 0.28, 0, TAU); g.fill();
    g.textBaseline = "middle"; g.textAlign = "center";
    g.fillText(text, fs * 0.5, 1);
    g.restore();
  }
  return st;
}
