import { el, api, getConfig, icon, panel, pageHead, stage, compareSlider, zoomTriplet, scoreTrack, verdictTag, statusTag, prettyName, num, fmtTime, downloadFile, TOOLS, STATUSES, toneOf } from "../ui.js";

const CAPTIONS = {
  test: "Boxes mark where the detector saw a difference. Select a box to jump to that defect.",
  reference: "The good sample, lined up with this photo and matched for lighting.",
  diff: "Brighter means a bigger difference from the good sample. Full brightness is twice the largest difference ever seen on a good photo.",
  slider: "Drag across to compare the good sample and this photo on the same spot.",
};
const TABS = [["test", "Inspected photo"], ["reference", "Good reference"], ["diff", "Difference"], ["slider", "Slider"]];

export default async function detail(root, ctx) {
  const id = ctx.args[0];
  const [result, log, cfg] = await Promise.all([api(`/api/result/${id}`), api(`/api/log/${id}`).catch(() => null), getConfig()]);
  const events = log?.events || [];
  const rejected = result.verdict === "INVALID_PHOTO";
  const waiting = result.defects.filter((d) => d.status === "NEEDS_REVIEW");

  const actions = [];
  if (waiting.length) actions.push(el("a", { class: "btn", href: `#/review/${id}/${waiting[0].defect}` }, icon("review", 17), "Decide on this photo"));
  actions.push(el("a", { class: "btn quiet", href: `#/audit/${id}` }, icon("audit", 17), "Audit log"));
  actions.push(el("button", { class: "btn quiet", type: "button", onclick: () => downloadFile(`inspection-${id}.json`,
    JSON.stringify({ exported_at: new Date().toISOString(), result, log_intact: log?.intact ?? null, log: events }, null, 2)) }, icon("download", 17), "Download report"));
  root.append(pageHead(prettyName(result.photo_name), `Product ${result.product}. Inspected ${fmtTime(result.created)}.`, actions, ["#/history", "All inspections"]));

  // ---- left: the viewing field ----
  const holder = el("div");
  const caption = el("p", { class: "caption" });
  const rows = [];
  let st, selected = null, tab = "test";
  const tabBtns = TABS.map(([k, label]) => el("button", { type: "button", "aria-pressed": String(k === tab), onclick: () => setTab(k) }, label));

  function select(i, scroll = true) {
    selected = i;
    st?.select(i);
    rows.forEach((r, j) => r.classList.toggle("sel", i === j));
    if (scroll && rows[i]) rows[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function setTab(k) {
    tab = k;
    tabBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(TABS[i][0] === k)));
    holder.replaceChildren();
    if (k === "slider") { st = null; holder.append(compareSlider(result)); }
    else { st = stage(result, { view: k, onSelect: (i) => select(i) }); st.select(selected); holder.append(st.node); }
    caption.textContent = CAPTIONS[k];
  }
  const left = el("div", { class: "stack lg" },
    panel("Photo", el("div", { class: "pb" }, holder, caption),
      rejected ? null : el("div", { class: "seg", role: "group", "aria-label": "Choose a view" }, tabBtns)));
  if (rejected) { st = stage(result, { view: "test" }); holder.append(st.node); caption.textContent = "This photo was not inspected."; }
  else setTab("test");

  // ---- right: summary and defects ----
  const startEv = events.find((e) => e.event === "inspection_started");
  const facts = el("dl", { class: "facts" },
    el("dt", { text: "Verdict" }), el("dd", {}, verdictTag(result.verdict)),
    el("dt", { text: "Possible defects" }), el("dd", { text: String(result.defects.length) }),
    el("dt", { text: "Calibrated" }), el("dd", { text: startEv?.details?.calibrated ? `Yes, normal level ${num(startEv.details.normal_level, 1)}` : "No" }),
    el("dt", { text: "Photo size" }), el("dd", { text: `${(result.display_size || [0, 0]).join(" x ")} px, analysed at ${(result.work_size || [0, 0]).join(" x ")}` }),
    el("dt", { text: "Reference" }), el("dd", { text: result.product }),
    el("dt", { text: "Inspection id" }), el("dd", { text: id }),
    el("dt", { text: "Log" }), el("dd", { text: log ? (log.intact ? "Intact, nothing changed" : "Altered after the fact") : "Not found" }));
  const side = el("div", { class: "stack lg" }, panel("Summary", el("div", { class: "pb" }, facts)));

  if (rejected) {
    const rej = events.find((e) => e.event === "input_rejected")?.details || {};
    side.append(panel("Why it was not inspected", el("div", { class: "pb stack" },
      el("p", { text: "This does not look like a photo of the selected product, so no defects were searched for. Check the file and the product." }),
      el("dl", { class: "facts" },
        el("dt", { text: "Reason" }), el("dd", { text: result.reason || rej.reason || "-" }),
        el("dt", { text: "Shape match" }), el("dd", { text: `${num(rej.structure_match)} (a photo of this product needs at least ${cfg.min_structure.toFixed(2)})` }),
        el("dt", { text: "Pixels that differ" }), el("dd", { text: `${Math.round((rej.share_unlike || 0) * 100)}%` })),
      el("a", { class: "btn quiet", href: `#/inspect?product=${result.product}` }, "Try another photo"))));
  } else if (!result.defects.length) {
    side.append(panel("Defects", el("div", { class: "pb" }, el("p", { text: "Nothing rose above the normal level for this product, so there is nothing to review." }))));
  } else {
    const list = el("div", { class: "divided" });
    result.defects.forEach((d, i) => {
      const tone = toneOf(STATUSES, d.status);
      const human = events.find((e) => e.event === "human_review" && e.details.defect === i);
      const triplet = el("div", { class: "muted", text: "Drawing the zoomed views..." });
      zoomTriplet(result, d).then((n) => triplet.replaceWith(n)).catch(() => triplet.replaceWith(el("p", { class: "muted", text: "The zoomed views could not be drawn." })));
      const row = el("article", { class: "defect", id: `defect-${i}` },
        el("div", { class: "defect-head" },
          el("button", { class: "linkish", type: "button", onclick: () => select(i, false), "aria-label": `Show defect ${i + 1} on the photo` }, el("span", { class: "badge-n", text: String(i + 1) })),
          statusTag(d.status), el("span", { class: "muted num", text: `score ${num(d.final_score)}` })),
        scoreTrack(d.history, cfg, tone),
        el("ul", { class: "steps" }, d.history.map((h) => el("li", {}, icon(TOOLS[h.by]?.icon || "detector", 18),
          el("span", {}, el("b", { text: TOOLS[h.by]?.label || h.by }), el("span", { class: "why", text: h.reason })), el("span", { class: "num", text: num(h.score) })))),
        triplet,
        human ? el("div", { class: "note" }, el("b", { text: "A person decided: " }), { defect: "this is a defect", ok: "this is fine", unsure: "not sure, passed to an expert" }[human.details.decision] || human.details.decision,
          human.details.note ? ` (note: ${human.details.note})` : "") : null,
        d.status === "NEEDS_REVIEW" ? el("a", { class: "btn sm", href: `#/review/${id}/${i}` }, "Decide on this defect") : null);
      rows[i] = row;
      list.append(row);
    });
    side.append(panel(`Defects (${result.defects.length})`, list, null, "pb-none"));
    select(waiting.length ? waiting[0].defect : 0, false);
  }
  root.append(el("div", { class: "cols main-side" }, left, side));
}
