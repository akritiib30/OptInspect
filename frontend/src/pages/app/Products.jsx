import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Boxes, Check, Gauge, ImagePlus, LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { EmptyState, Modal, Rings, Skeleton } from "../../components/bits";
import { api, productImage } from "../../lib/api";
import { clearCache, useApi } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { bytes, fmtDate, prettyName } from "../../lib/format";

const BUILD_STEPS = ["Reading the photos", "Building the reference from 40 of them", "Learning what normal looks like from the rest", "Saving the product"];

function NewProduct({ open, onClose, onCreated }) {
  const toast = useToast();
  const input = useRef(null);
  const [name, setName] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const total = files.reduce((a, f) => a + f.size, 0);
  const slug = name.trim().toLowerCase();
  const nameOk = /^[a-z0-9][a-z0-9_-]{1,29}$/.test(slug);
  const filesOk = files.length >= 50 && files.length <= 300;
  const reset = () => { setName(""); setFiles([]); setBusy(false); setStep(0); setError(null); setDone(null); };
  const close = () => { if (busy) return; reset(); onClose(); };
  const add = (list) => setFiles((prev) => { const seen = new Set(prev.map((f) => `${f.name}:${f.size}`)); return [...prev, ...[...list].filter((f) => f.type.startsWith("image/") && !seen.has(`${f.name}:${f.size}`))]; });

  const submit = async () => {
    setBusy(true); setError(null); setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 2600);
    try {
      const form = new FormData();
      form.append("name", slug);
      files.forEach((f) => form.append("images", f, f.name));
      const p = await api("/api/products", { method: "POST", form });
      setDone(p);
      onCreated(p);
      toast.ok("Product created", `${p.name} is ready to inspect with.`);
    } catch (e) { setError(e.message); } finally { clearInterval(timer); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title={done ? "Product ready" : "Create a product"} width={620} dismissible={!busy}
      footer={done ? <button className="btn btn-primary" onClick={close}>Done</button> : <><button className="btn btn-ghost" onClick={close} disabled={busy}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !nameOk || !filesOk}>{busy ? <><LoaderCircle size={16} className="spin" /> Building</> : "Create product"}</button></>}>
      {done ? (
        <div className="stack">
          <div className="done-art"><Check size={30} /></div>
          <p><b>{done.name}</b> is calibrated. The largest difference seen on {done.n_calibration} good photos it had not seen was <b className="num">{done.normal.toFixed(1)}</b>, so a defect has to be clearly bigger than that.</p>
          <Link to={`/app/inspect?product=${done.name}`} className="btn btn-ghost" onClick={close}>Inspect with it now <ArrowRight size={16} /></Link>
        </div>
      ) : busy ? (
        <div className="building"><Rings size={110} /><AnimatePresence mode="wait"><motion.p key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{BUILD_STEPS[step]}...</motion.p></AnimatePresence><span className="hint">This takes about 10 to 30 seconds. Keep this window open.</span></div>
      ) : (
        <>
          <label className="field"><span className="label">Product name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="for example: bracket_a" aria-invalid={!!name && !nameOk} />
            <span className="hint">2 to 30 letters, numbers, dashes or underscores. Lower case.</span></label>
          <div>
            <span className="label">Photos of good parts</span>
            <button type="button" className="dropzone compact" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
              <UploadCloud size={26} />
              <b>{files.length ? `${files.length} photos selected, ${bytes(total)}` : "Choose or drop at least 50 photos"}</b>
              <span className="hint">All of the same kind of part, taken the same way. 40 build the reference and the rest teach it what normal looks like.</span>
            </button>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && files.length < 50 ? <p className="error-text" style={{ marginTop: 8 }}>{50 - files.length} more needed.</p> : null}
            {total > 280 * 1024 * 1024 ? <p className="error-text" style={{ marginTop: 8 }}>That is more than 280 MB. Use fewer or smaller photos.</p> : null}
          </div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
        </>
      )}
    </Modal>
  );
}

export default function Products() {
  const { can } = useAuth();
  const { data: products, reload } = useApi("/api/products");
  const [open, setOpen] = useState(false);
  if (!products) return <Skeleton h={420} r={18} />;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div><h1>Products</h1><p>A product is a good reference photo plus what "normal" looks like for it. The inspector only judges a photo against the product you choose.</p></div>
        <div className="actions">{can.admin ? <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={17} /> New product</button> : null}</div>
      </header>

      {!products.length ? <div className="card"><EmptyState title="No products yet" text={can.admin ? "Create one from at least 50 photos of good parts." : "An administrator can create one from at least 50 photos of good parts."}>{can.admin ? <button className="btn btn-primary" onClick={() => setOpen(true)}>Create a product</button> : null}</EmptyState></div> : (
        <div className="product-grid">
          {products.map((p, n) => (
            <motion.article key={p.name} className="card product-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.08 }}>
              <div className="pc-top">
                <div className="pc-ring"><img src={productImage(p.name, null, 320)} alt={`Good reference photo for ${p.name}`} /></div>
                <div className="grow">
                  <h2>{p.name}</h2>
                  <div className="row tight"><span className={`tag ${p.calibrated ? "ok" : "warn"}`}>{p.calibrated ? "Calibrated" : "Not calibrated"}</span>{p.created ? <span className="chip">created {fmtDate(p.created)}</span> : null}</div>
                </div>
              </div>
              <dl className="facts">
                <dt>Normal level</dt><dd>{p.calibrated ? <b className="num">{p.normal.toFixed(1)}</b> : "-"}</dd>
                <dt>Confirmed from</dt><dd className="num">{p.calibrated ? `${(p.normal * 2).toFixed(1)}, twice the normal level` : "-"}</dd>
                <dt>Built from</dt><dd>{p.n_reference ? `${p.n_reference} photos for the reference, ${p.n_calibration} to learn normal` : "-"}</dd>
                <dt>Source</dt><dd>{p.source || "-"}</dd>
              </dl>
              <p className="hint">{p.calibrated ? "The normal level is the largest difference seen on good photos that were not used to build the reference." : "No calibration: scores use a generic noise estimate, and wrong photos are not rejected. Fine for a first look, not for judging real parts."}</p>
              {p.samples.length ? (
                <div className="samples-row">{p.samples.map((s) => (
                  <Link key={s.id} to={`/app/inspect?product=${p.name}&sample=${s.id}`} className="sample-mini" title={`Inspect ${prettyName(s.label)}`}><img src={productImage(p.name, s.id, 160)} alt="" loading="lazy" /></Link>
                ))}</div>
              ) : null}
              {can.inspect ? <Link to={`/app/inspect?product=${p.name}`} className="btn btn-ghost">Inspect with this product <ArrowRight size={16} /></Link> : null}
            </motion.article>
          ))}
        </div>
      )}
      <NewProduct open={open} onClose={() => setOpen(false)} onCreated={() => { clearCache("/api/products"); reload(); }} />
    </div>
  );
}
