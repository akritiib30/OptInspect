import { AlertTriangle, Check, CircleCheck, Crosshair, FileText, MessageSquare, ScanLine, UserCheck, X } from "lucide-react";
import { STATUSES, TOOLS, VERDICTS } from "./constants";
import { num, prettyName } from "./format";

const DECISION_WORDS = { defect: "it is a defect", ok: "it is fine", unsure: "not sure, passed to an expert" };
const SYSTEM_WHO = new Set(["system", "rule-agent"]);
export const isPerson = (who) => !SYSTEM_WHO.has(who) && who !== "human";

/** One audit-log entry in words a person can read. */
export function describeEvent(e) {
  const d = e.details || {}, n = (d.defect ?? 0) + 1;
  const tool = (t) => TOOLS[t]?.label || t;
  switch (e.event) {
    case "inspection_started":
      return { icon: ScanLine, tone: "info", title: "Inspection started", facts: [["Photo", prettyName(d.photo || "-")], ["Calibrated", d.calibrated ? `yes, normal level ${num(d.normal_level, 1)}` : "no"]] };
    case "input_rejected":
      return { icon: X, tone: "bad", title: "Photo rejected: not this product", note: d.reason, facts: [["Shape match", num(d.structure_match)], ["Pixels that differ", `${Math.round((d.share_unlike || 0) * 100)}%`]] };
    case "input_resized":
      return { icon: FileText, tone: "mute", title: "Photo resized to the reference size", note: d.note };
    case "detector_finished":
      return { icon: Crosshair, tone: "info", title: `Detector found ${d.defects_found} possible defect${d.defects_found === 1 ? "" : "s"}` };
    case "defect_found":
      return { icon: AlertTriangle, tone: "warn", title: `Defect ${n} found`, facts: [["First score", num(d.score)], ["Area", `${d.area} px`], ["Box", (d.box || []).join(", ")]] };
    case "tool_chosen":
      return { icon: TOOLS[d.tool]?.icon || Crosshair, tone: "info", title: `${e.who === "rule-agent" ? "The agent" : e.who} chose ${tool(d.tool)} for defect ${n}`, note: d.reason, facts: [["Score before", num(d.score_before)]] };
    case "tool_result":
      return { icon: TOOLS[d.tool]?.icon || Crosshair, tone: "mute", title: `${tool(d.tool)} result for defect ${n}`, facts: [["Score", `${num(d.score_before)} to ${num(d.score_after)}`]] };
    case "decision": {
      const tone = (STATUSES[d.status] || { tone: "mute" }).tone;
      return { icon: tone === "ok" ? CircleCheck : tone === "bad" ? AlertTriangle : UserCheck, tone, title: `Decision for defect ${n}: ${(STATUSES[d.status] || { label: d.status }).label}`,
        facts: [["Final score", num(d.final_score)], ["Extra checks", (d.tools_tried || []).map(tool).join(", ") || "none"]] };
    }
    case "human_review":
      return { icon: UserCheck, tone: "info", title: `${e.who} reviewed defect ${n}: ${DECISION_WORDS[d.decision] || d.decision}`, note: d.note ? `Note: ${d.note}` : null };
    case "comment_added":
      return { icon: MessageSquare, tone: "info", title: `${e.who} commented`, note: d.text };
    case "inspection_finished":
      return { icon: Check, tone: (VERDICTS[d.verdict] || { tone: "mute" }).tone, title: `Inspection finished: ${(VERDICTS[d.verdict] || { label: d.verdict }).label}` };
    default:
      return { icon: FileText, tone: "mute", title: String(e.event).replace(/_/g, " ") };
  }
}

/** A one-line version for the live feed and notifications. */
export function feedLine(e) {
  const d = e.details || {}, photo = prettyName(e.photo_name);
  switch (e.event) {
    case "inspection_finished": {
      const v = VERDICTS[d.verdict] || { label: d.verdict, tone: "mute" };
      return { icon: ScanLine, tone: v.tone, text: <><b>{photo}</b> inspected: {v.label.toLowerCase()}</> };
    }
    case "human_review":
      return { icon: UserCheck, tone: "info", text: <><b>{e.who}</b> decided defect {(d.defect ?? 0) + 1} of <b>{photo}</b>: {DECISION_WORDS[d.decision] || d.decision}</> };
    case "comment_added":
      return { icon: MessageSquare, tone: "info", text: <><b>{e.who}</b> commented on <b>{photo}</b></> };
    case "input_rejected":
      return { icon: X, tone: "mute", text: <><b>{photo}</b> was refused: not the product</> };
    default:
      return { icon: FileText, tone: "mute", text: <>{String(e.event).replace(/_/g, " ")}: {photo}</> };
  }
}
