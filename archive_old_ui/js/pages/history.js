import { el, api, panel, pageHead, verdictTag, prettyName, num, ago, fmtTime, emptyState, statusSummary, VERDICTS } from "../ui.js";

export default async function history(root) {
  const all = await api("/api/inspections?limit=500");
  root.append(pageHead("History", "Every photo the inspector has looked at. Select one to see the photo, the boxes and each step it took."));
  if (!all.length) {
    root.append(panel(null, emptyState("Nothing here yet", "Inspections appear as soon as you run one.", el("a", { class: "btn", href: "#/inspect" }, "Inspect a photo"))));
    return;
  }
  const products = [...new Set(all.map((i) => i.product).filter(Boolean))];
  const search = el("input", { type: "search", placeholder: "Search by photo name or id", "aria-label": "Search inspections" });
  const verdict = el("select", { "aria-label": "Filter by verdict" }, el("option", { value: "", text: "All verdicts" }),
    Object.entries(VERDICTS).map(([k, [label]]) => el("option", { value: k, text: label })));
  const product = el("select", { "aria-label": "Filter by product" }, el("option", { value: "", text: "All products" }), products.map((p) => el("option", { value: p, text: p })));
  let newestFirst = true;
  const sort = el("div", { class: "seg", role: "group", "aria-label": "Sort order" },
    el("button", { type: "button", "aria-pressed": "true", text: "Newest", onclick: () => setSort(true) }),
    el("button", { type: "button", "aria-pressed": "false", text: "Oldest", onclick: () => setSort(false) }));
  const body = el("tbody");
  const count = el("span", { class: "muted" });

  function setSort(v) {
    newestFirst = v;
    sort.children[0].setAttribute("aria-pressed", String(v));
    sort.children[1].setAttribute("aria-pressed", String(!v));
    paint();
  }
  function paint() {
    const q = search.value.trim().toLowerCase();
    let rows = all.filter((i) => (!verdict.value || i.verdict === verdict.value) && (!product.value || i.product === product.value)
      && (!q || i.photo_name.toLowerCase().includes(q) || i.inspection_id.toLowerCase().includes(q)));
    if (!newestFirst) rows = rows.slice().reverse();
    count.textContent = `${rows.length} of ${all.length}`;
    body.replaceChildren(...(rows.length ? rows.map((i) => {
      const open = () => (location.hash = `#/inspection/${i.inspection_id}`);
      return el("tr", { class: "link", onclick: open },
        el("td", { class: "thumb-cell" }, el("img", { src: `/api/image/${i.inspection_id}?size=104`, alt: "", loading: "lazy" })),
        el("td", {}, el("a", { href: `#/inspection/${i.inspection_id}`, onclick: (e) => e.stopPropagation(), text: prettyName(i.photo_name) }), el("div", { class: "muted num", text: i.inspection_id })),
        el("td", { text: i.product || "-" }), el("td", {}, verdictTag(i.verdict)),
        el("td", {}, el("div", { class: "row", style: { gap: "6px" } }, i.defect_count ? statusSummary(i.statuses) : el("span", { class: "muted", text: "none" }))),
        el("td", { class: "num", text: i.top_score == null ? "-" : num(i.top_score) }),
        el("td", {}, el("span", { text: ago(i.created), title: fmtTime(i.created, true) })));
    }) : [el("tr", {}, el("td", { colspan: 7 }, emptyState("No inspections match", "Clear a filter to see more.")))]));
  }
  [search, verdict, product].forEach((c) => c.addEventListener("input", paint));
  paint();

  root.append(panel(null, el("div", { class: "pb row" }, el("div", { style: { flex: "1 1 260px" } }, search),
    el("div", { style: { minWidth: "170px" } }, verdict), el("div", { style: { minWidth: "150px" } }, product), sort, count)),
  el("div", { style: { height: "16px" } }),
  panel(null, el("div", { class: "table-wrap" }, el("table", { class: "tbl" },
    el("thead", {}, el("tr", {}, ["", "Photo", "Product", "Verdict", "Defects", "Top score", "When"].map((h) => el("th", { text: h })))), body)), null, "pb-none"));
}
