import { el, api, icon, panel, pageHead, prettyName, emptyState } from "../ui.js";

const MAX_BYTES = 10 * 1024 * 1024;

export default async function inspectPage(root, ctx) {
  const products = await api("/api/products");
  if (!products.length) {
    root.append(pageHead("Inspect a photo", null), panel(null, emptyState("No products are set up", "A product is a good reference photo plus its calibration. Build one with build_product.py, then reload this page.")));
    return;
  }
  const wanted = ctx.query.get("product");
  let product = (products.find((p) => p.name === wanted) || products.find((p) => p.name === "bottle") || products[0]).name;
  let source = null; // { type: "sample", id, label } or { type: "file", file }
  let busy = false, objectUrl = null;

  const current = () => products.find((p) => p.name === product);
  const preview = el("img", { alt: "", draggable: "false" });
  const field = el("div", { class: "field", style: { "--ratio": "1 / 1" } }, preview, ...["tl", "tr", "bl", "br"].map((c) => el("i", { class: `c ${c}` })));
  const caption = el("p", { class: "caption" });
  const error = el("div", { class: "alert hide", role: "alert" });
  const chosen = el("p", { class: "muted" });
  const runBtn = el("button", { class: "btn block", type: "button", disabled: true }, icon("play", 16), "Run inspection");
  const select = el("select", { id: "product", "aria-label": "Product" }, products.map((p) => el("option", { value: p.name, text: p.name, selected: p.name === product })));
  const hint = el("p", { class: "muted" });
  const thumbs = el("div", { class: "thumbs" });
  const fileInput = el("input", { type: "file", accept: "image/*", id: "file" });
  const zone = el("label", { class: "dropzone", for: "file", style: { position: "relative" } },
    icon("upload", 24), el("span", {}, el("b", { text: "Choose a photo" }), " or drop it here"), el("small", { text: "PNG or JPG, up to 10 MB" }), fileInput);

  function showPreview(url, text) {
    preview.src = url;
    preview.alt = text;
    preview.onload = () => field.style.setProperty("--ratio", `${preview.naturalWidth} / ${preview.naturalHeight}`);
    caption.textContent = text;
  }
  function showError(msg) { error.textContent = msg || ""; error.classList.toggle("hide", !msg); }
  function resetSource() {
    source = null;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function paintProduct() {
    const p = current();
    hint.textContent = p.calibrated
      ? `Calibrated on real good photos. A difference of ${(p.normal * 2).toFixed(0)} or more on its scale counts as a confirmed defect.`
      : "Not calibrated. Scores use a generic noise estimate, which suits clean practice photos only. Wrong photos are not rejected for this product.";
    thumbs.replaceChildren(...p.samples.map((s) => el("button", { class: "thumb", type: "button", "aria-pressed": String(source?.id === s.id), onclick: () => pickSample(s) },
      el("div", { class: "frame" }, el("img", { src: `/api/product-image/${p.name}/sample/${s.id}?size=260`, alt: "", loading: "lazy" })),
      el("b", { text: prettyName(s.label) }))));
    if (!source) {
      showPreview(`/api/product-image/${p.name}/reference`, `The good reference for ${p.name}. Pick a photo to compare with it.`);
      chosen.textContent = "No photo chosen yet.";
      runBtn.disabled = true;
    }
  }
  function pickSample(s) {
    resetSource();
    source = { type: "sample", id: s.id, label: s.label };
    showPreview(`/api/product-image/${product}/sample/${s.id}`, `Ready-made photo: ${prettyName(s.label)}`);
    chosen.textContent = `Chosen: ${prettyName(s.label)}`;
    runBtn.disabled = false;
    showError("");
    thumbs.querySelectorAll(".thumb").forEach((t, i) => t.setAttribute("aria-pressed", String(current().samples[i].id === s.id)));
  }
  function pickFile(file) {
    showError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return showError("That file is not an image. Choose a PNG or JPG photo.");
    if (file.size > MAX_BYTES) return showError("That photo is larger than 10 MB. Choose a smaller one.");
    resetSource();
    source = { type: "file", file };
    objectUrl = URL.createObjectURL(file);
    showPreview(objectUrl, `Your photo: ${file.name}`);
    chosen.textContent = `Chosen: ${file.name}`;
    runBtn.disabled = false;
    thumbs.querySelectorAll(".thumb").forEach((t) => t.setAttribute("aria-pressed", "false"));
  }

  async function run() {
    if (!source || busy) return;
    busy = true;
    runBtn.disabled = true;
    runBtn.replaceChildren("Inspecting...");
    field.classList.add("scanning");
    showError("");
    try {
      let result;
      if (source.type === "sample") result = await api(`/api/inspect-sample/${product}/${source.id}`, { method: "POST" });
      else {
        const form = new FormData();
        form.append("image", source.file);
        form.append("product", product);
        result = await api("/api/inspect", { method: "POST", body: form });
      }
      location.hash = `#/inspection/${result.inspection_id}`;
    } catch (e) {
      showError(e.message);
      busy = false;
      field.classList.remove("scanning");
      runBtn.disabled = false;
      runBtn.replaceChildren(icon("play", 16), "Run inspection");
    }
  }

  select.addEventListener("change", () => { product = select.value; resetSource(); showError(""); paintProduct(); });
  fileInput.addEventListener("change", () => pickFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("over"); }));
  zone.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));
  runBtn.addEventListener("click", run);

  paintProduct();
  const sample = ctx.query.get("sample");
  const preset = current().samples.find((s) => s.id === sample);
  if (preset) pickSample(preset);

  root.append(
    pageHead("Inspect a photo", "Choose a product, then a photo. The inspector compares it with the good reference, looks again when it is unsure, and tells you what it could not settle."),
    el("div", { class: "cols main-side" },
      el("div", { class: "stack lg" },
        panel("Photo", el("div", { class: "pb" }, field, caption)),
        panel("Ready-made photos", el("div", { class: "pb" }, thumbs), el("span", { class: "muted", text: "Real photos from the product's test set" }))),
      panel("New inspection", el("div", { class: "pb stack" },
        el("label", { class: "field-label", for: "product" }, "Product", select), hint,
        zone, chosen, error, runBtn))));
  return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
}
