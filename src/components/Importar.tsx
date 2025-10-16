// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Registro = {
  registro_id: string
  nombre: string
  documento: string | null
  email: string | null
  telefono: string | null
  pueblo_id: string | null
  pueblo_nombre: string | null
}

export default function Importar() {
  const [pueblos, setPueblos] = useState<{id:string; nombre:string}[]>([])
  const [pueblo, setPueblo] = useState<string>('')
  const [rows, setRows] = useState<Registro[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string>('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('pueblos').select('id,nombre').order('nombre')
      setPueblos(data || [])
    })()
  }, [])

  const load = async () => {
    setLoading(true); setToast('')
    try {
      let q = supabase.from('v_registros_unificados').select('*').limit(1000)
      if (pueblo) q = q.eq('pueblo_id', pueblo)
      const { data, error } = await q
      if (error) throw error
      setRows(data || [])
    } catch (e:any) {
      setToast(e.message || 'No se pudieron cargar los registros')
    } finally {
      setLoading(false)
    }
  }

  const importarUno = async (registro_id: string) => {
    if (!pueblo) return setToast('Seleccioná un pueblo destino primero')
    setToast('')
    const { data, error } = await supabase.rpc('importar_registro_a_misioneros', { p_registro_id: registro_id, p_pueblo_id: pueblo })
    if (error) return setToast(error.message)
    setToast(`Importado: ${data?.[0]?.misionero_id || 'OK'}`)
  }

  const importarTodos = async () => {
    if (!pueblo) return setToast('Seleccioná un pueblo destino primero')
    setToast('')
    const { data, error } = await supabase.rpc('importar_registros_masivo', { p_pueblo_id: pueblo })
    if (error) return setToast(error.message)
    setToast(`Importados: ${data?.length || 0}`)
    await load()
  }

  return (
    <div className="space-y-3">
      {toast && <div className="rounded border px-3 py-2 bg-emerald-50 text-emerald-900">{toast}</div>}

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-slate-600">Pueblo destino</label>
          <select value={pueblo} onChange={e=>setPueblo(e.target.value)} className="border rounded px-3 py-2 min-w-[240px] bg-white">
            <option value="">Seleccioná…</option>
            {pueblos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button onClick={load} className="px-3 py-2 rounded border">{loading ? 'Cargando…' : 'Cargar registros'}</button>
        <button onClick={importarTodos} disabled={!pueblo || rows.length===0} className="px-3 py-2 rounded border">Importar TODOS</button>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Nombre</th>
              <th className="py-2 pr-4">Documento</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Teléfono</th>
              <th className="py-2 pr-4">Pueblo (origen)</th>
              <th className="py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.registro_id} className="border-b">
                <td className="py-2 pr-4">{r.nombre}</td>
                <td className="py-2 pr-4">{r.documento || '—'}</td>
                <td className="py-2 pr-4">{r.email || '—'}</td>
                <td className="py-2 pr-4">{r.telefono || '—'}</td>
                <td className="py-2 pr-4">{r.pueblo_nombre || '—'}</td>
                <td className="py-2">
                  <button onClick={()=>importarUno(r.registro_id)} disabled={!pueblo} className="px-3 py-1 rounded bg-indigo-600 text-white">Importar</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="py-6 text-slate-500" colSpan={6}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
