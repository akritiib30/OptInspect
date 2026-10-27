import { el, getConfig, icon, panel, pageHead, scoreTrack } from "../ui.js";

// Measured offline with eval_agent.py on 83 real MVTec AD bottle photos (reported in the project README).
const BENCH = [
  ["Good bottles", 20, { confirmed: 0, person: 1, missed: 0, normal: 19 }],
  ["Broken, large", 20, { confirmed: 20, person: 0, missed: 0, normal: 0 }],
  ["Broken, small", 22, { confirmed: 19, person: 3, missed: 0, normal: 0 }],
  ["Contamination", 21, { confirmed: 18, person: 0, missed: 3, normal: 0 }],
];

export default async function how(root) {
  const cfg = await getConfig();
  const host = root;

  host.append(pageHead("How it works", "What the inspector does with a photo, how it decides when it is unsure, and what it does not do."));

  const steps = [
    ["Check it is the right photo", `The photo's overall shape must match the product's reference (at least ${cfg.min_structure}). Answer masks, blank images and other products are rejected, not inspected.`],
    ["Line it up and compare", "The reference is shifted and turned to match the photo, its lighting is matched, and small mismatches along strong edges are forgiven. What is left is a map of real differences."],
    ["Score each difference", `Each difference gets a score from 0 to 1, measured against the largest difference ever seen on good photos of this product.`],
    ["Look again when unsure", `Scores between ${cfg.dismiss} and ${cfg.confirm} trigger up to ${cfg.max_tries} extra checks: zoom, contrast, and a fresh comparison with the reference.`],
    ["Ask a person when still unsure", "If the checks do not settle it, or only make the defect look less likely, the case goes to a person with the whole photo and a zoomed view of the region."],
    ["Write everything down", "Each step goes into a log in which every entry carries a fingerprint of the one before it. Edits and deletions break the chain, and the Audit log page says so."],
  ];
  host.append(el("div", { class: "cols halves" },
    panel("From photo to decision", el("div", { class: "pb" }, el("ol", { class: "pipeline" }, steps.map(([h, t]) => el("li", {}, el("div", {}, el("h3", { text: h }), el("p", { class: "muted", text: t }))))))),
    el("div", { class: "stack lg" },
      panel("Reading a score", el("div", { class: "pb stack" },
        scoreTrack([{ by: "detector", score: 0.53 }, { by: "compare", score: 0.44 }, { by: "contrast", score: 0.24 }, { by: "zoom", score: 0.93 }], cfg, "red"),
        el("p", { class: "muted", text: `A real run on a broken bottle: the first look was unsure at 0.53, two checks did not help, and zoom raised it to 0.93, above ${cfg.confirm}, so the defect was confirmed. Below ${cfg.dismiss} a difference counts as normal.` }))),
      panel("Rules it does not break", el("div", { class: "pb" }, el("ul", { class: "prose", style: { paddingLeft: "18px", margin: 0 } },
        el("li", { text: "Extra checks can confirm a defect, never dismiss one. A missed defect costs more than a second look." }),
        el("li", { text: "A person's decision is saved once and never overwritten." }),
        el("li", { text: "Wrong photos are refused instead of answered with a confident guess." }),
        el("li", { text: "Nothing is deleted from the log by the application." })))))));

  const bars = el("div", { class: "bars" });
  for (const [label, n, r] of BENCH) {
    const seg = (v, color, name) => (v ? el("i", { style: { width: `${(v / n) * 100}%`, background: color }, title: `${v} ${name}` }) : null);
    bars.append(el("div", { class: "bar-row", style: { gridTemplateColumns: "140px 1fr 56px" } }, el("span", { text: label }),
      el("div", { class: "stacked", role: "img", "aria-label": `${label}: ${r.confirmed} confirmed, ${r.person} sent to a person, ${r.missed} missed, ${r.normal} normal` },
        seg(r.confirmed, "var(--red)", "confirmed"), seg(r.person, "var(--amber)", "sent to a person"), seg(r.missed, "var(--slate)", "missed"), seg(r.normal, "var(--green)", "normal")),
      el("span", { class: "num muted", text: `${n} photos` })));
  }
  host.append(el("div", { style: { margin: "20px 0" } }, panel("How it did on real bottle photos", el("div", { class: "pb stack" },
    el("div", { class: "legend" },
      [["var(--red)", "Defect confirmed"], ["var(--amber)", "Sent to a person"], ["var(--slate)", "Missed"], ["var(--green)", "Normal"]].map(([c, t]) => el("span", {}, el("i", { style: { background: c } }), t))),
    bars,
    el("p", { class: "muted", text: "Of 63 defective bottles, 57 were confirmed, 3 went to a person and 3 faint contamination marks were missed. No good bottle was wrongly confirmed. The edge setting was tuned while looking at these same photos, so treat the figures as somewhat optimistic. Measured offline with eval_agent.py; this page does not recompute them." })))));

  host.append(el("div", { class: "cols halves" },
    panel("What it does not do", el("div", { class: "pb" }, el("ul", { class: "prose", style: { paddingLeft: "18px", margin: 0 } },
      el("li", { text: "It misses a few faint, small marks: they never score high enough to trigger a second look." }),
      el("li", { text: "It was tested on one product (bottles), with photos shrunk to 256 pixels." }),
      el("li", { text: "It can reject clearly wrong pictures, but a similar-looking different item could pass." }),
      el("li", { text: "There is no login, and the log records 'human' rather than a name." }),
      el("li", { text: "The log shows tampering but cannot prevent it: someone who rewrites the log and its end marker together would not be caught." }),
      el("li", { text: "It runs on one computer. No cloud service is used, and the next check is chosen by simple rules, not by an AI model." })))),
    panel("Built with", el("div", { class: "pb prose" },
      el("p", {}, el("b", { text: "OpenCV 5.0.0.93" }), " for alignment, comparison, contours and the zoom and contrast checks. Python and Flask serve the app. This interface is plain JavaScript with no build step."),
      el("p", { class: "muted", text: "Evaluated on MVTec AD (Bergmann, Fauser, Sattlegger and Steger, CVPR 2019), licensed CC BY-NC-SA 4.0 for non-commercial use. The dataset photos are not redistributed with this project." })))));
}
