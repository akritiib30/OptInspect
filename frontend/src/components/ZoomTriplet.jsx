import { useEffect, useRef, useState } from "react";
import { viewUrl } from "../lib/api";
import { STATUSES, colorOf } from "../lib/constants";

const load = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("image"));
  img.src = url;
});

/** Three zoomed crops of one defect: the inspected photo, the good reference, and the difference map. */
export default function ZoomTriplet({ result, defect, size = 360 }) {
  const refs = [useRef(null), useRef(null), useRef(null)];
  const [failed, setFailed] = useState(false);
  const id = result.inspection_id;

  useEffect(() => {
    let alive = true;
    const [dw, dh] = result.display_size || [256, 256];
    const [ww, wh] = result.work_size || [dw, dh];
    const sx = dw / ww, sy = dh / wh;
    Promise.all(["test", "reference", "diff"].map((k) => load(viewUrl(id, k)))).then((imgs) => {
      if (!alive) return;
      const [bx, by, bw, bh] = [defect.box[0] * sx, defect.box[1] * sy, defect.box[2] * sx, defect.box[3] * sy];
      const side = Math.max(bw, bh) * 2.4 + 40 * sx;
      const x0 = bx + bw / 2 - side / 2, y0 = by + bh / 2 - side / 2;
      const color = getComputedStyle(document.documentElement).getPropertyValue("--c") || "#ff5470";
      imgs.forEach((img, i) => {
        const c = refs[i].current;
        if (!c) return;
        const g = c.getContext("2d"), k = size / side;
        g.fillStyle = "#06080f"; g.fillRect(0, 0, size, size);
        g.imageSmoothingQuality = "high";
        g.drawImage(img, x0, y0, side, side, 0, 0, size, size);
        g.strokeStyle = colorOf(STATUSES, defect.status) === "var(--bad)" ? "#ff5470" : colorOf(STATUSES, defect.status) === "var(--ok)" ? "#3ddc97" : "#ffb020";
        g.lineWidth = 3;
        g.strokeRect((bx - x0) * k - 5, (by - y0) * k - 5, bw * k + 10, bh * k + 10);
      });
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, defect.box?.join(","), defect.status]);

  if (failed) return <p className="muted">The zoomed views could not be drawn.</p>;
  return (
    <div className="triplet">
      {["Inspected", "Reference", "Difference"].map((label, i) => (
        <figure key={label}>
          <canvas ref={refs[i]} width={size} height={size} role="img" aria-label={`${label}, zoomed on defect`} />
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
