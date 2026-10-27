import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Brush, Eraser, ImagePlus, LoaderCircle, Pencil, Save, Sparkles, Target, Trash2, Undo2 } from "lucide-react";
import Painter from "../../components/Painter";
import ScoreTrack from "../../components/ScoreTrack";
import Steps from "../../components/Steps";
import { EmptyState, Segmented, Skeleton } from "../../components/bits";
import { api, productImage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useApi, useHotkeys } from "../../lib/hooks";
import { useToast } from "../../lib/toast";
import { STATUSES, TONE_COLOR, toneOf } from "../../lib/constants";
import { num, prettyName } from "../../lib/format";

const PRESETS = [
  { id: "smudge", label: "Faint smudge", tool: "brush", size: 26, strength: 0.12, tone: "light" },
  { id: "scratch", label: "Hairline scratch", tool: "scratch", size: 34, strength: 0.3, tone: "light" },
  { id: "chip", label: "Bright chip", tool: "brush", size: 14, strength: 0.7, tone: "light" },
  { id: "stain", label: "Dark stain", tool: "brush", size: 28, strength: 0.6, tone: "dark" },
];
const SWEEP_SIZES = { S: 0.025, M: 0.04, L: 0.06 };
const pct = (x) => `${Math.round(x * 100)}%`;

/** What the agent did, said the way a person would say it. */
function describe(result) {
  if (!result) return null;
  if (!result.defects.length) {
    return { tone: "mute", title: "Not noticed", text: "The agent compared your photo with the good reference and found nothing above the normal level. As far as it is concerned, this bottle is fine." };
  }
  const rank = { CONFIRMED: 3, NEEDS_REVIEW: 2, CLEARED: 1 };
  const top = [...result.defects].sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0) || b.final_score - a.final_score)[0];
  const checks = top.history.length - 1;
  const after = checks ? ` after ${checks} extra check${checks === 1 ? "" : "s"}` : " on the first look";
  const extra = result.defects.length > 1 ? ` ${result.defects.length - 1} other spot${result.defects.length === 2 ? " was" : "s were"} flagged too.` : "";
  if (top.status === "CONFIRMED") return { tone: "bad", top, title: "Caught", text: `The agent confirmed a defect with a score of ${num(top.final_score)}${after}.${extra}` };
  if (top.status === "NEEDS_REVIEW") {
    const lowered = top.history.length > 1 && top.final_score < top.history[0].score;
    return { tone: "warn", top, title: "Sent to a person", text: `The agent could not settle it (score ${num(top.final_score)}${after}).${lowered ? " The checks made it look less likely, but a check can never clear a defect, so a person decides." : ""}${extra}` };
  }
  return { tone: "ok", top, title: "Looked normal", text: `The agent saw something there but scored it ${num(top.final_score)}, below the normal line, and cleared it. In a real line that would be a miss.${extra}` };
}

function sweepSummary(levels) {
  const conf = levels.find((l) => l.status === "CONFIRMED");
  const person = levels.find((l) => l.status === "NEEDS_REVIEW");
  const cleared = levels.filter((l) => l.status === "CLEARED");
  const lines = [];
  if (!conf && !person && !cleared.length) return ["The agent did not notice this mark at any strength. Where it sits, or how it contrasts with the photo, hides it completely."];
  if (conf) lines.push(`On its own it confirms the mark from ${pct(conf.level)} strength.`);
  else lines.push("It never confirmed this mark on its own.");
  if (person) lines.push(`It asks a person from ${pct(person.level)}.`);
  if (cleared.length) lines.push(`At ${cleared.map((l) => pct(l.level)).join(" and ")} it saw something but called it normal: those are misses.`);
  let quiet = 0;
  while (quiet < levels.length && !levels[quiet].status) quiet += 1;
  if (quiet) lines.push(`Up to ${pct(levels[quiet - 1].level)} it did not notice anything.`);
  return lines;
}

function SweepChart({ data, cfg }) {
  const { levels } = data;
  const W = 540, H = 250, L = 44, R = 16, T = 14, B = 44, pw = W - L - R, ph = H - T - B;
  const y = (s) => T + (1 - s) * ph;
  const x = (i) => L + ((i + 0.5) * pw) / levels.length;
  const color = (st) => (st ? TONE_COLOR[toneOf(STATUSES, st)] : "var(--mute)");
  const bands = [[0, cfg.dismiss, "ok"], [cfg.dismiss, cfg.confirm, "warn"], [cfg.confirm, 1, "bad"]];
  const path = levels.map((l, i) => `${i ? "L" : "M"}${x(i)} ${y(l.final ?? 0)}`).join(" ");
  return (
    <svg className="sweep-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agent score for the same defect painted at eight strengths">
      {bands.map(([a, b, t]) => <rect key={t} x={L} y={y(b)} width={pw} height={y(a) - y(b)} fill={TONE_COLOR[t]} opacity="0.11" />)}
      {[0, cfg.dismiss, cfg.confirm, 1].map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-2)" strokeDasharray="3 5" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="t-label">{v.toFixed(2).replace(/0$/, "")}</text></g>
      ))}
      <motion.path d={path} fill="none" stroke="var(--text-3)" strokeWidth="1.4" strokeDasharray="2 4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      {levels.map((l, i) => (
        <g key={l.level}>
          {l.first != null && l.final != null && Math.abs(l.first - l.final) > 0.02 ? (
            <motion.line x1={x(i)} x2={x(i)} y1={y(l.first)} y2={y(l.final)} stroke={color(l.status)} strokeWidth="2" strokeOpacity="0.55" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5 + i * 0.09 }} />
          ) : null}
          {l.first != null ? <circle cx={x(i)} cy={y(l.first)} r="4" fill="var(--surface)" stroke="var(--text-2)" strokeWidth="1.6"><title>{`First look ${num(l.first)}`}</title></circle> : null}
          <motion.circle cx={x(i)} cy={y(l.final ?? 0)} r={l.status ? 8 : 6} fill={l.status ? color(l.status) : "var(--surface)"} stroke={l.status ? "var(--surface)" : "var(--mute)"} strokeWidth="2.4"
            style={{ transformBox: "fill-box", transformOrigin: "center" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.25 + i * 0.09, type: "spring", stiffness: 420, damping: 16 }}>
            <title>{l.status ? `${STATUSES[l.status].label}, final score ${num(l.final)}` : "Not noticed"}</title>
          </motion.circle>
          <text x={x(i)} y={H - 22} textAnchor="middle" className="t-step">{pct(l.level)}</text>
        </g>
      ))}
      <text x={L + pw / 2} y={H - 4} textAnchor="middle" className="t-label">how strongly the mark is painted</text>
    </svg>
  );
}

export default function StressTest() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: products } = useApi("/api/products");
  const { data: cfg } = useApi("/api/config");
  const usable = useMemo(() => (products || []).filter((p) => p.calibrated), [products]);

  const [product, setProduct] = useState(null);
  const [baseId, setBaseId] = useState(null);
  const [custom, setCustom] = useState(null);                 // { url, name } for a photo the person picked
  const [tool, setTool] = useState("brush");
  const [size, setSize] = useState(22);
  const [strength, setStrength] = useState(0.3);
  const [tone, setTone] = useState("light");
  const [auto, setAuto] = useState(true);
  const [painted, setPainted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [spotMode, setSpotMode] = useState(false);
  const [spot, setSpot] = useState({ x: 0.62, y: 0.4 });
  const [shape, setShape] = useState("stain");
  const [sweepSize, setSweepSize] = useState("M");
  const [sweepTone, setSweepTone] = useState("light");
  const [sweep, setSweep] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const painter = useRef(null);
  const abort = useRef(null);
  const timer = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (product || !usable.length) return;
    const p = usable.find((x) => x.name === "bottle") || usable[0];
    setProduct(p.name);
    setBaseId(p.samples.find((s) => s.id.startsWith("good"))?.id || "reference");
  }, [usable, product]);
  const prod = usable.find((p) => p.name === product);
  const bases = useMemo(() => {
    if (!prod) return [];
    const samples = [...prod.samples].sort((a, b) => Number(b.id.startsWith("good")) - Number(a.id.startsWith("good")));
    return [{ id: "reference", label: "Reference" }, ...samples.map((s) => ({ id: s.id, label: prettyName(s.label) }))];
  }, [prod]);
  const src = !prod ? null : baseId === "custom" && custom ? custom.url : productImage(prod.name, baseId === "reference" ? null : baseId);

  const reset = () => { setResult(null); setError(null); setSweep(null); clearTimeout(timer.current); abort.current?.abort(); setBusy(false); };
  useEffect(() => { reset(); }, [src]);                       // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(timer.current); abort.current?.abort(); }, []);

  const inspect = useCallback(async () => {
    if (!painter.current || !product) return;
    const blob = await painter.current.blob();
    const form = new FormData();
    form.append("image", blob, "painted.png");
    form.append("product", product);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true); setError(null);
    try {
      setResult(await api("/api/stress/try", { method: "POST", form, signal: ctl.signal }));
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  }, [product]);
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const onStrokeEnd = useCallback(() => {
    if (!autoRef.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => inspectRef.current(), 380);
  }, []);
  const onPainted = useCallback((has) => { setPainted(has); if (!has) { setResult(null); setError(null); clearTimeout(timer.current); } }, []);

  useEffect(() => {                                           // drop a preset defect once the new settings are in place
    if (!pendingDrop) return;
    painter.current?.drop(pendingDrop.x, pendingDrop.y);
    setPendingDrop(null);
  }, [pendingDrop]);

  const applyPreset = (pr) => {
    setTool(pr.tool); setSize(pr.size); setStrength(pr.strength); setTone(pr.tone);
    const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.17;
    setPendingDrop(baseId === "custom" ? { x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 } : { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 10 * 1024 * 1024) { toast.error("That file cannot be used", "Choose a photo (PNG or JPG) under 10 MB."); return; }
    if (custom) URL.revokeObjectURL(custom.url);
    setCustom({ url: URL.createObjectURL(f), name: f.name });
    setBaseId("custom");
  };

  const runSweep = async () => {
    if (baseId === "custom") return;
    setSweeping(true); setSweep(null);
    try {
      setSweep(await api("/api/stress/sweep", { method: "POST", body: { product, base: baseId, shape, tone: sweepTone, size: SWEEP_SIZES[sweepSize], x: spot.x, y: spot.y } }));
    } catch (e) { toast.error("The sweep did not run", e.message); } finally { setSweeping(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const form = new FormData();
      form.append("image", await painter.current.blob(), "painted_defect.png");
      form.append("product", product);
      form.append("source", "stress_test");
      const r = await api("/api/inspect", { method: "POST", form });
      toast.ok("Saved as an inspection", "It is marked as a stress test in your record.");
      navigate(`/app/inspections/${r.inspection_id}`);
    } catch (e) { toast.error("Could not save", e.message); } finally { setSaving(false); }
  };

  useHotkeys({ "ctrl+z": () => painter.current?.undo() });

  if (!products || !cfg) return <div className="grid g-12"><Skeleton h={560} r={18} style={{ gridColumn: "span 8" }} /><Skeleton h={560} r={18} style={{ gridColumn: "span 4" }} /></div>;
  if (!usable.length) {
    return (
      <div className="stack-lg">
        <header className="page-head"><div><h1>Stress test</h1><p>Paint a defect onto a good photo and see whether the agent notices.</p></div></header>
        <div className="card"><EmptyState title="Needs a calibrated product" text="The stress test paints onto a good photo and asks the real agent. Build the bottle product (python build_product.py bottle bottle) or create one on the Products page." /></div>
      </div>
    );
  }

  const d = describe(result);
  const boxes = result?.defects || [];
  const ws = result?.work_size || [256, 256];
  const spotOnCustom = baseId === "custom";

  return (
    <div className="stack-lg st">
      <header className="page-head">
        <div>
          <h1>Stress test</h1>
          <p>Paint a defect onto a good photo and watch whether the agent notices it. Nothing is saved to your record unless you choose to.</p>
        </div>
      </header>

      <div className="st-grid">
        <section className="card st-studio">
          <div className="st-bases" role="group" aria-label="Photo to paint on">
            <span className="muted">Paint on</span>
            <div className="st-base-row">
              {bases.map((b) => (
                <button key={b.id} className={`st-base ${baseId === b.id ? "on" : ""}`} onClick={() => setBaseId(b.id)} title={b.label} aria-pressed={baseId === b.id}>
                  <img src={productImage(prod.name, b.id === "reference" ? null : b.id, 120)} alt="" /><span>{b.label}</span>
                </button>
              ))}
              {custom ? (
                <button className={`st-base ${baseId === "custom" ? "on" : ""}`} onClick={() => setBaseId("custom")} aria-pressed={baseId === "custom"}><img src={custom.url} alt="" /><span>Yours</span></button>
              ) : null}
              <button className="st-base add" onClick={() => fileInput.current?.click()} aria-label="Paint on your own photo"><ImagePlus size={22} /><span>Your photo</span></button>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickFile} />
            </div>
          </div>

          <div className="st-stage">
            <Painter ref={painter} src={src} tool={tool} size={size} strength={strength} tone={tone} scanning={busy}
              spotMode={spotMode} spot={spotMode || sweep || sweeping ? spot : null}
              onSpot={(p) => { setSpot(p); setSpotMode(false); setSweep(null); }} onStrokeEnd={onStrokeEnd} onPainted={onPainted}>
              <div className="st-boxes" aria-hidden="true">
                <AnimatePresence>
                  {painted && !busy ? boxes.map((b, i) => {
                    const [bx, by, bw, bh] = b.box, pad = 4, c = TONE_COLOR[toneOf(STATUSES, b.status)];
                    return (
                      <motion.div key={`${i}-${b.final_score}`} className="vbox" style={{ left: `${((bx - pad) / ws[0]) * 100}%`, top: `${((by - pad) / ws[1]) * 100}%`, width: `${((bw + 2 * pad) / ws[0]) * 100}%`, height: `${((bh + 2 * pad) / ws[1]) * 100}%`, "--c": c }}
                        initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.1 }}>
                        <i className="vc a" /><i className="vc b" /><i className="vc c" /><i className="vc d" />
                        <span className="vlabel">{i + 1}<small className="num">{num(b.final_score)}</small></span>
                      </motion.div>
                    );
                  }) : null}
                </AnimatePresence>
              </div>
              {!painted && !spotMode ? <div className="st-hint"><Brush size={20} /><b>Drag to paint a defect</b><span>or pick a preset below</span></div> : null}
              {spotMode ? <div className="st-hint solid"><Target size={20} /><b>Click where the test defect should go</b></div> : null}
            </Painter>
          </div>

          <div className="st-tools">
            <Segmented id="st-tool" label="Tool" value={tool} onChange={setTool} options={[
              { value: "brush", label: "Brush", icon: <Brush size={16} /> }, { value: "scratch", label: "Scratch", icon: <Pencil size={16} /> }, { value: "eraser", label: "Eraser", icon: <Eraser size={16} /> }]} />
            <Segmented id="st-tone" label="Mark colour" value={tone} onChange={setTone} options={[{ value: "light", label: "Bright mark" }, { value: "dark", label: "Dark mark" }]} />
            <div className="row tight st-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => painter.current?.undo()} disabled={!painted} title="Undo (Ctrl+Z)"><Undo2 size={16} /> Undo</button>
              <button className="btn btn-ghost btn-sm" onClick={() => painter.current?.clear()} disabled={!painted}><Trash2 size={16} /> Clear</button>
            </div>
          </div>

          <div className="st-sliders">
            <label className="st-range"><span>Size</span><input type="range" min="6" max="60" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Brush size" /><b className="num">{size}</b></label>
            <label className="st-range"><span>Strength</span><input type="range" min="2" max="100" value={Math.round(strength * 100)} onChange={(e) => setStrength(Number(e.target.value) / 100)} aria-label="Paint strength" /><b className="num">{pct(strength)}</b></label>
          </div>

          <div className="st-presets">
            <span className="muted">Try</span>
            {PRESETS.map((pr) => <button key={pr.id} className="chip st-preset" onClick={() => applyPreset(pr)}><Sparkles size={14} />{pr.label}</button>)}
            <label className="st-auto"><span className="switch"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /></span><span>Inspect as I paint</span></label>
          </div>
        </section>

        <aside className="st-side">
          <section className={`card card-pad st-verdict ${d ? d.tone : "idle"}`} aria-live="polite">
            <h2 className="panel-title">What the agent says</h2>
            {error ? <p className="error-text">{error}</p> : null}
            {!painted ? (
              <div className="st-idle"><div className="st-idle-art"><i /><i /><i /></div><p className="muted">Paint a mark and the real agent inspects it on the spot: first look, extra checks, and a verdict you can read.</p></div>
            ) : busy && !d ? (
              <div className="st-idle"><LoaderCircle className="spin" size={26} /><p className="muted">The agent is looking...</p></div>
            ) : d ? (
              <motion.div key={`${d.title}-${result.duration_ms}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: busy ? 0.55 : 1, y: 0 }} className="stack">
                <div className="st-verdict-head"><span className={`st-stamp ${d.tone}`}>{d.title}</span><span className="muted num">{result.duration_ms} ms</span></div>
                <p>{d.text}</p>
                {d.top ? (
                  <>
                    <ScoreTrack history={d.top.history} tone={toneOf(STATUSES, d.top.status)} cfg={{ dismiss: cfg.dismiss, confirm: cfg.confirm }} />
                    <Steps history={d.top.history} />
                  </>
                ) : null}
              </motion.div>
            ) : null}
            <div className="row" style={{ marginTop: 14 }}>
              {!auto ? <button className="btn btn-primary btn-sm" onClick={inspect} disabled={!painted || busy}><Sparkles size={16} /> Inspect now</button> : null}
              {can.inspect ? <button className="btn btn-ghost btn-sm" onClick={save} disabled={!painted || saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save as an inspection</button> : null}
            </div>
          </section>

          <section className="card card-pad st-sweep">
            <h2 className="panel-title">How faint can a defect be?</h2>
            <p className="hint">The same mark is painted on the clean photo at eight strengths, and the real agent judges each one. Where you put it matters: dark places hide dark marks.</p>
            <div className="st-sweep-controls">
              <Segmented id="sw-shape" label="Shape" value={shape} onChange={setShape} options={[{ value: "stain", label: "Stain" }, { value: "scratch", label: "Scratch" }]} />
              <Segmented id="sw-size" label="Size" value={sweepSize} onChange={setSweepSize} options={[{ value: "S", label: "S" }, { value: "M", label: "M" }, { value: "L", label: "L" }]} />
              <Segmented id="sw-tone" label="Colour" value={sweepTone} onChange={setSweepTone} options={[{ value: "light", label: "Bright" }, { value: "dark", label: "Dark" }]} />
            </div>
            <div className="row">
              <button className={`btn btn-ghost btn-sm ${spotMode ? "on" : ""}`} onClick={() => setSpotMode((v) => !v)}><Target size={16} /> {spotMode ? "Click the photo..." : "Place it on the photo"}</button>
              <button className="btn btn-primary btn-sm" onClick={runSweep} disabled={sweeping || spotOnCustom}>{sweeping ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Run the sweep</button>
            </div>
            {spotOnCustom ? <p className="hint">The sweep works on the reference and the ready-made photos, not on your own.</p> : null}
            <AnimatePresence>
              {sweep ? (
                <motion.div key="sweep" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="stack">
                  {sweep.baseline.defects ? <p className="hint">Note: this photo already raises {sweep.baseline.defects} alert{sweep.baseline.defects === 1 ? "" : "s"} without any painting, so choose another base.</p> : null}
                  <SweepChart data={sweep} cfg={cfg} />
                  <ul className="st-legend">
                    <li><i style={{ background: "var(--bad)" }} />Confirmed</li><li><i style={{ background: "var(--warn)" }} />Sent to a person</li>
                    <li><i style={{ background: "var(--ok)" }} />Called normal (a miss)</li><li><i className="hollow" />Not noticed</li><li><i className="ring" />First look</li>
                  </ul>
                  <ul className="st-findings">{sweepSummary(sweep.levels).map((t) => <li key={t}>{t}</li>)}</ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </aside>
      </div>
    </div>
  );
}
