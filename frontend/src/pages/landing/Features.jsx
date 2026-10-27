import { motion } from "framer-motion";
import { Eye, FlaskConical, Fingerprint, Flame, Gauge, Lock, ScanSearch, SlidersHorizontal, Swords, UserCheck, Users } from "lucide-react";
import { ChainVisual, ChallengeVisual, HotspotVisual, LinesVisual, LoopingTrack, NormalVisual, RolesVisual, SafetyVisual, StampVisual, StressVisual } from "./visuals";

function CropsVisual() {
  return (
    <div className="rm-crops" aria-hidden="true">
      {["Inspected", "Reference", "Difference"].map((t, i) => (
        <figure key={t}><div className={`crop c${i}`}><span /></div><figcaption>{t}</figcaption></figure>
      ))}
    </div>
  );
}

function Tile({ className = "", icon: Icon, title, children, visual, index = 0 }) {
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <motion.article className={`tile ${className}`} onPointerMove={onMove}
      initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay: (index % 3) * 0.09, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="tile-glow" aria-hidden="true" />
      <header><span className="tile-icon"><Icon size={18} /></span><h3>{title}</h3></header>
      <p>{children}</p>
      {visual ? <div className="tile-visual">{visual}</div> : null}
    </motion.article>
  );
}

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head">
          <h2 className="h2">What it does</h2>
          <p className="sub">Everything here is in the app you are about to open, including three labs for testing the agent yourself.</p>
        </div>
        <div className="bento">
          <Tile className="s7" icon={Eye} title="Looks again before it decides" index={0} visual={<LoopingTrack />}>
            When a score lands in the grey zone, the agent compares afresh, boosts contrast and zooms in, up to three times, and shows every step it took.
          </Tile>
          <Tile className="s5" icon={Lock} title="Never clears a defect on its own" index={1} visual={<SafetyVisual />}>
            An extra check can confirm a defect. If it only makes the defect look less likely, a person decides. A missed defect costs more than a second look.
          </Tile>
          <Tile className="s4" icon={UserCheck} title="A person, with context" index={2} visual={<CropsVisual />}>
            Reviewers see the whole photo, the exact region zoomed, the good reference and the difference map, then decide with one key.
          </Tile>
          <Tile className="s4" icon={Fingerprint} title="A record you can verify" index={3} visual={<ChainVisual />}>
            Each log entry carries a fingerprint of the one before it. Edits and deletions break the chain, and one click verifies every log.
          </Tile>
          <Tile className="s4" icon={ScanSearch} title="Refuses the wrong photo" index={4} visual={<StampVisual />}>
            Answer masks, blank images and other products are turned away instead of getting a confident guess.
          </Tile>
          <Tile className="s5" icon={Gauge} title="Learns normal from your good parts" index={5} visual={<NormalVisual />}>
            Add 50 photos of good parts. Forty build the reference, the rest teach it how big a normal difference gets. No thresholds to guess.
          </Tile>
          <Tile className="s7" icon={FlaskConical} title="Try to fool it" index={6} visual={<StressVisual />}>
            Paint a scratch or a stain onto a good photo and the real agent inspects it as you paint. A sweep shows how faint a mark can be before the agent stops noticing it.
          </Tile>
          <Tile className="s6" icon={Swords} title="You against the agent" index={7} visual={<ChallengeVisual />}>
            Judge real bottle photos side by side with it. Point at the defect, then see the truth, what the agent decided, and who scored. It may ask for help instead of guessing.
          </Tile>
          <Tile className="s6" icon={SlidersHorizontal} title="Move the lines yourself" index={8} visual={<LinesVisual />}>
            Drag the agent's two decision lines and watch what it would have done on all 83 real photos: misses, false alarms, and how many need a person.
          </Tile>
          <Tile className="s6" icon={Flame} title="See where defects happen" index={9} visual={<HotspotVisual />}>
            A heat map of every confirmed defect on the product. Defects that gather in one place usually point to one worn tool or one mould.
          </Tile>
          <Tile className="s6" icon={Users} title="Accounts, cameras and export" index={10} visual={<RolesVisual />}>
            Administrators, reviewers and viewers, with every decision carrying a name. Take photos with a camera, drop a whole folder, or export everything as one zip.
          </Tile>
        </div>
        <p className="tile-note">The small pictures on these cards illustrate how each feature behaves. The measured results are further down.</p>
      </div>
    </section>
  );
}
