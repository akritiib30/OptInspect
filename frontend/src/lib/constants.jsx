import { Columns2, Contrast, Crosshair, ZoomIn } from "lucide-react";

export const VERDICTS = {
  DEFECT: { label: "Defect found", tone: "bad" },
  OK: { label: "Passed", tone: "ok" },
  NEEDS_REVIEW: { label: "Needs a person", tone: "warn" },
  NEEDS_EXPERT: { label: "Sent to an expert", tone: "warn" },
  INVALID_PHOTO: { label: "Not the product", tone: "mute" },
};

export const STATUSES = {
  CONFIRMED: { label: "Defect confirmed", tone: "bad" },
  CLEARED: { label: "Looks normal", tone: "ok" },
  NEEDS_REVIEW: { label: "Needs a person", tone: "warn" },
  HUMAN_DEFECT: { label: "Person: defect", tone: "bad" },
  HUMAN_OK: { label: "Person: fine", tone: "ok" },
  NEEDS_EXPERT: { label: "Sent to an expert", tone: "warn" },
};

export const TOOLS = {
  detector: { label: "Detector", icon: Crosshair, what: "The first look at the whole photo." },
  zoom: { label: "Zoom", icon: ZoomIn, what: "Enlarges the area so small marks stand out." },
  contrast: { label: "Contrast", icon: Contrast, what: "Stretches local brightness to reveal faint marks." },
  compare: { label: "Compare", icon: Columns2, what: "Re-compares with the good sample after a small shift search." },
};

export const TONE_COLOR = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", mute: "var(--mute)", info: "var(--info)" };
export const toneOf = (map, key) => (map[key] || { tone: "mute" }).tone;
export const colorOf = (map, key) => TONE_COLOR[toneOf(map, key)];

export const ROLE_LABEL = { admin: "Administrator", reviewer: "Reviewer", viewer: "Viewer" };
export const ROLE_TEXT = {
  admin: "Everything, including people, products and settings",
  reviewer: "Run inspections, decide on unsure cases and comment",
  viewer: "Look at results, history and the audit log",
};

export const SHORTCUTS = [
  [["Ctrl", "K"], "Open the command palette (also / when you are not typing)"],
  [["1", "to", "5"], "Inspection: photo, reference, difference, blend, split view"],
  [["B"], "Inspection: show or hide the boxes"],
  [["["], "Inspection: previous defect"], [["]"], "Inspection: next defect"],
  [["+", "-", "0"], "Viewer: zoom in, zoom out, fit to view (click the viewer first)"],
  [["D"], "Review: it is a defect"], [["O"], "Review: it is fine"], [["U"], "Review: ask an expert"],
  [["S"], "Review: skip to the next case (arrow keys move through the queue)"],
  [["D"], "Challenge: defect, then click where it is"], [["O"], "Challenge: looks fine"], [["Enter"], "Challenge: next photo"],
  [["Ctrl", "Z"], "Stress test: undo the last stroke"],
  [["Esc"], "Close a dialog or the palette"],
];

// What people can say about a defect when they decide (quick chips that fill the note)
export const REASONS = ["Scratch", "Chip or crack", "Contamination", "Smear or dirt", "Reflection only", "Not a defect"];

// Where a photo came from, when it was not a plain upload
export const SOURCES = { camera: "Camera", stress_test: "Stress test" };
