import { useEffect, useMemo, useRef, useState } from "react";
import { productImage } from "../lib/api";

const G = 96;                                                    // the heat map is G x G cells, smoothed up by the browser
const STOPS = [[0, [42, 16, 112]], [0.25, [123, 31, 162]], [0.5, [230, 68, 110]], [0.75, [255, 138, 61]], [1, [255, 215, 107]]];
const SIZES = [["Small", 0, 0.01, "under 1% of the photo"], ["Medium", 0.01, 0.04, "1% to 4%"], ["Large", 0.04, 9, "over 4%"]];
const ROWS = ["top", "middle", "bottom"], COLS = ["left", "centre", "right"];

const ramp = (v) => {
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a);
      return ca.map((c, k) => c + (cb[k] - c) * t);
    }
  }
  return STOPS[STOPS.length - 1][1];
};

/** Where confirmed defects sit on the product, from every inspection so far. */
export default function Hotspots({ boxes }) {
  const products = useMemo(() => [...new Set(boxes.map((b) => b.product).filter(Boolean))], [boxes]);
  const [chosen, setChosen] = useState(null);
  const product = products.includes(chosen) ? chosen : products[0];
  const mine = useMemo(() => boxes.filter((b) => b.product === product), [boxes, product]);
  const canvas = useRef(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dens = new Float32Array(G * G);
    for (const b of mine) {
      const s = Math.max(0.03, Math.max(b.w, b.h) * 0.55), r = Math.ceil(s * 3 * G);
      const cx = b.x * G, cy = b.y * G;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(G, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(G, Math.ceil(cx + r)); x++) {
          const d2 = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (s * G) ** 2;
          dens[y * G + x] += Math.exp(-d2 / 2);
        }
      }
    }
    const peak = Math.max(...dens, 0.0001);
    c.width = G; c.height = G;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(G, G);
    for (let i = 0; i < dens.length; i++) {
      const v = dens[i] / peak, [r, g, b] = ramp(v);
      img.data.set([r, g, b, v < 0.04 ? 0 : Math.min(235, 40 + v * 215)], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [mine]);

  const cells = useMemo(() => {
    const t = Array.from({ length: 9 }, () => 0);
    mine.forEach((b) => { t[Math.min(2, Math.floor(b.y * 3)) * 3 + Math.min(2, Math.floor(b.x * 3))] += 1; });
    return t;
  }, [mine]);
  const top = cells.indexOf(Math.max(...cells));
  const row = ROWS[Math.floor(top / 3)], col = COLS[top % 3];
  const where = row === "middle" && col === "centre" ? "the middle" : row === "middle" ? `the ${col} side` : col === "centre" ? `the ${row}` : `the ${row} ${col}`;
  const sizes = SIZES.map(([label, lo, hi, text]) => [label, text, mine.filter((b) => b.w * b.h >= lo && b.w * b.h < hi).length]);
  const maxSize = Math.max(1, ...sizes.map((s) => s[2]));

  if (!products.length) return <p className="muted">Confirmed defects will glow here, so you can see whether they cluster in one place, which often points to a tool or a mould.</p>;
  return (
    <div className="hs">
      <div>
        <div className="hs-map" role="img" aria-label={`Heat map of ${mine.length} confirmed defects on ${product}`}>
          <img src={productImage(product, null, 640)} alt="" />
          <canvas ref={canvas} />
        </div>
        <div className="hs-scale"><i /><span><span>fewer</span><span>more defects</span></span></div>
      </div>
      <div className="stack">
        {products.length > 1 ? <select className="select input-sm" value={product} onChange={(e) => setChosen(e.target.value)} aria-label="Product">{products.map((p) => <option key={p}>{p}</option>)}</select> : null}
        <ul className="hs-facts">
          <li><b className="num">{mine.length}</b><span className="muted">confirmed defect{mine.length === 1 ? "" : "s"} mapped on {product}</span></li>
          {mine.length >= 5
            ? <li><b className="num">{Math.round((cells[top] / mine.length) * 100)}%</b><span className="muted">of them sit in {where} of the photo</span></li>
            : <li><b className="num">-</b><span className="muted">Too few defects so far to call a pattern. It needs about five.</span></li>}
        </ul>
        <div><span className="muted">How big they are</span>
          <div className="hs-sizes">{sizes.map(([label, text, n]) => (
            <div key={label} className="hs-size-row" title={text}><span>{label}</span><i style={{ width: `${(n / maxSize) * 100}%`, minWidth: n ? 6 : 0 }} /><b className="num">{n}</b></div>
          ))}</div>
        </div>
        <p className="hint">Defects that gather in one place usually have one cause, such as a worn tool or a mould fault. Size is the box around the defect as a share of the photo.</p>
      </div>
    </div>
  );
}
