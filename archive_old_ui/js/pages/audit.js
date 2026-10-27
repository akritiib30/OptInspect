import { el, api, getConfig, icon, panel, pageHead, verdictTag, prettyName, num, fmtTime, downloadFile, emptyState, TOOLS, STATUSES, VERDICTS } from "../ui.js";

const DECISION_WORDS = { defect: "it is a defect", ok: "it is fine", unsure: "not sure, passed to an expert" };

// Turn a raw log entry into words a person can read.
function describe(e) {
  const d = e.details || {}, n = (d.defect ?? 0) + 1;
  const tool = (t) => TOOLS[t]?.label || t;
  switch (e.event) {
    case "inspection_started":
      return { icon: "inspect", tone: "cobalt", title: "Inspection started", facts: [["Photo", prettyName(d.photo || "-")], ["Calibrated", d.calibrated ? `yes, normal level ${num(d.normal_level, 1)}` : "no"]] };
    case "input_rejected":
      return { icon: "x", tone: "red", title: "Photo rejected: not this product", note: d.reason, facts: [["Shape match", num(d.structure_match)], ["Pixels that differ", `${Math.round((d.share_unlike || 0) * 100)}%`]] };
    case "input_resized":
      return { icon: "file", tone: "", title: "Photo resized to the reference size", note: d.note };
    case "detector_finished":
      return { icon: "detector", tone: "cobalt", title: `Detector found ${d.defects_found} possible defect${d.defects_found === 1 ? "" : "s"}` };
    case "defect_found":
      return { icon: "alert", tone: "amber", title: `Defect ${n} found`, facts: [["First score", num(d.score)], ["Area", `${d.area} px`], ["Box", (d.box || []).join(", ")]] };
    case "tool_chosen":
      return { icon: TOOLS[d.tool]?.icon || "detector", tone: "cobalt", title: `${e.who === "rule-agent" ? "The agent" : e.who} chose ${tool(d.tool)} for defect ${n}`, note: d.reason, facts: [["Score before", num(d.score_before)]] };
    case "tool_result":
      return { icon: TOOLS[d.tool]?.icon || "detector", tone: "", title: `${tool(d.tool)} result for defect ${n}`, facts: [["Score", `${num(d.score_before)} to ${num(d.score_after)}`]] };
    case "decision": {
      const tone = (STATUSES[d.status] || [0, ""])[1];
      return { icon: tone === "green" ? "check" : tone === "red" ? "alert" : "person", tone, title: `Decision for defect ${n}: ${(STATUSES[d.status] || [d.status])[0]}`, facts: [["Final score", num(d.final_score)], ["Extra checks", (d.tools_tried || []).map(tool).join(", ") || "none"]] };
    }
    case "human_review":
      return { icon: "person", tone: "cobalt", title: `A person reviewed defect ${n}: ${DECISION_WORDS[d.decision] || d.decision}`, note: d.note ? `Note: ${d.note}` : null };
    case "inspection_finished":
      return { icon: "check", tone: (VERDICTS[d.verdict] || [0, ""])[1], title: `Inspection finished: ${(VERDICTS[d.verdict] || [d.verdict])[0]}` };
    default:
      return { icon: "file", tone: "", title: e.event.replace(/_/g, " ") };
  }
}

export default async function audit(root, ctx) {
  const list = await api("/api/inspections?limit=500");
  root.append(pageHead("Audit log", "Every step, in order, with who did it and why. Each entry carries a fingerprint of the one before it, so a change or a missing entry shows up."));
  if (!list.length) {
    root.append(panel(null, emptyState("No records yet", "The log starts when the first photo is inspected.", el("a", { class: "btn", href: "#/inspect" }, "Inspect a photo"))));
    return;
  }
  let currentId = list.find((i) => i.inspection_id === ctx.args[0])?.inspection_id || list[0].inspection_id;
  const picker = el("div", { class: "divided" });
  const search = el("input", { type: "search", placeholder: "Search", "aria-label": "Search inspections" });
  const detail = el("div", { class: "stack lg" });

  function paintPicker() {
    const q = search.value.trim().toLowerCase();
    picker.replaceChildren(...list.filter((i) => !q || i.photo_name.toLowerCase().includes(q) || i.inspection_id.toLowerCase().includes(q)).map((i) =>
      el("button", { class: "pickrow", type: "button", "aria-current": String(i.inspection_id === currentId), onclick: () => { currentId = i.inspection_id; history.replaceState(null, "", `#/audit/${currentId}`); paintPicker(); paintDetail(); } },
        el("img", { src: `/api/image/${i.inspection_id}?size=96`, alt: "" }),
        el("span", {}, el("b", { text: prettyName(i.photo_name) }), el("small", { text: fmtTime(i.created) })))));
  }

  async function paintDetail() {
    detail.replaceChildren(el("p", { class: "muted", text: "Loading the log..." }));
    let log;
    try { log = await api(`/api/log/${currentId}`); } catch (e) { detail.replaceChildren(el("div", { class: "alert", text: e.message })); return; }
    const events = log.events;
    const banner = log.intact
      ? el("div", { class: "note", style: { background: "var(--green-bg)" } }, el("b", { text: "Intact. " }), "No entry has been changed, reordered or removed, including the last ones.")
      : el("div", { class: "alert" }, el("b", { text: "Altered. " }), "This log no longer matches its own fingerprints. Do not rely on it.");
    const csv = () => {
      const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      return ["step,time,who,event,details", ...events.map((e) => [e.step, e.time, e.who, e.event, JSON.stringify(e.details)].map(q).join(","))].join("\n");
    };
    const items = events.map((e) => {
      const x = describe(e);
      return el("li", { class: `event ${x.tone}` }, el("span", { class: "dot" }, icon(x.icon, 17)),
        el("div", {},
          el("h3", { text: x.title }),
          x.note ? el("p", { class: "why", text: x.note }) : null,
          x.facts ? el("div", { class: "chips" }, x.facts.map(([k, v]) => el("span", { class: "chip" }, `${k}: ${v}`))) : null,
          el("div", { class: "meta" }, el("span", { class: "num", text: `#${e.step}` }), el("span", { class: "num", text: fmtTime(e.time, true) }),
            el("span", { class: "chip", text: e.who }),
            el("span", { class: "hash", title: "Fingerprint of the previous entry, which this entry carries", text: `previous ${e.prev_hash === "start" ? "start of log" : e.prev_hash.slice(0, 10)}` }))));
    });
    detail.replaceChildren(
      el("div", { class: "row" }, el("h2", { style: { fontSize: "20px", marginRight: "auto" }, text: prettyName(list.find((i) => i.inspection_id === currentId)?.photo_name || currentId) }),
        el("a", { class: "btn quiet sm", href: `#/inspection/${currentId}` }, "Open inspection"),
        el("button", { class: "btn quiet sm", type: "button", onclick: () => downloadFile(`audit-${currentId}.json`, JSON.stringify({ intact: log.intact, events }, null, 2)) }, icon("download", 16), "JSON"),
        el("button", { class: "btn quiet sm", type: "button", onclick: () => downloadFile(`audit-${currentId}.csv`, csv(), "text/csv") }, icon("download", 16), "CSV")),
      banner,
      panel(`${events.length} entries`, el("div", { class: "pb" }, el("ol", { class: "timeline" }, items))));
  }

  search.addEventListener("input", paintPicker);
  paintPicker();
  root.append(el("div", { class: "cols audit" }, panel("Inspections", el("div", {}, el("div", { class: "pb" }, search), picker), null, "pb-none"), detail));
  await paintDetail();
}
