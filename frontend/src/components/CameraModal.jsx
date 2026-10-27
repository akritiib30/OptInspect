import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CameraOff, LoaderCircle, SwitchCamera } from "lucide-react";
import { Modal } from "./bits";

/** Point a camera at a part and take photos straight into the Inspect queue. Nothing leaves this computer. */
export default function CameraModal({ open, onClose, onCapture, full = false }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState("starting");        // starting | live | error
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [shots, setShots] = useState([]);
  const [flash, setFlash] = useState(0);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  useEffect(() => {
    if (!open) { stop(); return undefined; }
    let alive = true;
    setState("starting");
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error"); setMessage("This browser cannot reach a camera. Use Chrome or Edge and open the app at http://127.0.0.1:5000.");
        return;
      }
      try {
        stop();
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1600 } } : { facingMode: "environment", width: { ideal: 1600 } } });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setState("live");
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
      } catch (e) {
        if (!alive) return;
        setState("error");
        setMessage(e.name === "NotAllowedError" ? "Camera access was blocked. Allow it from the address bar, then try again."
          : e.name === "NotFoundError" ? "No camera was found on this computer."
          : `The camera could not start (${e.name || "unknown error"}).`);
      }
    })();
    return () => { alive = false; stop(); };
  }, [open, deviceId, stop]);

  useEffect(() => { if (!open) setShots((s) => { s.forEach((u) => URL.revokeObjectURL(u)); return []; }); }, [open]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setFlash((k) => k + 1);
    c.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `camera-${Date.now()}.png`, { type: "image/png" }));
      setShots((s) => [...s, URL.createObjectURL(blob)].slice(-10));
    }, "image/png");
  };
  const flip = () => {
    if (devices.length < 2) return;
    const i = devices.findIndex((d) => d.deviceId === (deviceId || stream.current?.getVideoTracks()[0]?.getSettings().deviceId));
    setDeviceId(devices[(i + 1) % devices.length].deviceId);
  };

  return (
    <Modal open={open} onClose={onClose} title="Take photos with a camera" width={660}
      footer={<><span className="muted">{shots.length ? `${shots.length} added to the queue` : "Each photo goes straight into the queue."}</span><button className="btn btn-primary spacer" onClick={onClose}>Done</button></>}>
      <div className="cam">
        <div className="cam-view">
          <video ref={video} muted playsInline aria-label="Live camera view" style={{ visibility: state === "live" ? "visible" : "hidden" }} />
          {state === "live" ? <span className="cam-frame" aria-hidden="true" /> : null}
          {state === "starting" ? <div className="cam-msg"><LoaderCircle className="spin" size={26} /><span>Starting the camera...</span></div> : null}
          {state === "error" ? <div className="cam-msg"><CameraOff size={30} /><span>{message}</span></div> : null}
          <AnimatePresence>{flash ? <motion.span key={flash} className="cam-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }} /> : null}</AnimatePresence>
        </div>
        <div className="cam-bar">
          <div className="cam-shots" aria-label="Photos taken">{shots.map((u) => <img key={u} src={u} alt="" />)}</div>
          <div className="row tight">
            {devices.length > 1 ? <button className="btn btn-ghost btn-icon" onClick={flip} aria-label="Switch camera"><SwitchCamera size={18} /></button> : null}
            <button className="cam-shutter" onClick={snap} disabled={state !== "live" || full} aria-label="Take a photo"><Camera size={26} /></button>
          </div>
        </div>
        <p className="hint">{full ? "The queue is full (40 photos). Inspect them, then take more." : "Keep the part inside the dashed frame and light it the same way each time. Photos are shrunk to the product's size before inspection."}</p>
      </div>
    </Modal>
  );
}
