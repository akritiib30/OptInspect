import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Minus, Plus, SlidersHorizontal, Swords } from "lucide-react";
import { StatusTag, VerdictTag } from "../../components/bits";
import { SHORTCUTS, STATUSES, VERDICTS } from "../../lib/constants";

const START = [
  ["Pick a product", "On Products you will find the bottle product with real test photos. Administrators can build a new one from 50 or more photos of good parts."],
  ["Inspect photos", "Go to Inspect, choose the product, and drop one photo or a whole folder, or take photos with a camera. Each photo is compared with the good reference and scored."],
  ["Watch the agent look again", "If a score lands in the grey zone, the agent compares afresh, boosts contrast and zooms in, then shows you every step on the inspection page."],
  ["Decide the unsure ones", "Cases it cannot settle appear in Review with the exact region zoomed. Press D, O or U. Your name goes on the decision."],
  ["Check the record", "The Audit log shows every step. One click verifies that no entry was edited, reordered or removed."],
];
const LABS = [
  [FlaskConical, "Stress test", "Paint a defect onto a good photo and the real agent inspects it as you paint. The sweep paints the same mark at eight strengths and shows where the agent stops noticing. Bright marks on these dark photos are easy; dark marks hide."],
  [Swords, "Challenge", "You and the agent judge the same real test photos, round by round. Say defect or fine, point at the defect, then see the truth and what the agent decided. The agent may ask for help instead of guessing, which scores nothing."],
  [SlidersHorizontal, "Tolerance lab", "Drag the agent's two decision lines and watch what it would have done on all 83 real photos: how many defects it would miss, how many false alarms it would raise, and how many photos would need a person."],
];
const FAQ = [
  ["Why was my photo marked \"Not the product\"?", "Its overall shape did not match the reference photo for the product you chose (a shape match of at least 0.85 is needed; real photos of the product score 0.97 or more). Check that you picked the right product and that the file is a photo of the part, not a screenshot or a mask."],
  ["Why did a defect go to a person when the score went down?", "A check can raise a score toward \"confirmed\", but it can never clear a defect. If the checks only make it look less likely, a person decides. A missed defect costs more than a second look."],
  ["What does the score mean?", "It is how far the strongest difference stands above the largest difference ever seen on good photos of this product. Up to 0.15 looks normal, 0.70 or more is confirmed, and anything between is unsure."],
  ["Do the labs change my records?", "No. The stress test, the challenge and the tolerance lab run the real agent but write nothing to your inspections or audit log. The one exception is the stress test's Save button, which stores your painted photo as an inspection marked as a stress test."],
  ["Why can I not open the Challenge or the Tolerance lab?", "They replay the real test photos a product was built from. Put the MVTec bottle folder next to server.py, the same one used to build the bottle product."],
  ["Why does a viewer see no Inspect button?", "Viewers have read-only access. An administrator can change your role on the Team page."],
  ["The camera does not start", "Open the app at http://127.0.0.1:5000 in Chrome or Edge and allow the camera when the browser asks. If it was blocked, use the camera icon in the address bar to allow it again."],
];

export default function Help() {
  const [open, setOpen] = useState(0);
  return (
    <div className="stack-lg help">
      <header className="page-head"><div><h1>Help</h1><p>How to use OptiInspect, what the labels mean, and the honest limits.</p></div></header>

      <section className="card card-pad">
        <h2 className="panel-title">Start here</h2>
        <ol className="pipeline">{START.map(([t, d]) => <li key={t}><div><h3>{t}</h3><p className="muted">{d}</p></div></li>)}</ol>
      </section>

      <section className="card card-pad">
        <h2 className="panel-title">The labs</h2>
        <ul className="lab-links">
          {LABS.map(([Icon, title, text]) => <li key={title} className="lab-link" style={{ gridTemplateColumns: "46px minmax(0, 1fr)" }}><span className="lab-icon"><Icon size={22} /></span><span><b>{title}</b><small>{text}</small></span></li>)}
        </ul>
      </section>

      <div className="grid g-12">
        <section className="card card-pad span-6">
          <h2 className="panel-title">What the labels mean</h2>
          <ul className="legend-list">
            {Object.entries(VERDICTS).map(([k, v]) => <li key={k}><VerdictTag value={k} /><span className="muted">{{ DEFECT: "At least one defect is confirmed.", OK: "Nothing rose above the normal level.", NEEDS_REVIEW: "A person still has to decide on at least one defect.", NEEDS_EXPERT: "A reviewer passed it to an expert.", INVALID_PHOTO: "The photo does not look like the chosen product, so it was not inspected." }[k]}</span></li>)}
            {Object.keys(STATUSES).filter((k) => k !== "NEEDS_REVIEW" && k !== "NEEDS_EXPERT").map((k) => <li key={k}><StatusTag value={k} /><span className="muted">{{ CONFIRMED: "The agent confirmed this defect.", CLEARED: "The first look scored it as normal.", HUMAN_DEFECT: "A person marked it as a defect.", HUMAN_OK: "A person marked it as fine." }[k]}</span></li>)}
          </ul>
        </section>
        <section className="card card-pad span-6">
          <h2 className="panel-title">Keyboard shortcuts</h2>
          <ul className="shortcuts">{SHORTCUTS.map(([keys, text], i) => <li key={i}><span className="row tight">{keys.map((k, j) => (k === "to" ? <span key={j} className="muted">to</span> : <span key={j} className="kbd">{k}</span>))}</span><span className="muted">{text}</span></li>)}</ul>
        </section>
      </div>

      <section className="card card-pad">
        <h2 className="panel-title">Questions</h2>
        <ul className="faq">
          {FAQ.map(([q, a], i) => (
            <li key={q} className={open === i ? "open" : ""}>
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}><span>{q}</span>{open === i ? <Minus size={18} /> : <Plus size={18} />}</button>
              <AnimatePresence initial={false}>{open === i ? <motion.div className="faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }}><p>{a}</p></motion.div> : null}</AnimatePresence>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad">
        <h2 className="panel-title">What to keep in mind</h2>
        <ul className="honest">
          <li>It refuses clearly wrong pictures, but a similar-looking different item could pass.</li>
          <li>Sign-in is local: accounts live in a file on this computer, with no email, two-factor or single sign-on.</li>
          <li>It runs on one computer and uses no cloud service. The next check is chosen by simple rules, not by an AI model.</li>
        </ul>
        <p className="hint">How well it did on real photos, what it missed, and how far to trust the record are on the <Link to="/" className="link">home page</Link>.</p>
      </section>
    </div>
  );
}
