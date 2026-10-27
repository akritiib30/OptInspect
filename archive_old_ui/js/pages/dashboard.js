import { el, api, getConfig, icon, panel, pageHead, stage, scoreTrack, verdictTag, statusTag, prettyName, num, ago, fmtTime, TOOLS, TONE_VAR, STATUSES, toneOf, statusSummary } from "../ui.js";

export default async function dashboard(root) {
  const [stats, list, products, cfg] = await Promise.all([api("/api/stats"), api("/api/inspections?limit=60"), api("/api/products"), getConfig()]);
  const actions = [el("a", { class: "btn", href: "#/inspect" }, icon("inspect", 17), "Inspect a photo")];
  if (stats.awaiting_review) actions.push(el("a", { class: "btn quiet", href: "#/review" }, `${stats.awaiting_review} waiting for you`));
  root.append(pageHead("Overview", "What the inspector has handled, what it settled by itself, and what is waiting for a person.", actions));

  // ---- the latest inspection, shown the way it is judged: on the viewing field ----
  const latest = list.find((i) => i.verdict !== "INVALID_PHOTO") || list[0];
  if (latest) {
    const r = await api(`/api/result/${latest.inspection_id}`);
    const focus = r.defects.find((d) => d.status === "NEEDS_REVIEW") || r.defects[0];
    const st = stage(r, { onSelect: () => (location.hash = `#/inspection/${r.inspection_id}`) });
    const side = focus
      ? el("div", { class: "pb stack" },
        el("div", { class: "row" }, statusTag(focus.status), el("span", { class: "muted num", text: `score ${num(focus.final_score)}` })),
        scoreTrack(focus.history, cfg, toneOf(STATUSES, focus.status)),
        el("p", { class: "muted", text: focus.tools_tried.length
          ? `Each dot is one look. The detector started at ${num(focus.history[0].score)}, then ${focus.tools_tried.length} extra check${focus.tools_tried.length > 1 ? "s" : ""} followed.`
          : "The first look was decisive, so no extra checks were needed." }))
      : el("div", { class: "pb" }, el("p", { class: "muted", text: latest.verdict === "OK" ? "Nothing rose above the normal level for this product." : "No defects were listed for this photo." }));
    root.append(el("div", { class: "cols main-side", style: { marginBottom: "20px" } },
      panel(`Latest: ${prettyName(r.photo_name)}`, el("div", { class: "pb" }, st.node),
        el("div", { class: "row" }, verdictTag(r.verdict), el("a", { class: "btn quiet sm", href: `#/inspection/${r.inspection_id}` }, "Open inspection"))),
      panel("What the agent did", side)));
  } else {
    const p = products.find((x) => x.calibrated) || products[0];
    root.append(el("div", { class: "cols main-side", style: { marginBottom: "20px" } },
      panel("Nothing inspected yet", el("div", { class: "pb" }, p
        ? el("div", { class: "field", style: { "--ratio": "1 / 1" } }, el("img", { src: `/api/product-image/${p.name}/reference`, alt: `Good reference for ${p.name}` }))
        : el("p", { text: "No products are set up." }))),
      panel("Start here", el("div", { class: "pb stack" },
        el("p", { text: "Pick a ready-made photo or upload your own. The inspector compares it with the good reference and shows what it found, why, and what it could not decide." }),
        el("a", { class: "btn", href: "#/inspect" }, "Run the first inspection")))));
  }

  // ---- numbers ----
  const o = stats.outcomes;
  const confirmed = (o.CONFIRMED || 0) + (o.HUMAN_DEFECT || 0);
  const kpi = (value, label, href, warn) => el(href ? "a" : "div", { class: `kpi ${warn ? "warn" : ""}`, href }, el("b", { text: String(value) }), el("span", { text: label }));
  root.append(panel(null, el("div", { class: "strip" },
    kpi(stats.inspections, "Photos inspected"), kpi(confirmed, "Defects confirmed"),
    kpi(stats.awaiting_review, "Waiting for a person", "#/review", stats.awaiting_review > 0),
    kpi(stats.defects ? `${Math.round((stats.resolved_by_agent / stats.defects) * 100)}%` : "-", "Settled without a person"),
    kpi(stats.verdicts.INVALID_PHOTO || 0, "Photos rejected as not the product")), "", "pb-none"));

  // ---- recent + breakdown ----
  const recent = el("div", { class: "thumbs" }, list.slice(0, 8).map((i) =>
    el("a", { class: "thumb", href: `#/inspection/${i.inspection_id}` },
      el("div", { class: "frame" }, el("img", { src: `/api/image/${i.inspection_id}?size=260`, alt: `Photo ${i.photo_name}`, loading: "lazy" })),
      el("b", { text: prettyName(i.photo_name) }), verdictTag(i.verdict), el("small", { text: ago(i.created), title: fmtTime(i.created) }))));
  const total = Object.values(o).reduce((a, b) => a + b, 0);
  const order = ["CONFIRMED", "HUMAN_DEFECT", "CLEARED", "HUMAN_OK", "NEEDS_REVIEW", "NEEDS_EXPERT"].filter((k) => o[k]);
  const breakdown = total
    ? el("div", { class: "stack" },
      el("div", { class: "stacked", role: "img", "aria-label": "How defects ended: " + order.map((k) => `${o[k]} ${STATUSES[k][0]}`).join(", ") },
        order.map((k) => el("i", { style: { width: `${(o[k] / total) * 100}%`, background: TONE_VAR[toneOf(STATUSES, k)], opacity: k.startsWith("HUMAN") ? 0.6 : 1 } }))),
      el("div", { class: "legend" }, order.map((k) => el("span", {}, el("i", { style: { background: TONE_VAR[toneOf(STATUSES, k)], opacity: k.startsWith("HUMAN") ? 0.6 : 1 } }), `${STATUSES[k][0]} ${o[k]}`))))
    : el("p", { class: "muted", text: "No defects have been recorded yet." });
  const used = Object.entries(stats.tools_used);
  const checks = used.length
    ? el("div", { class: "stack" },
      el("ul", { class: "steps" }, used.map(([t, n]) => el("li", {}, icon(TOOLS[t]?.icon || "detector", 18),
        el("span", {}, el("b", { text: TOOLS[t]?.label || t }), el("span", { class: "why", text: TOOLS[t]?.what || "" })), el("span", { class: "num", text: `${n}x` })))),
      el("p", { class: "muted", text: `After extra checks, ${stats.tool_moves.up || 0} score${(stats.tool_moves.up || 0) === 1 ? "" : "s"} ended higher and ${stats.tool_moves.down || 0} lower than the first look.` }))
    : el("p", { class: "muted", text: "No extra checks have been needed yet." });

  root.append(el("div", { class: "cols main-side", style: { marginTop: "20px" } },
    panel("Recent inspections", list.length ? el("div", { class: "pb" }, recent) : el("div", { class: "pb" }, el("p", { class: "muted", text: "Inspections appear here as they are run." })),
      el("a", { class: "btn quiet sm", href: "#/history" }, "All history")),
    el("div", { class: "stack" }, panel("How defects ended", el("div", { class: "pb" }, breakdown)), panel("Extra checks used", el("div", { class: "pb" }, checks)))));
}
