// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";

/**
 * Admin de Puntajes – por pueblo
 * - Configurar puntajes por tipo de reunión (RPC: set_puntajes_por_pueblo)
 * - Ver ranking persistido (vista: v_ranking_pueblo) con corte por cupo
 * - Exportar ranking a CSV (respeta cupo)
 * - Generar QR por misionero
 * - **Escanear QR y marcar asistencia** a una reunión seleccionada (RPC: toggle_asistencia)
 * - **Marcador en sesión**: contador, últimas 5 marcadas, flash y beep
 */

// ========= Helpers de Supabase =========
function readEnv(key: string): string | undefined {
  const m = (import.meta as any)?.env || {};
  const win = (window as any) || {};
  return m?.[key] || m?.["VITE_" + key] || win?.[key] || undefined;
}
function getInitialSupabaseConfig() {
  const urlFromEnv =
    readEnv("VITE_SUPABASE_URL") ||
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    (window as any)?.SUPABASE_URL ||
    localStorage.getItem("sb_url") ||
    "";
  const keyFromEnv =
    readEnv("VITE_SUPABASE_ANON_KEY") ||
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    (window as any)?.SUPABASE_ANON_KEY ||
    localStorage.getItem("sb_key") ||
    "";
  const DEFAULT_SB_URL = "https://npekpdkywsneylddzzuu.supabase.co";
  const DEFAULT_SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWtwZGt5d3NuZXlsZGR6enV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDYxNDEsImV4cCI6MjA3MTk4MjE0MX0.RNuHThLkvwMzq6WMUna7P6WFUovG2CwT18LNJwtwNoI";
  return {
    url: urlFromEnv || DEFAULT_SB_URL,
    key: keyFromEnv || DEFAULT_SB_KEY,
  };
}
function isValidUrl(s: string) {
  try { const u = new URL(s); return u.protocol.startsWith("http"); } catch { return false; }
}

// ========= Tipos =========
type Pueblo = { id: string; nombre: string; cupo_max: number | null };
type RankingRow = {
  id_misionero: string;
  misionero_nombre: string;
  pueblo_id: string;
  pueblo_nombre: string;
  total_puntos: number;
  reuniones_asistidas: number;
  ultima_asistencia: string | null;
  pos: number;
};

type ReunionLite = { id: string; fecha: string; tipo_reunion: "general"|"comision"|"varias"; cerrada?: boolean|null };

export default function AdminRanking(): JSX.Element {
  // Supabase
  const [{ url, key }] = useState(getInitialSupabaseConfig());
  const supabase: SupabaseClient | null = useMemo(() => {
    if (!url || !key || !isValidUrl(url)) return null;
    try { return createClient(url, key); } catch { return null; }
  }, [url, key]);

  // Estado principal
  const [pueblos, setPueblos] = useState<Pueblo[]>([]);
  const [puebloId, setPuebloId] = useState<string>("");
  const [puntajes, setPuntajes] = useState({ general: "5", comision: "3", varias: "2" });
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [applyCupo, setApplyCupo] = useState(true);
  const [toast, setToast] = useState("");

  // Marcador en sesión
  const [markCount, setMarkCount] = useState<number>(0);
  const [recentMarks, setRecentMarks] = useState<{id:string; name:string; time:string}[]>([]);
  const [flash, setFlash] = useState<boolean>(false);

  // Reunión seleccionada para marcar asistencia vía QR
  const [reunionesAbiertas, setReunionesAbiertas] = useState<ReunionLite[]>([]);
  const [reunionSelId, setReunionSelId] = useState<string>("");
  const [qrOpen, setQrOpen] = useState<boolean>(false);

  // QR individual por misionero
  const [showQR, setShowQR] = useState<{id:string; nombre:string}|null>(null);

  const currentPueblo = useMemo(() => pueblos.find(p => p.id === puebloId) || null, [pueblos, puebloId]);
  const shownRanking = useMemo(() => {
    if (!applyCupo || !currentPueblo?.cupo_max) return ranking;
    return ranking.slice(0, Math.max(0, currentPueblo.cupo_max));
  }, [ranking, applyCupo, currentPueblo]);

  // Cargar pueblos
  useEffect(() => { (async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("pueblos").select("id,nombre,cupo_max").order("nombre");
    if (error) { setToast("Error pueblos: " + error.message); return; }
    setPueblos(data as Pueblo[]);
    if (data && data.length) setPuebloId((data[0] as any).id);
  })(); }, [supabase]);

  // Cargar ranking (persistido)
  useEffect(() => { (async () => {
    if (!supabase || !puebloId) return;
    const { data, error } = await supabase
      .from("v_ranking_pueblo")
      .select("id_misionero,misionero_nombre,pueblo_id,pueblo_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,pos")
      .eq("pueblo_id", puebloId)
      .order("pos")
      .limit(1000);
    if (error) { setToast("Error ranking: " + error.message); return; }
    setRanking((data || []) as RankingRow[]);
  })(); }, [supabase, puebloId]);

  // Cargar reuniones abiertas del pueblo (para marcar asistencia)
  useEffect(() => { (async () => {
    if (!supabase || !puebloId) return;
    const { data, error } = await supabase
      .from('reuniones')
      .select('id,fecha,tipo_reunion,cerrada')
      .eq('pueblo_id', puebloId)
      .eq('cerrada', false)
      .order('fecha', { ascending: false })
      .limit(200);
    if (error) { setToast('Error cargando reuniones: '+error.message); return; }
    setReunionesAbiertas((data||[]) as ReunionLite[]);
    if (data && (data as any[]).length) setReunionSelId((data as any[])[0].id);
    else setReunionSelId("");
  })(); }, [supabase, puebloId]);

  // Guardar puntajes por tipo
  const savePuntajes = async () => {
    if (!supabase || !puebloId) return;
    const g = Number(puntajes.general || 0), c = Number(puntajes.comision || 0), v = Number(puntajes.varias || 0);
    if (g <= 0 || c <= 0 || v <= 0) { setToast("Los puntajes deben ser > 0"); return; }
    const { data, error } = await supabase.rpc("set_puntajes_por_pueblo", {
      p_pueblo_id: puebloId,
      p_general: g,
      p_comision: c,
      p_varias: v,
    });
    if (error) { setToast("Error guardando: " + error.message); return; }
    setToast((data && (data as any)[0]?.msg) || "OK");
  };

  // Export CSV del ranking
  const exportCSV = async () => {
    if (!supabase || !puebloId) return;
    try {
      const { data: p } = await supabase.from("pueblos").select("id,cupo_max,nombre").eq("id", puebloId).single();
      const cupo: number | null = (p as any)?.cupo_max ?? null;
      const { data: rows, error } = await supabase
        .from("v_ranking_pueblo")
        .select("pos,misionero_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,id_misionero")
        .eq("pueblo_id", puebloId)
        .order("pos")
        .limit(1000);
      if (error) throw error;
      let list = rows || [];
      if (applyCupo && cupo) list = list.slice(0, Math.max(0, cupo));
      const header = ["pos", "misionero_nombre", "total_puntos", "reuniones_asistidas", "ultima_asistencia", "id_misionero"];
      const csv = [
        header.join(","),
        ...list.map((r: any) => [r.pos, '"' + String(r.misionero_nombre).replaceAll('"', '""') + '"', r.total_puntos, r.reuniones_asistidas, r.ultima_asistencia ?? '', r.id_misionero].join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ranking_${(p as any)?.nombre || "pueblo"}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { setToast("Error exportando CSV: " + (e.message || e)); }
  };

  // Marcar asistencia usando QR escaneado
  const markAttendanceByQR = async (payload: string) => {
    if (!supabase) { setToast('Cliente no inicializado'); return; }
    if (!reunionSelId) { setToast('Seleccioná una reunión'); return; }
    try {
      // Acepta UUID directo o JSON {mid: "uuid"}
      const obj = (()=>{ try { return JSON.parse(payload); } catch { return null; } })();
      const mid = (obj && obj.mid) ? obj.mid : payload;
      if (typeof mid !== 'string') throw new Error('QR inválido');
      const { error } = await supabase.rpc('toggle_asistencia', { p_reunion_id: reunionSelId, p_misionero_id: mid });
      if (error) throw error;

      // Buscar nombre del misionero
      let name = ranking.find(r=>r.id_misionero===mid)?.misionero_nombre || '';
      if (!name) {
        const { data: m } = await supabase.from('misioneros').select('nombre').eq('id', mid).single();
        name = (m as any)?.nombre || mid.substring(0,8);
      }

      // Feedback visual y sonoro
      setFlash(true); setTimeout(()=>setFlash(false), 180);
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type='sine'; o.frequency.value=880; // beep corto
          o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18);
          o.start(); o.stop(ctx.currentTime+0.2);
        }
      } catch {}

      setMarkCount(c=>c+1);
      setRecentMarks(prev => [...prev.slice(-4), { id: mid, name, time: new Date().toLocaleTimeString() }]);
      setToast(`Asistencia marcada: ${name}`);

      // refrescar ranking por si cambió el orden
      const { data } = await supabase
        .from("v_ranking_pueblo")
        .select("id_misionero,misionero_nombre,pueblo_id,pueblo_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,pos")
        .eq("pueblo_id", puebloId)
        .order("pos")
        .limit(1000);
      setRanking((data || []) as RankingRow[]);
    } catch (e:any) {
      setToast('Error QR: '+(e.message||e));
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Admin de Puntajes</h1>
            <p className="text-sm text-slate-600">Configurar puntajes, ranking y asistencia por QR.</p>
          </div>
          <nav className="flex gap-2 text-sm">
            <a href="/admin/puntajes" className="px-3 py-2 rounded-lg bg-slate-800 text-white">Admin puntajes</a>
            <a href="/reuniones" className="px-3 py-2 rounded-lg bg-slate-200">Reuniones</a>
          </nav>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-slate-700">Pueblo</label>
            <select className="border rounded-lg px-3 py-2 bg-white" value={puebloId} onChange={e => setPuebloId(e.target.value)}>
              {pueblos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </header>

        {toast && <div className="rounded-xl border bg-amber-50 text-amber-900 px-4 py-2">{toast}</div>}

        {/* Configuración de puntajes */}
        <div className="rounded-2xl shadow p-4 md:p-6 bg-white/80 border border-gray-100">
          <h2 className="font-semibold mb-3">Configurar puntajes por tipo</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-sm">General</label>
              <input type="number" min={0.1} step={0.1} className="w-full border rounded-lg px-3 py-2" value={puntajes.general} onChange={e => setPuntajes(s => ({ ...s, general: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm">Comisión</label>
              <input type="number" min={0.1} step={0.1} className="w-full border rounded-lg px-3 py-2" value={puntajes.comision} onChange={e => setPuntajes(s => ({ ...s, comision: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm">Varias</label>
              <input type="number" min={0.1} step={0.1} className="w-full border rounded-lg px-3 py-2" value={puntajes.varias} onChange={e => setPuntajes(s => ({ ...s, varias: e.target.value }))} />
            </div>
            <div className="md:col-span-2 text-right">
              <button onClick={savePuntajes} className="px-4 py-2 rounded-xl shadow bg-emerald-600 text-white">Guardar</button>
            </div>
          </div>
        </div>

        {/* Ranking + Acciones */}
        <div className="rounded-2xl shadow p-4 md:p-6 bg-white/80 border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
            <h2 className="font-semibold">Ranking actual (persistido)</h2>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={applyCupo} onChange={e => setApplyCupo(e.target.checked)} />
                  Aplicar corte {currentPueblo?.cupo_max ? `(cupo: ${currentPueblo.cupo_max})` : '(sin cupo)'}
                </label>
                <button onClick={exportCSV} className="px-3 py-2 rounded-lg bg-emerald-600 text-white">Exportar CSV</button>
              </div>
              {/* Selección de reunión para QR */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-700">Reunión</label>
                <select className="border rounded-lg px-3 py-2 bg-white" value={reunionSelId} onChange={e=>setReunionSelId(e.target.value)}>
                  {reunionesAbiertas.map(r => (
                    <option key={r.id} value={r.id}>{r.fecha} · {r.tipo_reunion.toUpperCase()}</option>
                  ))}
                </select>
                <button disabled={!reunionSelId} onClick={()=>setQrOpen(true)} className="px-3 py-2 rounded-lg bg-indigo-700 text-white disabled:opacity-50">Escanear QR</button>
              </div>
              {/* Marcador en sesión */}
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">Marcadas: {markCount}</span>
              </div>
            </div>
          </div>

          {/* Últimas marcadas */}
          {recentMarks.length>0 && (
            <div className="mb-3 text-sm text-slate-600">
              <span className="font-medium">Últimas:</span>
              <ul className="list-disc ml-5">
                {recentMarks.map((m,i)=> (<li key={i}>{m.time} · {m.name}</li>))}
              </ul>
            </div>
          )}

          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Misionero</th>
                  <th className="py-2 pr-2">Puntos</th>
                  <th className="py-2 pr-2">QR</th>
                </tr>
              </thead>
              <tbody>
                {shownRanking.map(r => (
                  <tr key={r.id_misionero} className="border-b last:border-0">
                    <td className="py-2 pr-2">{r.pos}</td>
                    <td className="py-2 pr-2">{r.misionero_nombre}</td>
                    <td className="py-2 pr-2">{r.total_puntos}</td>
                    <td className="py-2 pr-2">
                      <button onClick={() => setShowQR({ id: r.id_misionero, nombre: r.misionero_nombre })} className="text-sm px-2 py-1 rounded bg-slate-200">QR</button>
                    </td>
                  </tr>
                ))}
                {shownRanking.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">Sin datos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: QR individual */}
        {showQR && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-[95%] max-w-sm space-y-3">
              <h3 className="font-semibold">QR de {showQR.nombre}</h3>
              <div className="flex justify-center"><QRCode value={JSON.stringify({ mid: showQR.id })} size={180} /></div>
              <div className="text-xs text-slate-600 break-all">{showQR.id}</div>
              <div className="text-right"><button onClick={() => setShowQR(null)} className="px-3 py-2 rounded-lg bg-slate-200">Cerrar</button></div>
            </div>
          </div>
        )}

        {/* Modal: Escáner QR */}
        {qrOpen && (
          <QrScannerModal onClose={()=>setQrOpen(false)} onRead={async (payload)=>{ await markAttendanceByQR(payload); setQrOpen(false); }} />
        )}

        {/* Overlay de flash */}
        {flash && (<div className="fixed inset-0 pointer-events-none bg-emerald-300/40" />)}

      </div>
    </div>
  );
}

// ============ QR Scanner Modal (BarcodeDetector nativo si disponible) ============
function QrScannerModal({ onClose, onRead }: { onClose: ()=>void, onRead: (payload:string)=>void }) {
  const videoRef = useRef<HTMLVideoElement|null>(null);
  const loopRef = useRef<number|undefined>(undefined);
  const [supported, setSupported] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [manual, setManual] = useState<string>("");

  useEffect(()=>{
    const hasBD = (window as any).BarcodeDetector !== undefined;
    setSupported(hasBD);
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { (videoRef.current as any).srcObject = stream; await (videoRef.current as any).play(); }
        if (hasBD) {
          const bd = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (videoRef.current) {
              try {
                const bitmap = await createImageBitmap((videoRef.current as any));
                const codes = await bd.detect(bitmap as any);
                if (codes && codes.length) {
                  onRead(codes[0].rawValue || "");
                }
              } catch {}
            }
            loopRef.current = requestAnimationFrame(tick);
          };
          loopRef.current = requestAnimationFrame(tick);
        }
      } catch (e:any) { setErr(e.message || 'No se pudo abrir la cámara'); }
    };
    start();

    return ()=>{
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (videoRef.current && (videoRef.current as any).srcObject) {
        ((videoRef.current as any).srcObject as MediaStream).getTracks().forEach(t=>t.stop());
        (videoRef.current as any).srcObject = null;
      }
    };
  }, [onRead]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-4 w-[95%] max-w-md space-y-3">
        <h3 className="font-semibold">Escanear QR</h3>
        <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" />
        </div>
        {err && <div className="text-rose-700 text-sm">{err}</div>}
        {!supported && <div className="text-sm text-slate-600">Tu navegador no soporta BarcodeDetector. Usá el ingreso manual.</div>}
        <div className="flex gap-2 items-center">
          <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Pegar UUID del misionero o JSON {mid}" className="flex-1 border rounded-lg px-3 py-2" />
          <button onClick={()=>{ if (manual) { onRead(manual); onClose(); } }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">Marcar</button>
        </div>
        <div className="text-right">
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-slate-200">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
