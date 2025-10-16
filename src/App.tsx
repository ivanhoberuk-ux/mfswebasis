import React from 'react'
import AdminPuntajes from './components/AdminPuntajes'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Reuniones from './Reuniones'
import ReporteMisionero from './pages/ReporteMisionero'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Misiones – Admin de Puntajes</h1>
        <a
          href="https://supabase.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline opacity-70 hover:opacity-100">
          Supabase
        </a>
      </header>
      <main className="max-w-6xl mx-auto">
        <AdminPuntajes />
      </main>
    </div>
  )
}
