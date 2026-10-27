import { el, api, panel, pageHead, prettyName, emptyState } from "../ui.js";

export default async function products(root) {
  const list = await api("/api/products");
  root.append(pageHead("Products", "A product is a good reference photo plus what 'normal' looks like for it. The inspector only judges photos against the product you choose."));
  if (!list.length) {
    root.append(panel(null, emptyState("No products yet", "Build one from a folder of good photos with build_product.py.")));
  }
  for (const p of list) {
    root.append(el("div", { style: { marginBottom: "20px" } }, panel(p.name,
      el("div", { class: "pb stack lg" },
        el("div", { class: "cols halves" },
          el("div", { class: "field", style: { "--ratio": "1 / 1", maxWidth: "380px" } }, el("img", { src: `/api/product-image/${p.name}/reference`, alt: `Good reference photo for ${p.name}` }),
            ...["tl", "tr", "bl", "br"].map((c) => el("i", { class: `c ${c}` }))),
          el("div", { class: "stack" },
            el("dl", { class: "facts" },
              el("dt", { text: "Calibration" }), el("dd", { text: p.calibrated ? "Calibrated on real good photos" : "None (practice product)" }),
              el("dt", { text: "Normal level" }), el("dd", { text: p.calibrated ? p.normal.toFixed(1) : "-" }),
              el("dt", { text: "Confirmed from" }), el("dd", { text: p.calibrated ? `${(p.normal * 2).toFixed(1)}, twice the normal level` : "-" }),
              el("dt", { text: "Ready-made photos" }), el("dd", { text: String(p.samples.length) })),
            el("p", { class: "muted", text: p.calibrated
              ? "The normal level is the largest difference seen on good photos that were not used to build the reference. A defect has to be clearly bigger than anything a good bottle shows."
              : "This product has no calibration, so it uses a generic noise estimate and does not reject wrong photos. Use it for a first look, not for judging real parts." }),
            el("a", { class: "btn", href: `#/inspect?product=${p.name}` }, "Inspect with this product"))),
        el("div", {}, el("h3", { text: "Ready-made photos", style: { marginBottom: "12px" } }),
          el("div", { class: "thumbs" }, p.samples.map((s) => el("a", { class: "thumb", href: `#/inspect?product=${p.name}&sample=${s.id}` },
            el("div", { class: "frame" }, el("img", { src: `/api/product-image/${p.name}/sample/${s.id}?size=260`, alt: "", loading: "lazy" })),
            el("b", { text: prettyName(s.label) }), el("small", { text: "Open in Inspect" })))))))));
  }
  root.append(panel("Add a product", el("div", { class: "pb prose" },
    el("p", { text: "Collect at least 50 photos of good parts (40 for the reference and the rest to learn what normal looks like), then run:" }),
    el("pre", { class: "code", text: "python build_product.py my_part path\\to\\folder" }),
    el("p", { class: "muted", text: "The folder needs train/good with the photos and, to run the evaluation scripts, test/<kind> folders. Restart the server afterwards." }))));
}
