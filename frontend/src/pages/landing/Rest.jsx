import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Minus, Plus } from "lucide-react";
import Counter from "../../components/Counter";
import Logo from "../../components/Logo";
import { useAuth } from "../../lib/auth";

// ---------- the tape between hero and walkthrough ----------
const TAPE = ["Lines the reference up", "Forgives edge noise", "Scores against normal", "Zooms in", "Boosts contrast", "Compares again", "Never clears a defect alone", "Asks a person", "Seals every step"];
export function Ribbon() {
  const items = [...TAPE, ...TAPE];
  return (
    <div className="ribbon" aria-label="What the inspector does, in order">
      <div className="ribbon-track" aria-hidden="true">
        {items.map((t, i) => <span key={i}><i />{t}</span>)}
      </div>
    </div>
  );
}

// ---------- results ----------
const BENCH = [
  ["Good bottles", 20, { confirmed: 0, person: 1, missed: 0, normal: 19 }],
  ["Broken, large", 20, { confirmed: 20, person: 0, missed: 0, normal: 0 }],
  ["Broken, small", 22, { confirmed: 19, person: 3, missed: 0, normal: 0 }],
  ["Contamination", 21, { confirmed: 18, person: 0, missed: 3, normal: 0 }],
];
const LEGEND = [["var(--bad)", "Defect confirmed", "confirmed"], ["var(--warn)", "Sent to a person", "person"], ["var(--mute)", "Missed", "missed"], ["var(--ok)", "Normal", "normal"]];

export function Results() {
  return (
    <section className="section" id="results">
      <div className="container">
        <div className="section-head">
          <h2 className="h2">How it did on real photos</h2>
          <p className="sub">83 photos from the MVTec AD bottle set, measured offline with the project's own test script.</p>
        </div>
        <div className="results-grid">
          <div className="big-numbers">
            <div><b><Counter value={57} /><span>/63</span></b><p>defects confirmed</p></div>
            <div><b><Counter value={3} /></b><p>sent to a person</p></div>
            <div><b><Counter value={0} /><span>/20</span></b><p>good bottles wrongly confirmed</p></div>
            <div className="miss"><b><Counter value={3} /></b><p>faint marks missed</p></div>
          </div>
          <div className="card card-pad">
            <div className="legend">{LEGEND.map(([c, t]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>
            <div className="bars">
              {BENCH.map(([label, n, r]) => (
                <div className="bar-row" key={label}>
                  <span>{label}</span>
                  <div className="stacked" role="img" aria-label={`${label}: ${r.confirmed} confirmed, ${r.person} sent to a person, ${r.missed} missed, ${r.normal} normal`}>
                    {LEGEND.map(([c, t, k], j) => r[k] ? (
                      <motion.i key={k} style={{ background: c }} initial={{ width: 0 }} whileInView={{ width: `${(r[k] / n) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.1 + j * 0.12, ease: [0.2, 0.8, 0.2, 1] }} title={`${r[k]} ${t.toLowerCase()}`} />
                    ) : null)}
                  </div>
                  <span className="num muted">{n} photos</span>
                </div>
              ))}
            </div>
            <ul className="honest">
              <li>The edge setting was tuned while looking at these same photos, so treat the figures as somewhat optimistic.</li>
              <li>Three faint contamination marks never scored high enough to trigger a second look.</li>
              <li>Only the bottle product has been tested, with photos shrunk to 256 pixels.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- faq ----------
const FAQ = [
  ["Is this AI?", "It uses classical computer vision (OpenCV 5) and a rule-based decision loop, not a neural network. That is deliberate: every score is a measured difference compared with a measured normal level, so every decision can be explained."],
  ["Does it need the cloud?", "No. It runs on one computer. The server listens on 127.0.0.1 only, and photos, results and logs stay in folders you control."],
  ["How many photos do I need for a new product?", "At least 50 photos of good parts, all taken the same way. Forty build the reference and the rest teach the system how big a normal difference gets. The Products page does the rest."],
  ["How accurate is it?", "On 83 real bottle photos it confirmed 57 of 63 defects, sent 3 to a person, missed 3 faint marks and wrongly confirmed none of 20 good bottles. Those figures are somewhat optimistic, and only bottles were tested."],
  ["Who can do what?", "Administrators manage people, products and settings. Reviewers run inspections and decide on unsure cases. Viewers can look at everything but change nothing."],
  ["What if I forget my password?", "There is no email service. An administrator can reset it from the Team page, or you can run python manage_users.py reset your@email on the machine that hosts the app."],
  ["Can the record be tampered with?", "Edits and deletions are detected, so it is tamper-evident. It is not tamper-proof: someone who can rewrite both a log and its end marker at once would not be caught."],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section" id="faq">
      <div className="container faq-grid">
        <div className="section-head left">
          <h2 className="h2">Questions people ask</h2>
          <p className="sub">Straight answers, including the uncomfortable ones.</p>
        </div>
        <ul className="faq">
          {FAQ.map(([q, a], i) => (
            <li key={q} className={open === i ? "open" : ""}>
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{q}</span>{open === i ? <Minus size={18} /> : <Plus size={18} />}
              </button>
              <AnimatePresence initial={false}>
                {open === i ? <motion.div className="faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}><p>{a}</p></motion.div> : null}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- closing ----------
export function Closing() {
  const { user } = useAuth();
  return (
    <section className="closing">
      <div className="container">
        <motion.div className="closing-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
          <div className="closing-rings" aria-hidden="true" />
          <h2 className="h2">Take a second look at your own photos.</h2>
          <p className="sub">Create an account, build a product from your good parts, and run your first inspection in a few minutes.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            {user ? <Link to="/app/dashboard" className="btn btn-primary btn-lg">Open your dashboard <ArrowRight size={18} /></Link>
              : <><Link to="/signup" className="btn btn-primary btn-lg">Create an account <ArrowRight size={18} /></Link><Link to="/signin" className="btn btn-ghost btn-lg">Sign in</Link></>}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="stack">
          <Logo />
          <p className="muted">Visual inspection that checks itself, asks a person when it is unsure, and keeps a record nobody can quietly change.</p>
        </div>
        <div className="stack">
          <b>Built with</b>
          <p className="muted">OpenCV 5, Python, Flask and React. It runs on one computer and uses no cloud service.</p>
        </div>
        <div className="stack">
          <b>Data</b>
          <p className="muted">Evaluated on MVTec AD (Bergmann, Fauser, Sattlegger, Steger, CVPR 2019), licensed CC BY-NC-SA 4.0 for non-commercial use. Photos are not redistributed. Typeface: Bricolage Grotesque, SIL Open Font License.</p>
        </div>
      </div>
    </footer>
  );
}
