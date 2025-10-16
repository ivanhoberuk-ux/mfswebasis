
// Dashboard.tsx
// Dashboard global con tarjetas y gráficos livianos (sin dependencias externas).

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

type Totales = {
  total_reuniones: number
  total_asistencias: number
  total_misioneros: number
  total_pueblos: number
  total_puntos: number
}

type PorTipo = { tipo: string | null; reuniones: number; asistencias: number; puntos: number }
type PorPueblo = { pueblo_id: string; pueblo_nombre: string | null; reuniones: number; asistencias: number; puntos: number }
type TopAsistencia = { id_misionero: string; nombre: string | null; total_asistencias: number; puntos: number }
type Tendencia = { semana: string; reuniones: number; asistencias: number; puntos: number }

function MiniBar({ value, max }: { value: number, max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full h-2 bg-gray-200 rounded">
      <div className="h-2 bg-emerald-600 rounded" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function Dashboard() {
  const [desde, setDesde] = useState<string | null>(null)
  const [hasta, setHasta] = useState<string | null>(null)

  const [tot, setTot] = useState<Totales | null>(null)
  const [porTipo, setPorTipo] = useState<PorTipo[]>([])
  const [porPueblo, setPorPueblo] = useState<PorPueblo[]>([])
  const [top, setTop] = useState<TopAsistencia[]>([])
  const [trend, setTrend] = useState<Tendencia[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [t, pt, pp, ta, tr] = await Promise.all([
        supabase.rpc('get_dashboard_totales', { p_desde: desde || null, p_hasta: hasta || null }),
        supabase.rpc('get_dashboard_por_tipo', { p_desde: desde || null, p_hasta: hasta || null }),
        supabase.rpc('get_dashboard_por_pueblo', { p_desde: desde || null, p_hasta: hasta || null }),
        supabase.rpc('get_dashboard_top_asistencia', { p_limit: 10, p_desde: desde || null, p_hasta: hasta || null }),
        supabase.rpc('get_dashboard_tendencia_semanal', { p_weeks: 12, p_desde: desde || null, p_hasta: hasta || null }),
      ])
      if (!t.error) setTot((t.data && t.data[0]) || null)
      if (!pt.error) setPorTipo(pt.data || [])
      if (!pp.error) setPorPueblo(pp.data || [])
      if (!ta.error) setTop(ta.data || [])
      if (!tr.error) setTrend(tr.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const maxTipo = Math.max(1, ...porTipo.map(x => Number(x.puntos || 0)))
  const maxPueblo = Math.max(1, ...porPueblo.map(x => Number(x.puntos || 0)))
  const maxTop = Math.max(1, ...top.map(x => Number(x.total_asistencias || 0)))

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>

      {/* Filtros */}
      <div className="rounded-xl border p-4 bg-white mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Desde</label>
          <input type="date" className="border rounded-md px-3 py-2" value={desde ?? ''} onChange={e=>setDesde(e.target.value||null)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hasta</label>
          <input type="date" className="border rounded-md px-3 py-2" value={hasta ?? ''} onChange={e=>setHasta(e.target.value||null)} />
        </div>
        <button className="px-3 py-2 rounded-md border" onClick={load} disabled={loading}>Aplicar</button>
        <button className="px-3 py-2 rounded-md border" onClick={()=>{ setDesde(null); setHasta(null); load(); }} disabled={loading}>Limpiar</button>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <Card title="Reuniones" value={tot?.total_reuniones ?? 0} />
        <Card title="Asistencias" value={tot?.total_asistencias ?? 0} />
        <Card title="Misioneros" value={tot?.total_misioneros ?? 0} />
        <Card title="Pueblos" value={tot?.total_pueblos ?? 0} />
        <Card title="Puntos" value={tot?.total_puntos ?? 0} />
      </div>

      {/* Por tipo / Por pueblo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border p-4 bg-white">
          <h2 className="font-semibold mb-3">Puntos por tipo</h2>
          <div className="space-y-3">
            {porTipo.map(x => (
              <div key={x.tipo || 'sin'}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize">{x.tipo || '(sin tipo)'}</span>
                  <span>{x.puntos} pts</span>
                </div>
                <MiniBar value={Number(x.puntos || 0)} max={maxTipo} />
              </div>
            ))}
            {porTipo.length===0 && <div className="text-sm text-gray-500">Sin datos</div>}
          </div>
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <h2 className="font-semibold mb-3">Puntos por pueblo</h2>
          <div className="space-y-3">
            {porPueblo.map(x => (
              <div key={x.pueblo_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{x.pueblo_nombre}</span>
                  <span>{x.puntos} pts</span>
                </div>
                <MiniBar value={Number(x.puntos || 0)} max={maxPueblo} />
              </div>
            ))}
            {porPueblo.length===0 && <div className="text-sm text-gray-500">Sin datos</div>}
          </div>
        </div>
      </div>

      {/* Top asistencia */}
      <div className="rounded-xl border p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Top asistencia (misioneros)</h2>
        <div className="space-y-3">
          {top.map(x => (
            <div key={x.id_misionero}>
              <div className="flex justify-between text-sm mb-1">
                <span>{x.nombre}</span>
                <span>{x.total_asistencias}</span>
              </div>
              <MiniBar value={Number(x.total_asistencias || 0)} max={maxTop} />
            </div>
          ))}
          {top.length===0 && <div className="text-sm text-gray-500">Sin datos</div>}
        </div>
      </div>

      {/* Tendencia */}
      <div className="rounded-xl border p-4 bg-white">
        <h2 className="font-semibold mb-3">Tendencia semanal (reuniones)</h2>
        <div className="overflow-x-auto">
          <div className="flex gap-2 items-end h-40">
            {trend.map(t => {
              const maxR = Math.max(1, ...trend.map(z => Number(z.reuniones || 0)))
              const h = Math.round(((Number(t.reuniones || 0)) / maxR) * 100)
              return (
                <div key={t.semana} className="w-8 bg-emerald-200" style={{ height: `${h}%` }} title={`${t.semana}: ${t.reuniones}`} />
              )
            })}
          </div>
          <div className="flex gap-2 text-[10px] text-gray-600 mt-1">
            {trend.map(t => <div key={'lbl'+t.semana} className="w-8 rotate-45 origin-left">{String(t.semana).slice(5)}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, value }: { title: string, value: number | string }) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
