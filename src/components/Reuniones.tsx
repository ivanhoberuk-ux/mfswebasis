// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";
import QrScanner from "./QrScanner";

/**
 * Admin de Puntajes – por pueblo
 * - Configurar puntajes por tipo de reunión (RPC: set_puntajes_por_pueblo)
 * - Ver ranking persistido (vista: v_ranking_pueblo) con corte por cupo
 * - Exportar ranking a CSV (respeta cupo)
 * - Generar QR por misionero
 * - Escanear QR y marcar asistencia (idempotente) con RPC o fallback directo
 * - Marcador en sesión: contador, últimas 5 marcadas, flash y beep
 * - Buscador por nombre (RPC: search_misioneros_por_pueblo)
 * - Gestión de reuniones: crear, editar, cerrar/abrir y borrar
 */

// ===== Config de esquema para fallback directo =====
// Cambiá estos nombres si tu tabla usa otros campos:
const ASI_TABLE = "asistencias_std";           // nombre de la tabla
const ASI_REUNION_COL = "reunion_id";      // ✅ en tu base real
const ASI_MISIONERO_COL = "misionero_id";  // ✅ en tu base real

// ========= Helpers de Supabase =========
function readEnv(key) {
  const m = import.meta?.env || {};
  const win = window || {};
  return m?.[key] || m?.["VITE_" + key] || win?.[key] || undefined;
}
function getInitialSupabaseConfig() {
  const urlFromEnv =
    readEnv("VITE_SUPABASE_URL") ||
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    (window).SUPABASE_URL ||
    localStorage.getItem("sb_url") ||
    "";
  const keyFromEnv =
    readEnv("VITE_SUPABASE_ANON_KEY") ||
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    (window).SUPABASE_ANON_KEY ||
    localStorage.getItem("sb_key") ||
    "";
  const DEFAULT_SB_URL = "https://npekpdkywsneylddzzuu.supabase.co";
  const DEFAULT_SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWtwZGt5d3NuZXlsZGR6enV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDYxNDEsImV4cCI6MjA3MTk4MjE0MX0.RNuHThLkvwMzq6WMUna7P6WFUovG2CwT18LNJwtwNoI";
  return { url: urlFromEnv || DEFAULT_SB_URL, key: keyFromEnv || DEFAULT_SB_KEY };
}
function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol.startsWith("http"); } catch { return false; }
}

export default function AdminRanking() {
  // Supabase
  const [{ url, key }] = useState(getInitialSupabaseConfig());
  const supabase = useMemo(() => {
    if (!url || !key || !isValidUrl(url)) return null;
    try { return createClient(url, key); } catch { return null; }
  }, [url, key]);

  // Estado principal
  const [pueblos, setPueblos] = useState([]);
  const [puebloId, setPuebloId] = useState("");             // pueblo actual
  const [puntajes, setPuntajes] = useState({ general: "5", comision: "3", varias: "2" });
  const [ranking, setRanking] = useState([]);
  const [applyCupo, setApplyCupo] = useState(true);
  const [toast, setToast] = useState("");                   // mensajes

  // Marcador en sesión
  const [markCount, setMarkCount] = useState(0);
  const [recentMarks, setRecentMarks] = useState([]);
  const [flash, setFlash] = useState(false);

  // Reuniones (selector + gestión)
  const [reunionesAbiertas, setReunionesAbiertas] = useState([]);   // solo abiertas
  const [reunionesLista, setReunionesLista] = useState([]);         // todas
  const [reunionSelId, setReunionSelId] = useState("");             // reunión actual para marcar asistencia
  const [qrOpen, setQrOpen] = useState(false);

  // Modal Nueva/Editar reunión
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = crear
  const [formFecha, setFormFecha] = useState("");   // YYYY-MM-DD
  const [formTipo, setFormTipo] = useState("general");
  const [savingReunion, setSavingReunion] = useState(false);

  // QR individual por misionero
  const [showQR, setShowQR] = useState(null);

  // Buscador por misionero
  const [queryMis, setQueryMis] = useState("");             // texto de búsqueda
  const [sugeridos, setSugeridos] = useState([]);           // resultados
  const [searchingMis, setSearchingMis] = useState(false);  // feedback "buscando..."
  const debounceRef = useRef(null);

  const currentPueblo = useMemo(
    () => pueblos.find(p => p.id === puebloId) || null,
    [pueblos, puebloId]
  );
  const shownRanking = useMemo(() => {
    if (!applyCupo || !currentPueblo?.cupo_max) return ranking;
    return ranking.slice(0, Math.max(0, currentPueblo.cupo_max));
  }, [ranking, applyCupo, currentPueblo]);

  // ========== Cargar pueblos
  useEffect(() => { (async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("pueblos")
      .select("id,nombre,cupo_max")
      .order("nombre");
    if (error) { setToast("Error pueblos: " + error.message); return; }
    setPueblos(data || []);
    if (data && data.length) setPuebloId(data[0].id);
  })(); }, [supabase]);

  // ========== Cargar ranking (persistido)
  const loadRanking = async (pid) => {
    if (!supabase || !pid) return;
    const { data, error } = await supabase
      .from("v_ranking_pueblo")
      .select("id_misionero,misionero_nombre,pueblo_id,pueblo_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,pos")
      .eq("pueblo_id", pid)
      .order("pos")
      .limit(1000);
    if (error) { setToast("Error ranking: " + error.message); return; }
    setRanking(data || []);
  };
  useEffect(() => { loadRanking(puebloId); }, [supabase, puebloId]);

  // ========== Cargar reuniones (abiertas y todas)
  const loadReunionesAbiertas = async (pid) => {
    if (!supabase || !pid) return;
    const { data, error } = await supabase
      .from('reuniones')
      .select('id,fecha,tipo_reunion,cerrada')
      .eq('pueblo_id', pid)
      .eq('cerrada', false)
      .order('fecha', { ascending: false })
      .limit(200);
    if (error) { setToast('Error cargando reuniones: '+error.message); return; }
    setReunionesAbiertas(data || []);
    if (!data?.some(r => r.id === reunionSelId)) {
      setReunionSelId(data?.[0]?.id || "");
    }
  };
  const loadReunionesTodas = async (pid) => {
    if (!supabase || !pid) return;
    const { data, error } = await supabase
      .from('reuniones')
      .select('id,fecha,tipo_reunion,cerrada')
      .eq('pueblo_id', pid)
      .order('fecha', { ascending: false })
      .limit(200);
    if (error) { setToast('Error cargando listado: '+error.message); return; }
    setReunionesLista(data || []);
  };
  useEffect(() => { loadReunionesAbiertas(puebloId); loadReunionesTodas(puebloId); }, [supabase, puebloId]);

  // ========== Guardar puntajes por tipo
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
    setToast((data && data[0]?.msg) || "OK");
  };

  // ========== Exportar CSV del ranking
  const exportCSV = async () => {
    if (!supabase || !puebloId) return;
    try {
      const { data: p } = await supabase.from("pueblos").select("id,cupo_max,nombre").eq("id", puebloId).single();
      const cupo = p?.cupo_max ?? null;
      const { data: rows, error } = await supabase
        .from("v_ranking_pueblo")
        .select("pos,misionero_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,id_misionero")
        .eq("pueblo_id", puebloId)
        .order("pos")
        .limit(1000);
      if (error) throw error;
      let list = rows || [];
      if (applyCupo && cupo) list = list.slice(0, Math.max(0, cupo));
      const header = ["pos","misionero_nombre","total_puntos","reuniones_asistidas","ultima_asistencia","id_misionero"];
      const csv = [
        header.join(","),
        ...list.map((r) => [
          r.pos,
          '"' + String(r.misionero_nombre).replaceAll('"', '""') + '"',
          r.total_puntos,
          r.reuniones_asistidas,
          r.ultima_asistencia ?? '',
          r.id_misionero
        ].join(",")),
      ].join("");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ranking_${p?.nombre || "pueblo"}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setToast("Error exportando CSV: " + (e.message || e)); }
  };

  // ========== Feedback: flash + beep
  const doFlashBeep = () => {
    setFlash(true); setTimeout(()=>setFlash(false), 180);
    try {
      const AC = window.AudioContext || (window).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type='sine'; o.frequency.value=880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18);
        o.start(); o.stop(ctx.currentTime+0.2);
      }
    } catch {}
  };

  // ========== Refrescar ranking
  const refreshRanking = async () => { await loadRanking(puebloId); };

  // ===== Helpers de fallback / util
  // Decide si caemos al fallback cuando falla el RPC
const shouldFallbackRPC = (e, fnName) => {
  const code = String(e?.code || "");
  const msg = String(e?.message || "").toLowerCase();
  // 42883 = undefined_function, 42703 = undefined_column
  if (code.includes("42883") || code.includes("42703")) return true;
  if (msg.includes("column \"reunion_id\" does not exist")) return true;
  if (msg.includes(`function ${fnName}`)) return true; // texto genérico de PG
  return false;
};

  const getNombreMisionero = async (mid) => {
    let name = ranking.find(r => r.id_misionero === mid)?.misionero_nombre || "";
    if (!name) {
      const { data: m } = await supabase.from("misioneros").select("nombre").eq("id", mid).single();
      name = m?.nombre || mid.substring(0, 8);
    }
    return name;
  };

  // ========== Marcar asistencia (idempotente) con RPC o fallback
  const markAttendance = async (mid) => {
    if (!supabase) { setToast("Cliente no inicializado"); return; }
    if (!reunionSelId) { setToast("Seleccioná una reunión"); return; }

    try {
      const { data, error } = await supabase.rpc("marcar_asistencia", {
        p_reunion_id: reunionSelId,
        p_misionero_id: mid,
      });

      let inserted = false;

      if (!error) {
        inserted = data === true;
      } else if (shouldFallbackRPC(error, "marcar_asistencia")) {
        // Fallback sin RPC (select + insert idempotente) sobre la VISTA estandarizada
        const { data: existsRows, error: selErr } = await supabase
          .from(ASI_TABLE)
          .select(ASI_MISIONERO_COL)
          .eq(ASI_REUNION_COL, reunionSelId)
          .eq(ASI_MISIONERO_COL, mid)
          .limit(1);
        if (selErr) throw selErr;

        if (existsRows && existsRows.length > 0) {
          inserted = false;
        } else {
          const { error: insErr } = await supabase
            .from(ASI_TABLE)
            .insert({ [ASI_REUNION_COL]: reunionSelId, [ASI_MISIONERO_COL]: mid });
          if (insErr) throw insErr;
          inserted = true;
        }
      } else {
        // Error real del RPC
        throw error;
      }

      if (inserted) {
        doFlashBeep();
        const name = await getNombreMisionero(mid);
        setMarkCount(c => c + 1);
        setRecentMarks(prev => [...prev.slice(-4), { id: mid, name, time: new Date().toLocaleTimeString() }]);
        setToast(`Asistencia marcada: ${name}`);
        await refreshRanking();
      } else {
        setToast("Este misionero ya tiene asistencia marcada en esta reunión.");
      }
    } catch (e) {
      console.error("markAttendance error:", e);
      setToast("Error al marcar asistencia: " + (e.message || e));
    }
  };

  // ========== Desmarcar asistencia con RPC o fallback
  const unmarkAttendance = async (mid) => {
    if (!supabase) { setToast("Cliente no inicializado"); return; }
    if (!reunionSelId) { setToast("Seleccioná una reunión"); return; }

    try {
      const { data, error } = await supabase.rpc("desmarcar_asistencia", {
        p_reunion_id: reunionSelId,
        p_misionero_id: mid,
      });

      let removed = false;

      if (!error) {
        removed = data === true;
      } else if (shouldFallbackRPC(error, "desmarcar_asistencia")) {
        // Fallback directo (delete) sobre la VISTA estandarizada
        const { data: delRows, error: delErr } = await supabase
          .from(ASI_TABLE)
          .delete()
          .eq(ASI_REUNION_COL, reunionSelId)
          .eq(ASI_MISIONERO_COL, mid)
          .select(ASI_MISIONERO_COL);
        if (delErr) throw delErr;
        removed = !!(delRows && delRows.length > 0);
      } else {
        throw error;
      }

      if (removed) {
        setToast("Asistencia desmarcada.");
        await refreshRanking();
      } else {
        setToast("Este misionero no tenía asistencia en esta reunión.");
      }
    } catch (e) {
      console.error("unmarkAttendance error:", e);
      setToast("Error al desmarcar: " + (e.message || e));
    }
  };

  // ========== Handler pasado al componente QrScanner
  const onDecodedQR = async (decodedText) => {
    try {
      let mid = (decodedText || "").trim();
      const obj = (()=>{ try { return JSON.parse(mid); } catch { return null; } })();
      if (obj && obj.mid) mid = String(obj.mid);
      if (mid.startsWith("MIS:")) mid = mid.slice(4).trim();
      if (!/^[0-9a-fA-F-]{36}$/.test(mid)) throw new Error('QR inválido');
      await markAttendance(mid);
    } catch (e) {
      setToast('Error QR: '+(e.message||e));
    } finally {
      setQrOpen(false);
    }
  };

  // ========== Buscador (SOLO via RPC)
  useEffect(() => {
    if (!supabase || !puebloId) return;
    if (!queryMis?.trim()) { setSugeridos([]); return; }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearchingMis(true);
      try {
        const { data, error } = await supabase.rpc("search_misioneros_por_pueblo", {
          p_pueblo_id: puebloId || null,
          p_q: queryMis,
          p_limit: 20,
        });
        if (error) throw error;
        const rows = (data || [])
          .map((r)=>({ id: r.id, nombre: r.nombre }))
          .filter(x=>x.id && x.nombre);
        setSugeridos(rows);
        if (!rows.length) setToast("Sin resultados para esa búsqueda.");
      } catch (e) {
        setToast("Error buscando: " + (e.message || e));
        setSugeridos([]);
      } finally {
        setSearchingMis(false);
      }
    }, 250);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [supabase, puebloId, queryMis]);

  // ========== Marcar / Desmarcar por click en sugerido
  const marcarSugerido = async (id) => { await markAttendance(id); };
  const desmarcarSugerido = async (id) => { await unmarkAttendance(id); };

  // ====== Derivados UI
  const isSelectedOpen = useMemo(() => reunionesAbiertas.some(r => r.id === reunionSelId), [reunionesAbiertas, reunionSelId]);

  // ===================== UI =====================
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Admin de Puntajes</h1>
            <p className="text-sm text-slate-600">Configurar puntajes, ranking, reuniones y asistencia por QR.</p>
          </div>
          <nav className="flex gap-2 text-sm">
            <button
              onClick={() => (window.location.href = "/admin/puntajes")}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white"
            >
              Admin puntajes
            </button>
            <button
              onClick={()=>{ setEditingId(null); setFormFecha(""); setFormTipo("general"); setEditOpen(true); }}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
            >
              Nueva reunión
            </button>
          </nav>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-slate-700">Pueblo</label>
            <select className="border rounded-lg px-3 py-2 bg-white" value={puebloId} onChange={e => setPuebloId(e.target.value)}>
              {pueblos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </header>

        {toast && <div className="rounded-xl border bg-amber-50 text-amber-900 px-4 py-2 transition-opacity">{toast}</div>}

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
                    <option key={r.id} value={r.id}>{r.fecha} · {String(r.tipo_reunion).toUpperCase()}</option>
                  ))}
                </select>
                {reunionSelId && (
                  isSelectedOpen ? (
                    <span className="text-emerald-600 text-xs">(Abierta)</span>
                  ) : (
                    <span className="text-rose-600 text-xs">(Cerrada)</span>
                  )
                )}
                <button
                  disabled={!reunionSelId || !isSelectedOpen}
                  onClick={()=>setQrOpen(true)}
                  className="px-3 py-2 rounded-lg bg-indigo-700 text-white disabled:opacity-50"
                >
                  Escanear QR
                </button>
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
                  <th className="py-2 pr-2">Desmarcar</th>
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
                    <td className="py-2 pr-2">
                      <button
                        disabled={!reunionSelId}
                        onClick={()=>unmarkAttendance(r.id_misionero)}
                        className="text-sm px-2 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                {shownRanking.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">Sin datos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== Buscador de misionero para marcar asistencia ===== */}
        <div className="rounded-2xl shadow p-4 md:p-6 bg-white/80 border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
            <h2 className="font-semibold">Buscar misionero</h2>
            <div className="flex items-center gap-2">
              <input
                value={queryMis}
                onChange={(e)=>setQueryMis(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === "Enter" && sugeridos[0]) marcarSugerido(sugeridos[0].id); }}
                placeholder="Escribí el nombre…"
                className="border rounded-lg px-3 py-2 w-72"
              />
              <button
                disabled={!reunionSelId || !sugeridos[0]}
                onClick={()=> sugeridos[0] && marcarSugerido(sugeridos[0].id)}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
              >
                Marcar primero (Enter)
              </button>
            </div>
          </div>

          <div className="min-h-[44px] text-sm">
            {searchingMis ? (
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span>Buscando…</span>
              </div>
            ) : null}
          </div>

          <div className="max-h-64 overflow-auto">
            {(!searchingMis && sugeridos.length === 0) ? (
              <div className="text-sm text-slate-500">Sin resultados.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">Misionero</th>
                    <th className="py-2 pr-2 w-64">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sugeridos.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">{m.nombre}</td>
                      <td className="py-2 pr-2">
                        <div className="flex gap-2">
                          <button
                            disabled={!reunionSelId}
                            onClick={()=>marcarSugerido(m.id)}
                            className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
                          >
                            Marcar
                          </button>
                          <button
                            disabled={!reunionSelId}
                            onClick={()=>desmarcarSugerido(m.id)}
                            className="px-3 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
                          >
                            Desmarcar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ===== Administración de reuniones ===== */}
        <div className="rounded-2xl shadow p-4 md:p-6 bg-white/80 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Administrar reuniones</h2>
            <button onClick={()=>{ setEditingId(null); setFormFecha(""); setFormTipo("general"); setEditOpen(true); }} className="px-3 py-2 rounded-lg bg-emerald-600 text-white">Nueva reunión</button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2">Tipo</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2 w-56">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reunionesLista.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{String(r.fecha).slice(0,10)}</td>
                    <td className="py-2 pr-2 capitalize">{String(r.tipo_reunion)}</td>
                    <td className="py-2 pr-2">
                      <span className={`${r.cerrada ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'} px-2 py-1 rounded-full text-xs`}>
                        {r.cerrada ? 'CERRADA' : 'ABIERTA'}
                      </span>
                    </td>
                    <td className="py-2 pr-2 flex gap-2">
                      <button onClick={()=>{ setEditingId(r.id); setFormFecha(String(r.fecha).slice(0,10)); setFormTipo(String(r.tipo_reunion)); setEditOpen(true); }} className="px-2 py-1 rounded bg-slate-200">Editar</button>
                      <button onClick={async()=>{
                        const ok = window.confirm(`¿Seguro querés ${r.cerrada ? 'abrir' : 'cerrar'} la reunión del ${String(r.fecha).slice(0,10)} (${r.tipo_reunion})?`);
                        if (!ok) return;
                        try { const { error } = await supabase.from('reuniones').update({ cerrada: !r.cerrada }).eq('id', r.id); if (error) throw error; setToast(!r.cerrada ? 'Reunión cerrada' : 'Reunión abierta'); await loadReunionesAbiertas(puebloId); await loadReunionesTodas(puebloId); if (!r.cerrada && reunionSelId === r.id) setReunionSelId(""); } catch(e){ setToast('Error cambiando estado: '+(e.message||e)); }
                      }} className={`px-2 py-1 rounded ${r.cerrada ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                        {r.cerrada ? 'Abrir' : 'Cerrar'}
                      </button>
                      <button onClick={async()=>{
                        const ok = window.confirm(`¿Borrar la reunión del ${String(r.fecha).slice(0,10)} (${r.tipo_reunion})? Esta acción es permanente.`);
                        if (!ok) return;
                        try { const { error } = await supabase.from('reuniones').delete().eq('id', r.id); if (error) throw error; setToast('Reunión borrada'); if (reunionSelId === r.id) setReunionSelId(""); await loadReunionesAbiertas(puebloId); await loadReunionesTodas(puebloId); } catch(e){ setToast('Error borrando: '+(e.message||e)); }
                      }} className="px-2 py-1 rounded bg-slate-800 text-white">Borrar</button>
                    </td>
                  </tr>
                ))}
                {reunionesLista.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">No hay reuniones registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: QR individual */}
        {showQR && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 transition">
            <div className="bg-white rounded-2xl p-6 w-[95%] max-w-sm space-y-3 transform transition duration-200 ease-out">
              <h3 className="font-semibold">QR de {showQR.nombre}</h3>
              <div className="flex justify-center"><QRCode value={JSON.stringify({ mid: showQR.id })} size={180} /></div>
              <div className="text-xs text-slate-600 break-all">{showQR.id}</div>
              <div className="text-right"><button onClick={() => setShowQR(null)} className="px-3 py-2 rounded-lg bg-slate-200">Cerrar</button></div>
            </div>
          </div>
        )}

        {/* Modal: Escáner QR (componente externo) */}
        {qrOpen && (
          <QrScanner onDecode={onDecodedQR} onClose={()=>setQrOpen(false)} />)
        }

        {/* Modal: Crear/Editar reunión */}
        {editOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 transition">
            <div className="bg-white rounded-2xl p-6 w-[95%] max-w-md space-y-4 transform transition duration-200 ease-out">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar reunión' : 'Nueva reunión'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-sm text-slate-700 mb-1">Fecha</label>
                  <input type="date" value={formFecha} onChange={(e)=>setFormFecha(e.target.value)} className="border rounded-lg px-3 py-2" />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm text-slate-700 mb-1">Tipo</label>
                  <select value={formTipo} onChange={(e)=>setFormTipo(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
                    <option value="general">General</option>
                    <option value="comision">Comisión</option>
                    <option value="varias">Varias</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setEditOpen(false)} className="px-3 py-2 rounded-lg bg-slate-200">Cancelar</button>
                <button disabled={savingReunion} onClick={async()=>{
                  if (!supabase) { setToast('Cliente no inicializado'); return; }
                  if (!puebloId) { setToast('Seleccioná un pueblo'); return; }
                  if (!formFecha) { setToast('Elegí una fecha'); return; }
                  setSavingReunion(true);
                  try {
                    if (editingId) {
                      const { error } = await supabase.from('reuniones').update({ fecha: formFecha, tipo_reunion: formTipo }).eq('id', editingId);
                      if (error) throw error; setToast('Reunión actualizada');
                    } else {
                      const payload = { pueblo_id: puebloId, fecha: formFecha, tipo_reunion: formTipo, cerrada: false };
                      const { error } = await supabase.from('reuniones').insert(payload);
                      if (error) throw error; setToast('Reunión creada');
                    }
                    setEditOpen(false);
                    await loadReunionesAbiertas(puebloId);
                    await loadReunionesTodas(puebloId);
                  } catch(e){ setToast('Error guardando reunión: '+(e.message||e)); }
                  finally { setSavingReunion(false); }
                }} className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
                  {savingReunion ? (editingId ? 'Actualizando…' : 'Creando…') : (editingId ? 'Actualizar' : 'Crear reunión')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overlay de flash */}
        {flash && (<div className="fixed inset-0 pointer-events-none bg-emerald-300/40" />)}

        {/* Sugerencia SQL para evitar duplicados (index único) */}
        <div className="text-xs text-slate-500">
          <pre className="whitespace-pre-wrap">
create unique index if not exists ux_asistencias_reunion_misionero
on public.asistencias (id_reunion, id_misionero);
          </pre>
        </div>

      </div>
    </div>
  );
}
