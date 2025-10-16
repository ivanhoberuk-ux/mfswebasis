// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from "react";

export default function QrScanner({ onDecode, onClose }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const lastDecodeAtRef = useRef(0);
  const [err, setErr] = useState("");
  const [supported, setSupported] = useState(false);
  const [manual, setManual] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    setSupported(typeof window.BarcodeDetector !== "undefined");
  }, []);

  const listCameras = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((d) => d.kind === "videoinput");
      setDevices(vids);
      if (!deviceId) {
        const backCam =
          vids.find((d) => /back|trás|rear|environment/i.test(d.label)) ||
          vids[0] ||
          null;
        setDeviceId(backCam?.deviceId || null);
      }
    } catch {}
  }, [deviceId]);

  const start = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setErr("");
    try {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsInline", "true");
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      await listCameras();

      if (supported) {
        const bd = new window.BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          try {
            if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
              const now = performance.now();
              if (now - lastDecodeAtRef.current > 160) {
                lastDecodeAtRef.current = now;
                const bitmap = await createImageBitmap(videoRef.current);
                const codes = await bd.detect(bitmap);
                if (codes && codes.length) {
                  const text = codes[0].rawValue || "";
                  cleanup();
                  onDecode(text);
                  return;
                }
              }
            }
          } catch {}
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch (e) {
      setErr(e?.message || "No se pudo iniciar la cámara");
    } finally {
      setIsStarting(false);
    }
  }, [deviceId, listCameras, onDecode, supported, isStarting]);

  const cleanup = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (videoRef.current) { try { videoRef.current.pause(); } catch {} videoRef.current.srcObject = null; }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
    }
  }, []);

  const switchDevice = useCallback(async (id) => {
    setDeviceId(id);
    cleanup();
    await start();
  }, [cleanup, start]);

  useEffect(() => { start(); return () => cleanup(); }, [deviceId]);

  const handleClose = () => { cleanup(); onClose(); };
  const handleManual = () => {
    const v = (manual || "").trim();
    if (!v) return;
    cleanup();
    onDecode(v);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-4 w-[95%] max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Escanear QR</h3>
          <button onClick={handleClose} className="px-3 py-1 rounded-lg bg-slate-200">Cerrar</button>
        </div>

        {devices.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Cámara</label>
            <select className="border rounded-lg px-3 py-2 bg-white flex-1" value={deviceId || ""} onChange={(e) => switchDevice(e.target.value)}>
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Cámara ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" />
        </div>

        {isStarting && <div className="text-xs text-slate-500">Iniciando cámara…</div>}
        {err && <div className="text-rose-700 text-sm">{err}</div>}
        {!supported && <div className="text-sm text-slate-600">Tu navegador no soporta <code>BarcodeDetector</code>. Usá el ingreso manual.</div>}

        <div className="flex gap-2 items-center">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder='Pegar UUID, "MIS:<uuid>" o JSON {"mid":"uuid"}' className="flex-1 border rounded-lg px-3 py-2" />
          <button onClick={handleManual} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">Marcar</button>
        </div>

        <div className="text-xs text-slate-500">
          Consejos: concedé permisos de cámara, probá con otra cámara si está desenfocada y asegurate de estar en <b>https</b> (o <b>localhost</b>).
        </div>
      </div>
    </div>
  );
}
