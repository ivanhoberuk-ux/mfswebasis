import Importar from './Importar'
import Dashboard from './Dashboard'
import React, { useState } from 'react'
import AdminHome from './AdminHome'
import AdminRanking from './AdminRanking'
import Reuniones from './Reuniones'
import Historial from './Historial'
import ReporteMisionero from './ReporteMisionero'

type TabKey = 'home' | 'ranking' | 'reuniones' | 'hist' | 'reporte' | 'dashboard' | 'importar'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Inicio' },
  { key: 'ranking', label: 'Puntajes & Ranking' },
  { key: 'reuniones', label: 'Reuniones & Asistencia' },
  { key: 'hist', label: 'Historial' },
  { key: 'reporte', label: 'Reporte Misionero' },
  { key: 'importar', label: 'Importar' },
  { key: 'dashboard', label: 'Dashboard' },
]

export default function AdminPuntajes() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  const needsConfig = !url || !anon

  const [tab, setTab] = useState<TabKey>('home')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'px-3 py-2 rounded-md text-sm font-medium border ' +
              (tab === key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white hover:bg-slate-100 border-slate-300')
            }>
            {label}
          </button>
        ))}
      </div>

      {needsConfig && (
        <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-900">
          ⚠️ Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env</code>.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
        {tab === 'home' && <AdminHome />}
        {tab === 'ranking' && <AdminRanking />}
        {tab === 'reuniones' && <Reuniones />}
        {tab === 'hist' && <Historial />}
        {tab === 'reporte' && <ReporteMisionero />}
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'importar' && <Importar />}
      </div>
    </div>
  )
}
