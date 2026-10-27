// Shared building blocks: DOM helper, API calls, labels, icons, and the image/score components.
// All text is inserted with textContent, never as HTML, so nothing typed by a person can run as code.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) p.startsWith("--") ? e.style.setProperty(p, val) : (e.style[p] = val);
    } else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

const SVGNS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    k === "text" ? (e.textContent = v) : e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c) e.append(c);
  return e;
}

export async function api(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Cannot reach the server. Check that python server.py is still running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The request failed (${res.status}).`);
  return data;
}

let configPromise;
export const getConfig = () => (configPromise ||= api("/api/config"));

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load an image."));
    img.src = url;
  });
}

// ---------- icons ----------
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  inspect: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  review: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  audit: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  products: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/>',
  how: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  compare: '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>',
  detector: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
};

export function icon(name, size = 18) {
  const s = svg("svg", {
    viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
    "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "icon",
  });
  s.innerHTML = ICONS[name] || ""; // fixed strings from this file only
  return s;
}

// ---------- labels ----------
export const VERDICTS = {
  DEFECT: ["Defect found", "red"], OK: ["Passed", "green"], NEEDS_REVIEW: ["Needs a person", "amber"],
  NEEDS_EXPERT: ["Sent to an expert", "amber"], INVALID_PHOTO: ["Not the product", "slate"],
};
export const STATUSES = {
  CONFIRMED: ["Defect confirmed", "red"], CLEARED: ["Looks normal", "green"], NEEDS_REVIEW: ["Needs a person", "amber"],
  HUMAN_DEFECT: ["Person: defect", "red"], HUMAN_OK: ["Person: fine", "green"], NEEDS_EXPERT: ["Sent to an expert", "amber"],
};
export const TOOLS = {
  detector: { label: "Detector", icon: "detector", what: "The first look at the whole photo." },
  zoom: { label: "Zoom", icon: "zoom", what: "Enlarges the area so small marks stand out." },
  contrast: { label: "Contrast", icon: "contrast", what: "Stretches local brightness to reveal faint marks." },
  compare: { label: "Compare", icon: "compare", what: "Re-compares with the good sample after a small shift search." },
};
export const TONE_VAR = { red: "var(--red)", amber: "var(--amber)", green: "var(--green)", slate: "var(--slate)" };

export function tag(map, key) {
  const [label, tone] = map[key] || [String(key), "slate"];
  return el("span", { class: `tag ${tone}` }, el("i"), label);
}
export const verdictTag = (k) => tag(VERDICTS, k);
export const statusTag = (k) => tag(STATUSES, k);
export const toneOf = (map, key) => (map[key] || [0, "slate"])[1];

export const prettyName = (s) => String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const num = (x, d = 2) => (x == null || Number.isNaN(x) ? "-" : Number(x).toFixed(d));

export function fmtTime(iso, withSeconds = false) {
  const d = new Date(iso);
  return d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) });
}
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function toast(message, tone = "") {
  let box = $("#toasts");
  if (!box) { box = el("div", { id: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
  const t = el("div", { class: `toast ${tone}` }, message);
  box.append(t);
  setTimeout(() => t.remove(), 3800);
}

export function emptyState(title, text, ...actions) {
  return el("div", { class: "empty" }, el("h3", { text: title }), text ? el("p", { class: "muted", text }) : null,
    actions.length ? el("div", { class: "row center" }, actions) : null);
}

export function downloadFile(name, text, type = "application/json") {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------- the score track: where a score sits, and the path the agent took ----------
export function scoreTrack(history, cfg, finalTone) {
  const W = 420, X0 = 12, X1 = 408, L = X1 - X0, Y = 44;
  const x = (s) => X0 + Math.max(0, Math.min(1, s)) * L;
  const root = svg("svg", {
    viewBox: `0 0 ${W} 96`, class: "track", role: "img",
    "aria-label": "Score history: " + history.map((h) => `${TOOLS[h.by]?.label || h.by} ${num(h.score)}`).join(", "),
  });
  const zones = [[0, cfg.dismiss, "green", "normal"], [cfg.dismiss, cfg.confirm, "amber", "needs a look"], [cfg.confirm, 1, "red", "confirmed"]];
  for (const [a, b, tone, label] of zones) {
    root.append(svg("rect", { x: x(a), y: Y - 7, width: x(b) - x(a), height: 14, rx: 3, fill: TONE_VAR[tone], opacity: 0.22 }));
    root.append(svg("text", { x: (x(a) + x(b)) / 2, y: 72, "text-anchor": "middle", class: "t-label", text: label }));
  }
  for (const v of [cfg.dismiss, cfg.confirm]) {
    root.append(svg("line", { x1: x(v), x2: x(v), y1: Y - 9, y2: Y + 9, stroke: "var(--graphite)", "stroke-width": 1 }));
    root.append(svg("text", { x: x(v), y: 88, "text-anchor": "middle", class: "t-label", text: v.toFixed(2) }));
  }
  history.forEach((h, i) => {
    if (i > 0) {
      const x1 = x(history[i - 1].score), x2 = x(h.score);
      root.append(svg("path", { d: `M${x1} ${Y} Q${(x1 + x2) / 2} ${Y - 26} ${x2} ${Y}`, fill: "none", stroke: "var(--graphite)", "stroke-width": 1.2, opacity: 0.55 }));
    }
  });
  history.forEach((h, i) => {
    const last = i === history.length - 1 && history.length > 1;
    const cx = Math.max(34, Math.min(W - 34, x(h.score)));
    root.append(svg("text", { x: cx, y: i % 2 ? 24 : 11, "text-anchor": "middle", class: "t-step", text: `${TOOLS[h.by]?.label || h.by} ${num(h.score)}` }));
    root.append(svg("circle", {
      cx: x(h.score), cy: Y, r: last ? 7 : 5, stroke: "var(--panel)", "stroke-width": 2,
      fill: last ? TONE_VAR[finalTone] : i === 0 ? "var(--ink)" : "var(--cobalt)",
    }));
  });
  return root;
}

// ---------- the viewing field: photo with labelled boxes ----------
const corners = () => ["tl", "tr", "bl", "br"].map((c) => el("i", { class: `c ${c}` }));

export function stage(result, { view = "test", only = null, onSelect = null } = {}) {
  const [dw, dh] = result.display_size || [256, 256];
  const [ww, wh] = result.work_size || [dw, dh];
  const sx = dw / ww, sy = dh / wh;
  const sw = Math.max(2, dw / 260), fs = Math.max(13, dw / 34);
  const img = el("img", { src: `/api/view/${result.inspection_id}/${view}`, alt: `Photo ${result.photo_name}`, draggable: "false" });
  const overlay = svg("svg", { viewBox: `0 0 ${dw} ${dh}`, class: "overlay" });
  const groups = [];
  result.defects.forEach((d, i) => {
    if (only != null && only !== i) return;
    const [bx, by, bw, bh] = d.box, pad = 6 * sx;
    const color = TONE_VAR[toneOf(STATUSES, d.status)];
    const g = svg("g", { class: "box", tabindex: onSelect ? 0 : null, role: onSelect ? "button" : null, "aria-label": `Defect ${i + 1}, ${STATUSES[d.status]?.[0] || d.status}` });
    g.append(svg("rect", { x: bx * sx - pad, y: by * sy - pad, width: bw * sx + 2 * pad, height: bh * sy + 2 * pad, fill: "transparent", stroke: color, "stroke-width": sw, rx: 2 }));
    g.append(svg("rect", { x: bx * sx - pad, y: by * sy - pad - fs * 1.35, width: fs * 1.5, height: fs * 1.35, fill: color }));
    g.append(svg("text", { x: bx * sx - pad + fs * 0.75, y: by * sy - pad - fs * 0.32, "text-anchor": "middle", fill: "#fff", "font-size": fs, "font-weight": 700, text: String(i + 1) }));
    if (onSelect) {
      g.addEventListener("click", () => onSelect(i));
      g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(i)));
    }
    overlay.append(g);
    groups[i] = g;
  });
  const node = el("div", { class: "field", style: { "--ratio": `${dw} / ${dh}` } }, img, overlay, corners());
  return {
    node,
    setView: (k) => { img.src = `/api/view/${result.inspection_id}/${k}`; overlay.style.display = k === "test" || k === "diff" ? "" : "none"; },
    select: (i) => groups.forEach((g, j) => g && g.classList.toggle("sel", i === j)),
    scanning: (on) => node.classList.toggle("scanning", on),
  };
}

// before/after slider: reference on one side, the inspected photo on the other
export function compareSlider(result) {
  const id = result.inspection_id;
  const top = el("img", { class: "cmp-top", src: `/api/view/${id}/test`, alt: "Inspected photo", draggable: "false" });
  const range = el("input", { type: "range", min: 0, max: 100, value: 50, "aria-label": "Slide between the good reference and the inspected photo" });
  const [dw, dh] = result.display_size || [256, 256];
  const node = el("div", { class: "field cmp", style: { "--pos": "50%", "--ratio": `${dw} / ${dh}` } },
    el("img", { src: `/api/view/${id}/reference`, alt: "Good reference", draggable: "false" }), top,
    el("div", { class: "cmp-handle" }), el("span", { class: "cmp-tag left" }, "Inspected"), el("span", { class: "cmp-tag right" }, "Reference"),
    range, corners());
  range.addEventListener("input", () => node.style.setProperty("--pos", `${range.value}%`));
  return node;
}

// three zoomed crops of one defect: inspected photo, good reference, difference map
export async function zoomTriplet(result, defect) {
  const id = result.inspection_id;
  const [dw, dh] = result.display_size || [256, 256];
  const [ww, wh] = result.work_size || [dw, dh];
  const sx = dw / ww, sy = dh / wh;
  const imgs = await Promise.all(["test", "reference", "diff"].map((k) => loadImage(`/api/view/${id}/${k}`)));
  const [bx, by, bw, bh] = [defect.box[0] * sx, defect.box[1] * sy, defect.box[2] * sx, defect.box[3] * sy];
  const side = Math.max(bw, bh) * 2.4 + 40 * sx;
  const x0 = bx + bw / 2 - side / 2, y0 = by + bh / 2 - side / 2;
  const color = TONE_VAR[toneOf(STATUSES, defect.status)];
  const figs = ["Inspected", "Reference", "Difference"].map((label, i) => {
    const c = el("canvas", { width: 360, height: 360, role: "img", "aria-label": `${label}, zoomed on the defect` });
    const g = c.getContext("2d"), k = 360 / side;
    g.fillStyle = "#0E1318";
    g.fillRect(0, 0, 360, 360);
    g.imageSmoothingQuality = "high";
    g.drawImage(imgs[i], x0, y0, side, side, 0, 0, 360, 360);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.strokeRect((bx - x0) * k - 5, (by - y0) * k - 5, bw * k + 10, bh * k + 10);
    return el("figure", {}, c, el("figcaption", { text: label }));
  });
  return el("div", { class: "triplet" }, figs);
}

// ---------- page furniture ----------
export function panel(title, body, right = null, extra = "") {
  return el("section", { class: `panel ${extra}` },
    title ? el("div", { class: "ph" }, el("h2", { text: title }), right) : null, body);
}

export function pageHead(title, subtitle, actions = [], back = null) {
  return el("header", { class: "page-head" },
    el("div", { class: "grow" },
      back ? el("a", { class: "crumb", href: back[0] }, icon("back", 16), back[1]) : null,
      el("h1", { text: title }), subtitle ? el("p", { text: subtitle }) : null),
    el("div", { class: "row" }, actions));
}

export function statusSummary(statuses) {
  const words = { CONFIRMED: "confirmed", CLEARED: "normal", NEEDS_REVIEW: "waiting", HUMAN_DEFECT: "person: defect", HUMAN_OK: "person: fine", NEEDS_EXPERT: "expert" };
  return Object.entries(statuses || {}).map(([k, n]) => el("span", { class: "chip" }, `${n} ${words[k] || k}`));
}
