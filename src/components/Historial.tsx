// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = {
  reunion_id: string
  pueblo_id: string
  pueblo_nombre: string
  fecha: string
  tipo: string | null
  estado: string | null
  asistentes: number
}

export default function Historial() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string>('')
  const [pueblos, setPueblos] = useState<{id:string; nombre:string}[]>([])
  const [pueblo, setPueblo] = useState<string>('')
  const [estado, setEstado] = useState<string>('')
  const [limit, setLimit] = useState<number>(200)

  const loadPueblos = async () => {
    const { data, error } = await supabase.from('pueblos').select('id,nombre').order('nombre')
    if (!error) setPueblos(data || [])
  }

  const query = async () => {
    setLoading(true); setToast('')
    try {
      let q = supabase.from('v_historial_reuniones').select('*')
      if (pueblo) q = q.eq('pueblo_id', pueblo)
      if (estado) q = q.eq('estado', estado)
      q = q.order('fecha', { ascending: false }).limit(limit)
      const { data, error } = await q
      if (error) throw error
      setRows((data || []) as Row[])
    } catch (e:any) {
      setToast(e.message || 'Error al cargar historial')
    } finally {
      setLoading(false)
    }
  }

  const reabrir = async (reunion_id: string) => {
    setToast('')
    try {
      const { data, error } = await supabase.rpc('reabrir_reunion', { p_reunion_id: reunion_id })
      if (error) throw error
      setToast(typeof data === 'string' ? data : 'Reunión reabierta')
      await query()
    } catch (e:any) {
      setToast(e.message || 'No se pudo reabrir')
    }
  }

  useEffect(() => { loadPueblos(); query() }, [])

  return (
    <div className="space-y-3">
      {toast && <div className="rounded border px-3 py-2 bg-emerald-50 text-emerald-900">{toast}</div>}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-600">Pueblo</label>
          <select value={pueblo} onChange={(e)=>setPueblo(e.target.value)} className="border rounded px-3 py-2 min-w-[220px] bg-white">
            <option value="">Todos</option>
            {pueblos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">Estado</label>
          <select value={estado} onChange={(e)=>setEstado(e.target.value)} className="border rounded px-3 py-2 bg-white">
            <option value="">Todos</option>
            <option value="abierta">Abierta</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">Límite</label>
          <input type="number" min={50} step={50} value={limit} onChange={(e)=>setLimit(parseInt(e.target.value||'200'))} className="border rounded px-3 py-2 w-28"/>
        </div>
        <button onClick={query} disabled={loading} className="px-3 py-2 rounded border">
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Pueblo</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Asistentes</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.reunion_id} className="border-b">
                <td className="py-2 pr-4">{new Date(r.fecha).toLocaleString()}</td>
                <td className="py-2 pr-4">{r.pueblo_nombre}</td>
                <td className="py-2 pr-4">{r.tipo ? String(r.tipo) : '—'}</td>
                <td className="py-2 pr-4">{r.estado || '—'}</td>
                <td className="py-2 pr-4">{r.asistentes}</td>
                <td className="py-2">
                  {r.estado === 'cerrada' ? (
                    <button onClick={()=>reabrir(r.reunion_id)} className="px-3 py-1 rounded bg-indigo-600 text-white">Reabrir</button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-slate-500">Sin reuniones</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
