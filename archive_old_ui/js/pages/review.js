import { el, api, getConfig, icon, panel, pageHead, stage, zoomTriplet, scoreTrack, statusTag, prettyName, num, toast, emptyState, statusSummary, fmtTime, ago, TOOLS, STATUSES, toneOf } from "../ui.js";

export default async function review(root, ctx) {
  const [queue, cfg, inspections] = await Promise.all([api("/api/review-queue"), getConfig(), api("/api/inspections?limit=100")]);
  const items = queue.flatMap((r) => r.defects.filter((d) => d.status === "NEEDS_REVIEW").map((d) => ({ r, d })));
  root.append(pageHead("Review", "Defects the agent could not settle. Look at the region, decide, and the decision goes into the audit log with your note."));

  const decided = inspections.filter((i) => Object.keys(i.statuses).some((k) => k.startsWith("HUMAN") || k === "NEEDS_EXPERT")).slice(0, 6);
  const recent = decided.length
    ? panel("Decided recently", el("div", { class: "divided" }, decided.map((i) => el("a", { class: "pickrow", href: `#/inspection/${i.inspection_id}`, style: { textDecoration: "none" } },
      el("img", { src: `/api/image/${i.inspection_id}?size=96`, alt: "" }),
      el("span", {}, el("b", { text: prettyName(i.photo_name) }), el("small", { text: ago(i.created), title: fmtTime(i.created) }),
        el("span", { class: "row", style: { gap: "6px", marginTop: "4px" } }, statusSummary(i.statuses)))))), null, "pb-none")
    : null;

  if (!items.length) {
    root.append(panel(null, emptyState("Nothing is waiting for you", "When the agent cannot decide on its own, the case appears here with the exact region to look at.",
      el("a", { class: "btn", href: "#/inspect" }, "Inspect a photo"))));
    if (recent) root.append(el("div", { style: { height: "20px" } }), recent);
    return;
  }

  let index = 0;
  const [wantId, wantDefect] = ctx.args;
  const found = items.findIndex((x) => x.r.inspection_id === wantId && (wantDefect == null || x.d.defect === Number(wantDefect)));
  if (found >= 0) index = found;

  const list = el("div", { class: "divided" });
  const detailBox = el("div", { class: "stack lg" });
  let sending = false, onKey = null;

  function paintList() {
    list.replaceChildren(...items.map((x, i) => el("button", { class: "pickrow", type: "button", "aria-current": String(i === index), onclick: () => { index = i; paintList(); paintDetail(); } },
      el("img", { src: `/api/image/${x.r.inspection_id}?size=96`, alt: "" }),
      el("span", {}, el("b", { text: `${prettyName(x.r.photo_name)}, defect ${x.d.defect + 1}` }), el("small", { class: "num", text: `score ${num(x.d.final_score)}, ${x.d.tools_tried.length} extra checks` })))));
  }

  function paintDetail() {
    const { r, d } = items[index];
    const st = stage(r, { only: d.defect });
    const note = el("textarea", { rows: 3, maxlength: 500, placeholder: "What did you see? (optional, saved with your decision)", "aria-label": "Note" });
    const triplet = el("div", { class: "muted", text: "Drawing the zoomed views..." });
    zoomTriplet(r, d).then((n) => triplet.replaceWith(n)).catch(() => triplet.replaceWith(el("p", { class: "muted", text: "The zoomed views could not be drawn." })));
    const buttons = {};
    const decide = async (decision) => {
      if (sending) return;
      sending = true;
      Object.values(buttons).forEach((b) => (b.disabled = true));
      try {
        await api(`/api/review/${r.inspection_id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defect: d.defect, decision, note: note.value }) });
        toast({ defect: "Saved: marked as a defect", ok: "Saved: marked as fine", unsure: "Saved: passed to an expert" }[decision]);
        ctx.badge();
        ctx.refresh();
      } catch (e) {
        toast(e.message, "red");
        sending = false;
        Object.values(buttons).forEach((b) => (b.disabled = false));
      }
    };
    const mk = (key, cls, label, k) => (buttons[key] = el("button", { class: `btn ${cls}`, type: "button", onclick: () => decide(key) }, label, " ", el("span", { class: "kbd", text: k })));
    onKey = (e) => {
      if (e.target.matches("textarea, input, select") || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = { d: "defect", o: "ok", u: "unsure" }[e.key.toLowerCase()];
      if (key) { e.preventDefault(); decide(key); }
    };
    detailBox.replaceChildren(
      el("div", { class: "cols halves" },
        panel("Whole photo", el("div", { class: "pb" }, st.node, el("p", { class: "caption", text: `Defect ${d.defect + 1} of ${r.defects.length} in ${prettyName(r.photo_name)}. ` }),
          el("a", { href: `#/inspection/${r.inspection_id}`, text: "Open the full inspection" })),),
        panel("What the agent saw", el("div", { class: "pb stack" }, triplet,
          scoreTrack(d.history, cfg, toneOf(STATUSES, d.status)),
          el("ul", { class: "steps" }, d.history.map((h) => el("li", {}, icon(TOOLS[h.by]?.icon || "detector", 18),
            el("span", {}, el("b", { text: TOOLS[h.by]?.label || h.by }), el("span", { class: "why", text: h.reason })), el("span", { class: "num", text: num(h.score) }))))))),
      panel("Your decision", el("div", { class: "pb stack" },
        el("p", { text: `The agent stopped at ${num(d.final_score)}, between ${cfg.dismiss} and ${cfg.confirm}. Checks can only confirm a defect, never clear one, so this is yours to call.` }),
        note,
        el("div", { class: "row" }, mk("defect", "red", "It is a defect", "D"), mk("ok", "green", "It is fine", "O"), mk("unsure", "quiet", "Not sure, ask an expert", "U")))));
  }

  paintList();
  paintDetail();
  root.append(el("div", { class: "cols queue" }, el("div", { class: "stack lg" }, panel(`Waiting (${items.length})`, list, null, "pb-none"), recent), detailBox));
  const handler = (e) => onKey && onKey(e);
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
