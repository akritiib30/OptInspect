import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Camera, Check, ClipboardCheck, ImagePlus, LoaderCircle, Lock, Play, Trash2, UploadCloud, X } from "lucide-react";
import CameraModal from "../../components/CameraModal";
import { Rings, VerdictTag } from "../../components/bits";
import { api, productImage } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { prettyName } from "../../lib/format";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 40;
const STAGES = ["Checking the photo", "Lining up the reference", "Comparing", "Looking again", "Writing it down"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const uid = () => `q${Date.now().toString(36)}${counter++}`;

export default function Inspect() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data: products } = useApi("/api/products");
  const [product, setProduct] = useState(params.get("product") || null);
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const [stage, setStage] = useState(0);
  const [over, setOver] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const fileInput = useRef(null);
  const presetDone = useRef(false);

  const prod = useMemo(() => products?.find((p) => p.name === product) || null, [products, product]);
  useEffect(() => {
    if (products?.length && !product) setProduct((products.find((p) => p.name === "bottle") || products.find((p) => p.calibrated) || products[0]).name);
  }, [products, product]);

  const patch = (id, change) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const addFiles = useCallback((fileList, source = null) => {
    const incoming = [...fileList];
    let skipped = 0;
    setItems((list) => {
      const next = [...list];
      for (const f of incoming) {
        if (!f.type.startsWith("image/") || f.size > MAX_BYTES || next.length >= MAX_ITEMS || next.some((i) => i.file && i.file.name === f.name && i.file.size === f.size)) { skipped += 1; continue; }
        next.push({ id: uid(), kind: "file", file: f, name: f.name, url: URL.createObjectURL(f), status: "queued", source });
      }
      return next;
    });
    setTimeout(() => skipped && toast.info(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped`, "Only images up to 10 MB are accepted, up to 40 at a time, and the same file is not added twice."), 0);
  }, [toast]);

  const addSample = useCallback((p, s) => {
    setItems((list) => (list.length >= MAX_ITEMS ? list : [...list, { id: uid(), kind: "sample", product: p, sample: s.id, name: prettyName(s.label), url: productImage(p, s.id, 360), status: "queued" }]));
  }, []);

  // ?product=bottle&sample=broken_large_0 pre-fills the queue (the Products page links here)
  useEffect(() => {
    const s = params.get("sample");
    if (presetDone.current || !s || !products) return;
    const p = products.find((x) => x.name === (params.get("product") || product));
    const sm = p?.samples.find((x) => x.id === s);
    if (sm) { presetDone.current = true; addSample(p.name, sm); }
  }, [params, products, product, addSample]);

  useEffect(() => {
    const onPaste = (e) => { if (e.clipboardData?.files?.length) { addFiles(e.clipboardData.files); e.preventDefault(); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const remove = (id) => setItems((list) => { const x = list.find((i) => i.id === id); if (x?.kind === "file") URL.revokeObjectURL(x.url); return list.filter((i) => i.id !== id); });
  const clear = () => { items.forEach((i) => i.kind === "file" && URL.revokeObjectURL(i.url)); setItems([]); };

  const queued = items.filter((i) => i.status === "queued");
  const finished = items.filter((i) => i.status === "done" || i.status === "error");
  const doneCount = items.filter((i) => i.status === "done").length;
  const needsProduct = queued.some((i) => i.kind === "file") && !prod;

  const run = async () => {
    if (!queued.length || running || needsProduct) return;
    setRunning(true);
    let last = null, failed = 0;
    for (const it of queued) {
      setCurrent(it.id);
      patch(it.id, { status: "running" });
      setStage(0);
      const timer = setInterval(() => setStage((s) => Math.min(s + 1, 3)), 380);
      try {
        let r;
        if (it.kind === "sample") r = await api(`/api/inspect-sample/${it.product}/${it.sample}`, { method: "POST" });
        else {
          const form = new FormData();
          form.append("image", it.file);
          form.append("product", prod.name);
          if (it.source) form.append("source", it.source);
          r = await api("/api/inspect", { method: "POST", form });
        }
        patch(it.id, { status: "done", result: r });
        last = r;
      } catch (e) {
        failed += 1;
        patch(it.id, { status: "error", error: e.message });
      } finally {
        clearInterval(timer);
      }
      setStage(5);
      await sleep(420);
    }
    setRunning(false);
    setCurrent(null);
    if (queued.length === 1 && last) { toast.ok("Inspection complete", "Opening the result."); navigate(`/app/inspections/${last.inspection_id}`); }
    else if (failed) toast.error(`${failed} inspection${failed === 1 ? "" : "s"} failed`, "See the list for the reason.");
    else toast.ok("Batch complete", `${queued.length} photos inspected.`);
  };

  if (!can.inspect) {
    return (
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <div className="row"><Lock size={20} /><h2>Your account is read-only</h2></div>
        <p className="muted" style={{ marginTop: 10 }}>Viewers can look at results, history and the audit log, but not run inspections. Ask an administrator to make you a reviewer.</p>
        <Link to="/app/inspections" className="btn btn-ghost" style={{ marginTop: 16 }}>Browse inspections</Link>
      </div>
    );
  }

  const cur = items.find((i) => i.id === current);
  const summary = ["OK", "DEFECT", "NEEDS_REVIEW", "INVALID_PHOTO"].map((v) => [v, items.filter((i) => i.result?.verdict === v).length]).filter(([, n]) => n);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Inspect photos</h1><p>Drop one photo or a whole folder, or take photos with a camera. Each one is lined up with the good reference, scored, checked again when the agent is unsure, and written into the record under your name.</p></div>
        <div className="actions"><button className="btn btn-ghost" onClick={() => setCamOpen(true)} disabled={running}><Camera size={17} /> Use a camera</button></div>
      </header>
      <CameraModal open={camOpen} onClose={() => setCamOpen(false)} full={items.length >= MAX_ITEMS} onCapture={(file) => addFiles([file], "camera")} />

      <div className="inspect-grid">
        <section className={`card stage-card ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!running) addFiles(e.dataTransfer.files); }}>
          {running && cur ? (
            <div className="run-view">
              <div className="vw scanning run-photo" style={{ aspectRatio: "1 / 1" }}><img src={cur.url} alt={`Inspecting ${cur.name}`} /></div>
              <div className="run-side">
                <h2>Inspecting {cur.name}</h2>
                <ol className="stages">
                  {STAGES.map((s, i) => (
                    <li key={s} className={i < stage ? "done" : i === stage ? "now" : ""}>
                      <span>{i < stage ? <Check size={14} /> : i === stage ? <LoaderCircle size={14} className="spin" /> : i + 1}</span>{s}
                    </li>
                  ))}
                </ol>
                <div className="progress" aria-label="Batch progress"><motion.i animate={{ width: `${((doneCount + (stage >= 5 ? 1 : 0.5)) / Math.max(1, items.length)) * 100}%` }} /></div>
                <p className="hint">{doneCount + 1} of {items.length}</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <button className="dropzone" onClick={() => fileInput.current?.click()} aria-label="Choose photos to inspect">
              <Rings size={84} />
              <h2>Drop photos here</h2>
              <p className="muted">or click to choose. You can also paste an image with <span className="kbd">Ctrl</span> <span className="kbd">V</span>.</p>
              <span className="hint">PNG or JPG, up to 10 MB each, up to 40 at a time.</span>
            </button>
          ) : (
            <div className="queue">
              <div className="panel-title">
                <h2>{items.length} photo{items.length === 1 ? "" : "s"}{finished.length ? `, ${finished.length} done` : ""}</h2>
                <button className="btn btn-quiet btn-sm spacer" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Add more</button>
                <button className="btn btn-quiet btn-sm" onClick={clear}><Trash2 size={16} /> Clear</button>
              </div>
              <div className="qgrid">
                <AnimatePresence initial={false}>
                  {items.map((i) => (
                    <motion.div key={i.id} layout className={`qitem ${i.status}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                      <div className="qthumb"><img src={i.url} alt="" />{i.status === "queued" ? <button className="qx" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}><X size={14} /></button> : null}</div>
                      <b title={i.name}>{i.name}</b>
                      {i.status === "queued" ? <span className="tag mute plain">Ready</span>
                        : i.status === "running" ? <span className="tag info"><LoaderCircle size={12} className="spin" /> Inspecting</span>
                        : i.status === "error" ? <span className="tag bad" title={i.error}>Failed</span>
                        : <Link to={`/app/inspections/${i.result.inspection_id}`}><VerdictTag value={i.result.verdict} /></Link>}
                      {i.status === "error" ? <small className="error-text">{i.error}</small> : null}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {summary.length && !running ? (
                <div className="batch-summary">
                  {summary.map(([v, n]) => <span key={v} className="row tight"><VerdictTag value={v} /><b className="num">{n}</b></span>)}
                  {summary.find(([v]) => v === "NEEDS_REVIEW") && can.review ? <Link to="/app/review" className="btn btn-primary btn-sm spacer"><ClipboardCheck size={16} /> Review the unsure ones</Link> : null}
                </div>
              ) : null}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </section>

        <aside className="stack">
          <section className="card card-pad">
            <h2 className="panel-title">1. Choose the product</h2>
            <div className="prod-pick" role="radiogroup" aria-label="Product">
              {(products || []).map((p) => (
                <button key={p.name} role="radio" aria-checked={p.name === product} className={`prod-opt ${p.name === product ? "on" : ""}`} onClick={() => setProduct(p.name)} disabled={running}>
                  <img src={productImage(p.name, null, 120)} alt="" />
                  <span><b>{p.name}</b><small>{p.calibrated ? `calibrated, normal level ${p.normal.toFixed(1)}` : "not calibrated: scores are rough"}</small></span>
                  {p.name === product ? <Check size={18} className="ok" /> : null}
                </button>
              ))}
              {!products?.length ? <p className="muted">No products yet. An administrator can create one on the Products page.</p> : null}
            </div>
          </section>

          {prod?.samples.length ? (
            <section className="card card-pad">
              <h2 className="panel-title">Or use a real test photo</h2>
              <div className="sample-grid">
                {prod.samples.map((s) => (
                  <button key={s.id} className="sample" onClick={() => addSample(prod.name, s)} disabled={running} title={`Add ${prettyName(s.label)} to the queue`}>
                    <img src={productImage(prod.name, s.id, 200)} alt="" loading="lazy" />
                    <span>{prettyName(s.label)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card card-pad run-card">
            <h2 className="panel-title">2. Run</h2>
            <button className="btn btn-primary btn-lg btn-block" onClick={run} disabled={!queued.length || running || needsProduct}>
              {running ? <><LoaderCircle size={18} className="spin" /> Inspecting</> : <><Play size={17} /> Inspect {queued.length || ""} photo{queued.length === 1 ? "" : "s"}</>}
            </button>
            <p className="hint">Run as <b>{user.name}</b>. Your name goes on every step you start.</p>
            {needsProduct ? <p className="error-text">Choose a product first.</p> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
