import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Crosshair, Eye, LoaderCircle, Medal, Play, RotateCcw, Swords, Timer, Trophy, X } from "lucide-react";
import Counter from "../../components/Counter";
import ScoreTrack from "../../components/ScoreTrack";
import { EmptyState, Segmented, Skeleton } from "../../components/bits";
import { api } from "../../lib/api";
import { useApi, useHotkeys } from "../../lib/hooks";
import { useToast } from "../../lib/toast";
import { STATUSES, TONE_COLOR, toneOf } from "../../lib/constants";
import { pct } from "../../lib/format";

const SAYS = { defect: "Defect", ok: "Looks fine", unsure: "Asked for help" };
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ i, x: Math.random() * 100, d: 0.6 + Math.random() * 1.2, r: Math.random() * 540 - 270, c: ["var(--gold)", "var(--ok)", "var(--bad)", "var(--info)"][i % 4], w: 6 + Math.random() * 6 })), []);
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b) => <motion.i key={b.i} style={{ left: `${b.x}%`, background: b.c, width: b.w, height: b.w * 1.6 }} initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: 520, opacity: [1, 1, 0], rotate: b.r }} transition={{ duration: 1.6 + b.d, ease: "easeIn", delay: b.i * 0.02 }} />)}
    </div>
  );
}

function Verdict({ who, say, correct, points, note, accent }) {
  const tone = say === "unsure" ? "warn" : correct ? "ok" : "bad";
  return (
    <div className={`ch-side ${accent}`}>
      <div className="ch-side-top"><b>{who}</b><motion.span className={`ch-points ${points ? "gain" : ""}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.5 }}>+{points}</motion.span></div>
      <div className="ch-side-say"><span className={`ch-icon ${tone}`}>{say === "unsure" ? <Eye size={18} /> : correct ? <Check size={18} /> : <X size={18} />}</span><span>{SAYS[say]}</span></div>
      <p className="hint">{note}</p>
    </div>
  );
}

export default function Challenge() {
  const toast = useToast();
  const { data: status } = useApi("/api/challenge/status");
  const { data: board, reload: reloadBoard } = useApi("/api/challenge/leaderboard");
  const { data: cfg } = useApi("/api/config");
  const [phase, setPhase] = useState("lobby");             // lobby | play | reveal | done
  const [count, setCount] = useState(10);
  const [game, setGame] = useState(null);
  const [n, setN] = useState(0);
  const [marking, setMarking] = useState(false);
  const [hover, setHover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reveals, setReveals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (phase !== "play") return undefined;
    const id = setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {                                       // fetch the next photo while this one is on screen
    if (game && n + 1 < game.rounds) new Image().src = `/api/challenge/${game.token}/${n + 1}/photo`;
  }, [game, n]);

  const begin = (i) => { setN(i); setMarking(false); setHover(null); setPhase("play"); started.current = Date.now(); setElapsed(0); };
  const start = async () => {
    setBusy(true);
    try {
      const g = await api("/api/challenge/start", { method: "POST", body: { rounds: count } });
      setGame(g); setReveals([]); setSummary(null);
      begin(0);
    } catch (e) { toast.error("Could not start", e.message); } finally { setBusy(false); }
  };
  const submit = async (verdict, point) => {
    if (busy || phase !== "play") return;
    setBusy(true);
    try {
      const r = await api(`/api/challenge/${game.token}/${n}/answer`, { method: "POST", body: { verdict, point, ms: Date.now() - started.current } });
      setReveals((a) => [...a, r]); setMarking(false); setPhase("reveal");
    } catch (e) { toast.error("That answer did not go through", e.message); } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try {
      setSummary(await api(`/api/challenge/${game.token}/finish`, { method: "POST" }));
      setPhase("done");
      reloadBoard();
    } catch (e) { toast.error("Could not finish the game", e.message); } finally { setBusy(false); }
  };
  const next = () => { if (phase !== "reveal") return false; if (n + 1 < game.rounds) begin(n + 1); else finish(); return true; };

  useHotkeys({
    d: () => (phase === "play" && !marking ? (setMarking(true), true) : false),
    o: () => (phase === "play" ? (submit("ok", null), true) : false),
    escape: () => (marking ? (setMarking(false), true) : false),
    enter: next,
    " ": next,
  });

  const onPhoto = (e) => {
    if (!marking) return;
    const r = e.currentTarget.getBoundingClientRect();
    submit("defect", [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
  };
  const onMove = (e) => {
    if (!marking) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  if (!status || !board) return <div className="grid g-12"><Skeleton h={420} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={420} r={18} style={{ gridColumn: "span 4" }} /></div>;
  if (!status.available) {
    return (
      <div className="stack-lg">
        <header className="page-head"><div><h1>Challenge</h1><p>You and the agent judge the same real photos.</p></div></header>
        <div className="card"><EmptyState title="The test photos are not on this computer" text={status.message} /></div>
      </div>
    );
  }

  const reveal = reveals[n];
  const humanTotal = reveals.reduce((a, r) => a + r.human.points, 0);
  const agentTotal = reveals.reduce((a, r) => a + r.agent.points, 0);

  if (phase === "lobby") {
    const mine = board.mine;
    return (
      <div className="stack-lg ch">
        <header className="page-head"><div><h1>Challenge</h1><p>Can you beat the agent? You both judge the same real bottle photos, and the truth is revealed after every round.</p></div></header>
        <div className="grid g-12">
          <section className="card ch-hero span-8">
            <div className="ch-hero-art" aria-hidden="true"><Swords size={44} /><i /><i /><i /></div>
            <div className="stack">
              <h2>You against the agent</h2>
              <ol className="ch-steps">
                <li><Eye size={18} /><span>A real bottle photo appears. Is there a defect?</span></li>
                <li><Crosshair size={18} /><span>Say <b>Defect</b> (D) or <b>Looks fine</b> (O). If you spot one, click on it.</span></li>
                <li><Trophy size={18} /><span>See the truth, what the agent decided, and who scores.</span></li>
              </ol>
              <p className="hint">1 point for the right answer, 1 more for pointing at a real defect. The agent may ask for help instead of guessing, which scores nothing. It was tuned on these same photos, so it has a home advantage.</p>
              <div className="row">
                <Segmented id="ch-count" label="Rounds" value={count} onChange={setCount} options={[{ value: 6, label: "6 rounds" }, { value: 10, label: "10 rounds" }, { value: 14, label: "14 rounds" }]} />
                <button className="btn btn-primary btn-lg" onClick={start} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />} Start</button>
              </div>
            </div>
          </section>
          <section className="card card-pad span-4">
            <h2 className="panel-title">Your record</h2>
            {mine.games ? (
              <div className="ch-record">
                <div><b className="num"><Counter value={mine.games} /></b><span>games</span></div>
                <div><b className="num">{pct(mine.human_accuracy)}</b><span>you got right</span></div>
                <div><b className="num">{pct(mine.agent_accuracy)}</b><span>the agent got right</span></div>
              </div>
            ) : <p className="muted">No games yet. Your first one sets the bar.</p>}
          </section>
        </div>
        <section className="card card-pad">
          <div className="panel-title"><h2>Leaderboard</h2><span className="chip spacer"><Medal size={14} /> This computer, best game per person</span></div>
          {board.top.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th>Name</th><th>Score</th><th>Agent on the same photos</th><th>Average time</th></tr></thead>
              <tbody>{board.top.map((r, i) => (
                <tr key={`${r.name}-${r.date}`} className={r.you ? "you" : ""}>
                  <td className="num">{i + 1}</td><td><b>{r.name}</b>{r.you ? <span className="chip" style={{ marginLeft: 8 }}>you</span> : null}</td>
                  <td className="num">{r.points} / {r.max}</td><td className="num">{r.agent} / {r.max}</td><td className="num">{seconds(r.avg_ms)}</td>
                </tr>))}</tbody>
            </table></div>
          ) : <p className="muted">Nobody has finished a game yet.</p>}
        </section>
      </div>
    );
  }

  if (phase === "done" && summary) {
    const win = summary.human_points > summary.agent_points, tie = summary.human_points === summary.agent_points;
    return (
      <div className="stack-lg ch">
        {win ? <Confetti /> : null}
        <header className="page-head"><div><h1>{win ? "You beat the agent" : tie ? "A tie" : "The agent wins this time"}</h1><p>{summary.rounds} rounds on real {summary.product} photos. The agent asked for help on {summary.agent_asked} of them instead of guessing.</p></div>
          <div className="actions"><button className="btn btn-primary" onClick={() => setPhase("lobby")}><RotateCcw size={16} /> Play again</button></div></header>
        <section className="card ch-final">
          <div className="ch-final-grid">
            {[["You", summary.human_points, "you"], ["The agent", summary.agent_points, "agent"]].map(([who, pts, cls]) => (
              <div key={who} className={`ch-final-col ${cls}`}>
                <span>{who}</span>
                <b><Counter value={pts} /><small> / {summary.max_points}</small></b>
                <div className="ch-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(pts / summary.max_points) * 100}%` }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} /></div>
                <small>{cls === "you" ? `${summary.human_correct} of ${summary.rounds} right, ${seconds(summary.avg_ms)} per photo` : `${summary.agent_correct} of ${summary.rounds} right, ${summary.agent_asked} asked for help`}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <h2 className="panel-title">Round by round</h2>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Photo</th><th>You</th><th>The agent</th></tr></thead>
            <tbody>{summary.detail.map((r, i) => (
              <tr key={i}><td className="num">{i + 1}</td><td>{r.category}</td>
                <td><span className={`tag plain ${r.human_correct ? "ok" : "bad"}`}>{r.human_correct ? "Right" : "Wrong"}</span></td>
                <td><span className={`tag plain ${r.agent_verdict === "unsure" ? "warn" : r.agent_correct ? "ok" : "bad"}`}>{r.agent_verdict === "unsure" ? "Asked for help" : r.agent_correct ? "Right" : "Wrong"}</span></td></tr>))}</tbody>
          </table></div>
        </section>
      </div>
    );
  }

  // ---- playing and revealing ----
  const round = game ? `/api/challenge/${game.token}/${n}/photo` : "";
  return (
    <div className="stack-lg ch">
      <header className="ch-bar-top">
        <div className="row tight">
          <b>Round {n + 1} of {game.rounds}</b>
          <div className="ch-dots" aria-label="Progress">{Array.from({ length: game.rounds }, (_, i) => <i key={i} className={`${i === n ? "now" : ""} ${reveals[i] ? (reveals[i].human.correct ? "ok" : "bad") : ""}`} />)}</div>
        </div>
        <div className="row">
          <span className="chip"><Timer size={14} /> <span className="num">{seconds(phase === "play" ? elapsed : reveal?.human.ms || 0)}</span></span>
          <span className="ch-score you">You <b className="num">{humanTotal}</b></span><span className="ch-score agent">Agent <b className="num">{agentTotal}</b></span>
        </div>
      </header>

      <div className="ch-play">
        <div className={`ch-stage ${marking ? "marking" : ""}`}>
          <div className="ch-photo vw" style={{ "--inv": 1 }} onClick={onPhoto} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <img key={n} src={round} alt={`Bottle photo for round ${n + 1}`} draggable="false" />
            {phase === "play" && !marking ? <span className="ch-scan" aria-hidden="true" /> : null}
            {marking && hover ? <span className="ch-target" style={{ left: `${hover.x * 100}%`, top: `${hover.y * 100}%` }} aria-hidden="true" /> : null}
            {phase === "reveal" && reveal ? (
              <>
                <svg className="ch-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  {reveal.outline.map((poly, i) => <motion.polygon key={i} points={poly.map((p) => p.join(",")).join(" ")} fill="rgba(61,220,151,0.2)" stroke="var(--ok)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.15 }} />)}
                </svg>
                {reveal.agent.boxes.map((b, i) => (
                  <motion.div key={i} className="vbox ch-agentbox" style={{ left: `${(b.x - 0.012) * 100}%`, top: `${(b.y - 0.012) * 100}%`, width: `${(b.w + 0.024) * 100}%`, height: `${(b.h + 0.024) * 100}%`, "--c": TONE_COLOR[toneOf(STATUSES, b.status)] }}
                    initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.5 + i * 0.1 }}>
                    <i className="vc a" /><i className="vc b" /><i className="vc c" /><i className="vc d" /><span className="vlabel">Agent<small className="num">{b.score.toFixed(2)}</small></span>
                  </motion.div>))}
                {reveal.human.point ? <motion.span className={`ch-mark ${reveal.human.located ? "hit" : "miss"}`} style={{ left: `${reveal.human.point[0] * 100}%`, top: `${reveal.human.point[1] * 100}%` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 14 }}><b>You</b></motion.span> : null}
              </>
            ) : null}
          </div>
          {phase === "play" ? (
            <div className="ch-buttons">
              {marking ? (
                <>
                  <p className="ch-prompt"><Crosshair size={18} /> Click on the photo where you see the defect.</p>
                  <button className="btn btn-ghost" onClick={() => submit("defect", null)} disabled={busy}>I cannot point to it</button>
                  <button className="btn btn-quiet" onClick={() => setMarking(false)}>Back <span className="kbd">Esc</span></button>
                </>
              ) : (
                <>
                  <button className="btn btn-danger btn-lg" onClick={() => setMarking(true)} disabled={busy}>Defect <span className="kbd">D</span></button>
                  <button className="btn btn-good btn-lg" onClick={() => submit("ok", null)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null} Looks fine <span className="kbd">O</span></button>
                </>
              )}
            </div>
          ) : null}
        </div>

        <AnimatePresence mode="wait">
          {phase === "reveal" && reveal ? (
            <motion.aside key={`reveal-${n}`} className="card card-pad ch-reveal" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <motion.div className={`ch-truth ${reveal.defective ? "bad" : "ok"}`} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
                <span>The truth</span><b>{reveal.defective ? `A defective bottle: ${reveal.category.toLowerCase()}` : "A good bottle"}</b>
              </motion.div>
              <div className="ch-duel">
                <Verdict who="You" accent="you" say={reveal.human.verdict} correct={reveal.human.correct} points={reveal.human.points}
                  note={reveal.defective && reveal.human.verdict === "defect" ? (reveal.human.located === true ? "You pointed at the real defect." : reveal.human.located === false ? "Your mark missed the real defect." : "You did not mark a spot.") : reveal.human.correct ? "Correct." : reveal.defective ? "There was a defect." : "That bottle was fine."} />
                <Verdict who="The agent" accent="agent" say={reveal.agent.verdict} correct={reveal.agent.correct} points={reveal.agent.points}
                  note={reveal.agent.verdict === "unsure" ? "It could not settle this one, so it asked a person instead of guessing." : reveal.agent.correct ? (reveal.agent.located ? "It confirmed the real defect." : "Correct.") : "It got this one wrong."} />
              </div>
              {reveal.agent.steps.length > 1 && cfg ? (
                <div className="stack"><span className="muted">How the agent got there</span><ScoreTrack history={reveal.agent.steps} cfg={{ dismiss: cfg.dismiss, confirm: cfg.confirm }} tone={reveal.agent.verdict === "defect" ? "bad" : reveal.agent.verdict === "unsure" ? "warn" : "ok"} /></div>
              ) : null}
              <button className="btn btn-primary btn-lg btn-block" onClick={next} disabled={busy}>{n + 1 < game.rounds ? <>Next photo <ArrowRight size={18} /></> : <>See the result <Trophy size={18} /></>} <span className="kbd">Enter</span></button>
            </motion.aside>
          ) : (
            <motion.aside key="waiting" className="card card-pad ch-reveal idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="ch-idle-art" aria-hidden="true"><i /><i /><i /></div>
              <h2>{marking ? "Point it out" : "Is there a defect?"}</h2>
              <p className="muted">{marking ? "A click close to the real mark counts. You can still go back." : "Look closely. Chips, scratches and dirt can be small. The agent is looking at the same photo."}</p>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
