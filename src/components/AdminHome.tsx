// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * ⚠️ Fixes incluidos
 * - "supabaseUrl is required": cliente lazy sólo si hay URL/KEY válidas.
 * - "needsConfig is not defined": se define como derivado de url/key.
 * - Panel de configuración oculto por defecto (prod); visible con ?admin=1.
 * - Panel de pruebas con más casos (consulta de configuracion_puntajes).
 */

// Helpers para obtener/guardar configuración de Supabase
function readEnv(key: string): string | undefined {
  // Vite / Next (expuesto en cliente) / Fallback window
  const m = (import.meta as any)?.env || {};
  const win = (window as any) || {};
  return m?.[key] || m?.["VITE_" + key] || win?.[key] || undefined;
}

function getInitialSupabaseConfig() {
  // Prioridad: Env → Window → localStorage
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

  // 🚀 Defaults provistos por el usuario (auto-fix para el entorno de pruebas)
  const DEFAULT_SB_URL = "https://npekpdkywsneylddzzuu.supabase.co";
  const DEFAULT_SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWtwZGt5d3NuZXlsZGR6enV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDYxNDEsImV4cCI6MjA3MTk4MjE0MX0.RNuHThLkvwMzq6WMUna7P6WFUovG2CwT18LNJwtwNoI";

  const url = urlFromEnv || DEFAULT_SB_URL;
  const key = keyFromEnv || DEFAULT_SB_KEY;
  return { url, key };
}

function isValidUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol.startsWith("http");
  } catch {
    return false;
  }
}

// Tipos
type Pueblo = { id: string; nombre: string; cupo_max: number | null };

type RankingRow = {
  id_misionero: string;
  misionero_nombre: string;
  pueblo_id: string;
  pueblo_nombre: string;
  total_puntos: string | number; // viene numeric de Postgres
  reuniones_asistidas: number;
  ultima_asistencia: string | null;
  pos: number;
};

type RpcSetMsg = { msg: string };

type RecalcRow = {
  id_misionero: string;
  misionero_nombre: string;
  total_puntos: number;
  reuniones_asistidas: number;
  ultima_asistencia: string | null;
  pos: number;
};

export default function AdminHome() {
  // Configuración de Supabase (editable si faltan envs)
  const [{ url, key }, setCfg] = useState(getInitialSupabaseConfig());
  const [clientError, setClientError] = useState<string>("");

  // 💡 Derivado para evitar ReferenceError: needsConfig
  const needsConfig = !url || !key;

  const supabase: SupabaseClient | null = useMemo(() => {
    if (!url || !key) return null;
    if (!isValidUrl(url)) {
      setClientError("La URL de Supabase no es válida");
      return null;
    }
    try {
      setClientError("");
      return createClient(url, key);
    } catch (e: any) {
      setClientError(e?.message || "No se pudo crear el cliente de Supabase");
      return null;
    }
  }, [url, key]);

  const [pueblos, setPueblos] = useState<Pueblo[]>([]);
  const [puebloId, setPuebloId] = useState<string>("");
  const [general, setGeneral] = useState<number>(5);
  const [comision, setComision] = useState<number>(3);
  const [varias, setVarias] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [applyCupo, setApplyCupo] = useState<boolean>(true);
  const [preview, setPreview] = useState<RecalcRow[] | null>(null);
  const [health, setHealth] = useState<string>("");

  // Cargar pueblos cuando el cliente esté listo
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setHealth("");
      const { data, error } = await supabase
        .from("pueblos")
        .select("id,nombre,cupo_max")
        .order("nombre");
      if (error) {
        setToast(`Error cargando pueblos: ${error.message}`);
        setHealth("❌ Error al consultar pueblos");
        return;
      }
      setPueblos((data || []) as Pueblo[]);
      if (data && data.length && !puebloId) setPuebloId((data[0] as any).id);
      setHealth("✅ Conexión OK y consulta de pueblos exitosa");
    })();
  }, [supabase]);

  // Carga ranking actual (persistido)
  useEffect(() => {
    if (!supabase || !puebloId) return;
    (async () => {
      const { data, error } = await supabase
        .from("v_ranking_pueblo")
        .select(
          "id_misionero,misionero_nombre,pueblo_id,pueblo_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,pos"
        )
        .eq("pueblo_id", puebloId)
        .order("pos");
      if (!error) setRanking((data || []) as RankingRow[]);
    })();
  }, [supabase, puebloId]);

  const handleSave = async () => {
    if (!supabase || !puebloId) return;
    if (general <= 0 || comision <= 0 || varias <= 0) {
      setToast("Los puntajes deben ser > 0");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("set_puntajes_por_pueblo", {
        p_pueblo_id: puebloId,
        p_general: general,
        p_comision: comision,
        p_varias: varias,
      });
      if (error) throw error;
      const msg = (data as RpcSetMsg[] | null)?.[0]?.msg || "OK";
      setToast(msg);
      // refrescar ranking persistido
      const { data: rkg } = await supabase
        .from("v_ranking_pueblo")
        .select(
          "id_misionero,misionero_nombre,pueblo_id,pueblo_nombre,total_puntos,reuniones_asistidas,ultima_asistencia,pos"
        )
        .eq("pueblo_id", puebloId)
        .order("pos");
      setRanking((rkg || []) as RankingRow[]);
      setPreview(null);
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!supabase || !puebloId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("preview_ranking_por_puntajes", {
        p_pueblo_id: puebloId,
        p_general: general,
        p_comision: comision,
        p_varias: varias,
      });
      if (error) throw error;
      setPreview((data || []) as RecalcRow[]);
      setToast("Preview calculado con puntajes provisionales");
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Panel reutilizable
  const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-2xl shadow p-4 md:p-6 bg-white/80 border border-gray-100">
      <h2 className="text-lg md:text-xl font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );

  // UI de configuración (oculta por defecto en prod). Para mostrarla usar ?admin=1 o localStorage.setItem('show_config','1')
  const isAdminMode = () => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('admin') === '1') return true;
      if (localStorage.getItem('show_config') === '1') return true;
    } catch {}
    return false;
  };

  // UI de configuración cuando falta URL/KEY (sólo visible en modo admin)
  const ConfigPanel = () => {
    const [urlInput, setUrlInput] = useState(url);
    const [keyInput, setKeyInput] = useState(key);

    const save = () => {
      // Validaciones simples
      if (!urlInput || !isValidUrl(urlInput)) {
        setClientError("Ingresá una URL válida de Supabase (https://...) ");
        return;
      }
      if (!keyInput) {
        setClientError("Ingresá la ANON KEY de Supabase");
        return;
      }
      localStorage.setItem("sb_url", urlInput);
      localStorage.setItem("sb_key", keyInput);
      setCfg({ url: urlInput, key: keyInput });
      setClientError("");
      setToast("Configuración guardada. Conectando...");
    };

    return (
      <Panel title="Configurar conexión a Supabase">
        <div className="grid gap-3">
          <label className="text-sm">Supabase URL</label>
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="https://xxxx.supabase.co"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <label className="text-sm">Supabase ANON KEY</label>
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="eyJhbGci..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="px-4 py-2 rounded-xl shadow bg-emerald-600 text-white">Guardar</button>
            <button
              onClick={() => {
                localStorage.removeItem("sb_url");
                localStorage.removeItem("sb_key");
                setCfg({ url: "", key: "" });
                setClientError("");
              }}
              className="px-4 py-2 rounded-xl shadow bg-slate-200"
            >Limpiar</button>
          </div>
          {clientError && (
            <div className="rounded-xl border bg-red-50 text-red-900 px-4 py-2">{clientError}</div>
          )}
        </div>
      </Panel>
    );
  };

  // Panel de pruebas rápidas (pseudo test cases de integración)
  const TestsPanel = () => {
    const [out, setOut] = useState<string>("");

    const run = async () => {
      const logs: string[] = [];
      const push = (s: string) => logs.push(s);
      try {
        push("[1] Verificando cliente...");
        if (!supabase) {
          push("❌ Cliente no inicializado (faltan URL/KEY)");
          setOut(logs.join("\n"));
          return;
        }
        push("✅ Cliente inicializado");

        push("[2] Consultando pueblos (LIMIT 1)...");
        const { data: p1, error: e1 } = await supabase.from("pueblos").select("id").limit(1);
        if (e1) throw e1;
        push(`✅ OK (${p1?.length || 0} filas)`);

        push("[3] Consultando ranking (LIMIT 1)...");
        const { data: r1, error: e2 } = await supabase
          .from("v_ranking_pueblo")
          .select("id_misionero")
          .limit(1);
        if (e2) throw e2;
        push(`✅ OK (${r1?.length || 0} filas)`);

        push("[4] RPC preview_ranking_por_puntajes (mock 5/3/2, primer pueblo si existe)...");
        const firstPueblo = (p1 && (p1 as any)[0]?.id) || null;
        if (firstPueblo) {
          const { data: rp, error: e3 } = await supabase.rpc("preview_ranking_por_puntajes", {
            p_pueblo_id: firstPueblo,
            p_general: 5,
            p_comision: 3,
            p_varias: 2,
          });
          if (e3) throw e3;
          push(`✅ OK (filas: ${rp?.length || 0})`);
        } else {
          push("⚠️ Sin pueblos para probar la RPC, omito");
        }

        // 🆕 [5] Consulta rápida de configuracion_puntajes (LIMIT 1)
        push("[5] Consultando configuracion_puntajes (LIMIT 1)...");
        const { data: c1, error: e5 } = await supabase
          .from("configuracion_puntajes")
          .select("pueblo_id,tipo_reunion,puntaje")
          .limit(1);
        if (e5) throw e5;
        push(`✅ OK (${c1?.length || 0} filas)`);

        setOut(logs.join("\n"));
      } catch (err: any) {
        push(`❌ Error: ${err.message || String(err)}`);
        setOut(logs.join("\n"));
      }
    };

    return (
      <Panel title="Pruebas de conexión (auto-tests)">
        <div className="flex gap-2 mb-2">
          <button
            onClick={run}
            
            className="px-4 py-2 rounded-xl shadow bg-indigo-600 text-white disabled:opacity-50"
          >
            Ejecutar pruebas
          </button>
          <span className="text-sm text-slate-600">{health}</span>
        </div>
        <pre className="bg-slate-900 text-slate-100 p-3 rounded-xl text-xs overflow-auto min-h-[120px]">{out || "(sin salida)"}</pre>
      </Panel>
    );
  };

  // Derivados para corte por cupo en cliente
  const currentPueblo = useMemo(() => pueblos.find(p => p.id === puebloId) || null, [pueblos, puebloId]);
  const shownRanking = useMemo(() => {
    if (!applyCupo || !currentPueblo?.cupo_max) return ranking;
    return ranking.slice(0, Math.max(0, currentPueblo.cupo_max));
  }, [ranking, applyCupo, currentPueblo]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Administrar puntajes por pueblo</h1>
            <p className="text-sm text-slate-600">Configura valores por tipo de reunión, previsualiza el impacto y guarda.</p>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-slate-700">Pueblo</label>
            <span className="text-xs text-slate-500 ml-1">id actual: {puebloId || "—"}</span>
            <select
              className="border rounded-lg px-3 py-2 bg-white"
              value={puebloId}
              onChange={(e) => setPuebloId(e.target.value)}
              
            >
              (!puebloId || pueblos.length===0) && (<option value="" disabled>Seleccioná un pueblo…</option>))
              {pueblos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </header>

        {toast && (
          <div className="rounded-xl border bg-emerald-50 text-emerald-900 px-4 py-2">{toast}</div>
        )}

        {needsConfig && isAdminMode() && <ConfigPanel />}

        <TestsPanel />

        <div className="grid md:grid-cols-2 gap-6">
          <Panel title="Puntajes (por tipo de reunión)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm">General</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={general}
                  onChange={(e) => setGeneral(parseFloat(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm">Comisión</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={comision}
                  onChange={(e) => setComision(parseFloat(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm">Varias</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={varias}
                  onChange={(e) => setVarias(parseFloat(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handlePreview}
                disabled={loading || !puebloId || !supabase}
                className="px-4 py-2 rounded-xl shadow bg-slate-800 text-white disabled:opacity-50"
              >
                Previsualizar impacto
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !puebloId || !supabase}
                className="px-4 py-2 rounded-xl shadow bg-emerald-600 text-white disabled:opacity-50"
              >
                Guardar cambios
              </button>
            </div>
          </Panel>

          <Panel title="Ranking actual (persistido)">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={applyCupo} onChange={(e)=>setApplyCupo(e.target.checked)} />
                Aplicar corte por cupo {currentPueblo?.cupo_max ? `(cupo: ${currentPueblo.cupo_max})` : '(sin cupo definido)'}
              </label>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Misionero</th>
                    <th className="py-2 pr-2">Puntos</th>
                    <th className="py-2 pr-2">Asist.</th>
                    <th className="py-2 pr-2">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRanking.map((r) => (
                    <tr key={r.id_misionero} className="border-b last:border-0">
                      <td className="py-2 pr-2">{r.pos}</td>
                      <td className="py-2 pr-2">{r.misionero_nombre}</td>
                      <td className="py-2 pr-2">{r.total_puntos}</td>
                      <td className="py-2 pr-2">{r.reuniones_asistidas}</td>
                      <td className="py-2 pr-2">{r.ultima_asistencia ?? "—"}</td>
                    </tr>
                  ))}
                  {shownRanking.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        Sin datos aún
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="Preview (sin aplicar)">
          {preview ? (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Misionero</th>
                    <th className="py-2 pr-2">Puntos</th>
                    <th className="py-2 pr-2">Asist.</th>
                    <th className="py-2 pr-2">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.id_misionero} className="border-b last:border-0">
                      <td className="py-2 pr-2">{r.pos}</td>
                      <td className="py-2 pr-2">{r.misionero_nombre}</td>
                      <td className="py-2 pr-2">{r.total_puntos.toFixed(2)}</td>
                      <td className="py-2 pr-2">{r.reuniones_asistidas}</td>
                      <td className="py-2 pr-2">{r.ultima_asistencia ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Generá una previsualización cambiando los puntajes y presionando "Previsualizar impacto".
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
