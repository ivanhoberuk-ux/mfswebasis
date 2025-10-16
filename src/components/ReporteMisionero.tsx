// ReporteMisionero.tsx
// Usa funciones seguras: get_reporte_misionero_v2 + get_reporte_misionero_totales_v1
// No afecta al módulo de Reuniones

// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** ===== Helpers Supabase ===== */
function readEnv(key: string) {
  const m: any = import.meta?.env || {};
  const win: any = typeof window !== "undefined" ? window : {};
  return m?.[key] || m?.["VITE_" + key] || win?.[key] || undefined;
}
function getInitialSupabaseConfig() {
  const urlFromEnv =
    readEnv("VITE_SUPABASE_URL") ||
    readEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    (window as any).SUPABASE_URL ||
    localStorage.getItem("sb_url") ||
    "";
  const keyFromEnv =
    readEnv("VITE_SUPABASE_ANON_KEY") ||
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    (window as any).SUPABASE_ANON_KEY ||
    localStorage.getItem("sb_key") ||
    "";
  const DEFAULT_SB_URL = "https://npekpdkywsneylddzzuu.supabase.co";
  const DEFAULT_SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWtwZGt5d3NuZXlsZGR6enV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDYxNDEsImV4cCI6MjA3MTk4MjE0MX0.RNuHThLkvwMzq6WMUna7P6WFUovG2CwT18LNJwtwNoI";
  return { url: urlFromEnv || DEFAULT_SB_URL, key: keyFromEnv || DEFAULT_SB_KEY };
}
function isValidUrl(s: string) {
  try { const u = new URL(s); return u.protocol.startsWith("http"); } catch { return false; }
}

/** ===== Tipos ===== */
type Misionero = {
  id: string;
  nombre: string | null;
  documento: string | null;
  pueblo_id: string | null;
  pueblo_nombre: string | null;
};
type Fila = {
  reunion_id: string;
  fecha: string;
  tipo: string | null;
  pueblo_id: string | null;
  pueblo_nombre: string | null;
  puntaje: number | null;
};
type Pueblo = { id: string; nombre: string; cupo_max?: number | null };

export default function ReporteMisionero() {
  /** Supabase */
  const [{ url, key }] = useState(getInitialSupabaseConfig());
  const supabase = useMemo(() => {
    if (!url || !key || !isValidUrl(url)) return null;
    try { return createClient(url, key); } catch { return null; }
  }, [url, key]);

  /** Estado */
  const [pueblos, setPueblos] = useState<Pueblo[]>([]);
  const [puebloId, setPuebloId] = useState<string>("");
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<Misionero[]>([]);
  const [selected, setSelected] = useState<Misionero | null>(null);
  const [desde, setDesde] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(false);
  const [totAsist, setTotAsist] = useState(0);
  const [totPuntos, setTotPuntos] = useState(0);
  const [toast, setToast] = useState("");

  const printRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  /** ====== Cargar pueblos ===== */
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.from("pueblos").select("id,nombre").order("nombre");
      if (error) { setToast("Error pueblos: " + error.message); return; }
      setPueblos(data || []);
    })();
  }, [supabase]);

  /** ====== Buscador (idéntico al anterior) ===== */
  useEffect(() => {
    if (!supabase) return;
    const term = q.trim();
    if (term.length < 2) { setSugs([]); return; }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        let list: Misionero[] = [];

        // por pueblo
        if (puebloId) {
          const { data, error } = await supabase.rpc("search_misioneros_por_pueblo", {
            p_pueblo_id: puebloId, p_q: term, p_limit: 20
          });
          if (!error && data && data.length) list = data as Misionero[];
        }

        // general
        if (!list.length) {
          const { data, error } = await supabase.rpc("search_misioneros", { p_q: term, p_limit: 20 });
          if (!error && data && data.length) list = data as Misionero[];
        }

        setSugs(list);
      } catch (e: any) {
        setToast("Error buscador: " + (e?.message || e));
        setSugs([]);
      }
    }, 250) as unknown as number;

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [supabase, q, puebloId]);

  /** ====== Cargar reporte (usa funciones nuevas seguras) ===== */
  useEffect(() => {
    (async () => {
      if (!supabase || !selected?.id) { setRows([]); setTotAsist(0); setTotPuntos(0); return; }
      setLoading(true);
      try {
        // detalle
        const { data, error } = await supabase.rpc("get_reporte_misionero_v2", {
          p_misionero_id: selected.id,
          p_desde: desde || null,
          p_hasta: hasta || null,
        });
        if (error) throw error;
        const list = (data || []) as Fila[];
        setRows(list);

        // totales desde SQL (más confiables)
        const { data: tot, error: et } = await supabase.rpc("get_reporte_misionero_totales_v1", {
          p_misionero_id: selected.id,
          p_desde: desde || null,
          p_hasta: hasta || null,
        });
        if (!et && tot?.length) {
          setTotAsist(tot[0].asistencias || 0);
          setTotPuntos(tot[0].puntos || 0);
        } else {
          setTotAsist(list.length);
          setTotPuntos(list.reduce((a, r) => a + Number(r.puntaje || 0), 0));
        }
      } catch (e: any) {
        setToast("Error reporte: " + (e?.message || e));
        setRows([]); setTotAsist(0); setTotPuntos(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, selected, desde, hasta]);

  /** ====== Exportar PDF/CSV ===== */
  const printRefContent = () => {
    const node = printRef.current;
    if (!node) return;
    const html = `
      <html><head><meta charset="utf-8"/>
      <title>Reporte</title>
      <style>*{box-sizing:border-box}body{font-family:sans-serif;padding:16px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      thead{background:#f5f5f5}@page{size:A4;margin:16mm}</style>
      </head><body>${node.innerHTML}</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch {} try { w.close(); } catch {} }, 150);
  };
  const onExportPDF = () => { if (rows.length) printRefContent(); };
  const onExportCSV = () => {
    if (!rows.length) return;
    const headers = ["fecha", "tipo", "pueblo", "puntaje"];
    const lines = [headers.join(",")];
    rows.forEach(r => lines.push([r.fecha, r.tipo, r.pueblo_nombre, r.puntaje].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte_${selected?.nombre || "misionero"}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  /** ====== Render ===== */
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Reporte individual por misionero</h1>

      {toast && <div className="rounded-xl border bg-amber-50 text-amber-900 px-4 py-2 mb-3">{toast}</div>}

      {/* Filtro pueblo + buscador */}
      <div className="flex items-end gap-3 mb-3">
        <div>
          <label className="block text-sm mb-1">Pueblo</label>
          <select className="border rounded-md px-3 py-2 bg-white min-w-56"
            value={puebloId} onChange={e => setPuebloId(e.target.value)}>
            <option value="">Todos</option>
            {pueblos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm mb-1">Buscar misionero</label>
          <input className="w-full border rounded-md px-3 py-2"
            placeholder="Escribí nombre o documento…" value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && sugs.length > 0) {
                const m = sugs[0]; setSelected(m); setSugs([]); setQ(m.nombre || m.documento || "");
              }
            }} />
          {sugs.length > 0 && (
            <div className="mt-2 border rounded-md max-h-56 overflow-auto bg-white">
              {sugs.map(m => (
                <button key={m.id}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={() => { setSelected(m); setSugs([]); setQ(m.nombre || m.documento || ""); }}>
                  <div className="font-medium">{m.nombre}</div>
                  <div className="text-xs text-gray-600">{m.documento} {m.pueblo_nombre ? `· ${m.pueblo_nombre}` : ""}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-md border" onClick={() => { setDesde(desde || null); setHasta(hasta || null); }}>Aplicar</button>
          <button className="px-3 py-2 rounded-md border" onClick={onExportCSV} disabled={!rows.length}>CSV</button>
          <button className="px-3 py-2 rounded-md border" onClick={onExportPDF} disabled={!rows.length}>PDF</button>
        </div>
      </div>

      {/* Rango fechas */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><label className="block text-sm mb-1">Desde</label>
          <input type="date" className="border rounded-md px-3 py-2" value={desde ?? ""} onChange={e => setDesde(e.target.value || null)} /></div>
        <div><label className="block text-sm mb-1">Hasta</label>
          <input type="date" className="border rounded-md px-3 py-2" value={hasta ?? ""} onChange={e => setHasta(e.target.value || null)} /></div>
      </div>

      {/* Totales */}
      {selected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border p-4 bg-white">
            <div className="text-sm text-gray-500">Misionero</div>
            <div className="font-semibold">{selected.nombre}</div>
            <div className="text-xs text-gray-600">{selected.documento}</div>
          </div>
          <div className="rounded-xl border p-4 bg-white">
            <div className="text-sm text-gray-500">Asistencias</div>
            <div className="text-2xl font-semibold">{totAsist}</div>
          </div>
          <div className="rounded-xl border p-4 bg-white">
            <div className="text-sm text-gray-500">Total puntos</div>
            <div className="text-2xl font-semibold">{totPuntos}</div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border bg-white overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Pueblo</th><th className="p-3">Puntaje</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-4 text-center text-gray-500">Cargando…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-500">Sin datos</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.reunion_id} className="border-t">
                <td className="p-3 whitespace-nowrap">{r.fecha}</td>
                <td className="p-3 capitalize">{r.tipo}</td>
                <td className="p-3">{r.pueblo_nombre}</td>
                <td className="p-3">{r.puntaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Área imprimible */}
      <div className="hidden" ref={printRef}>
        <h2 className="text-xl font-semibold mb-2">Reporte de {selected?.nombre}</h2>
        <p className="mb-2 text-sm">Documento: {selected?.documento} · {selected?.pueblo_nombre}</p>
        <p className="mb-4 text-sm">Rango: {desde || "inicio"} — {hasta || "hoy"}</p>
        <table className="w-full text-sm border">
          <thead><tr><th className="p-2 border">Fecha</th><th className="p-2 border">Tipo</th><th className="p-2 border">Pueblo</th><th className="p-2 border">Puntaje</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={"p_" + r.reunion_id}>
                <td className="p-2 border">{r.fecha}</td>
                <td className="p-2 border">{r.tipo}</td>
                <td className="p-2 border">{r.pueblo_nombre}</td>
                <td className="p-2 border">{r.puntaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
