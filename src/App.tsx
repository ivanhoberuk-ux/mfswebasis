import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminPuntajes from "./components/AdminPuntajes";
import Reuniones from "./components/Reuniones";
import Dashboard from "./components/Dashboard";
// Si no existe aún, creamos un placeholder de ReporteMisionero en /src/pages
import ReporteMisionero from "./pages/ReporteMisionero";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen p-4 md:p-8">
        <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">
            Misiones – Admin de Puntajes
          </h1>
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm underline opacity-70 hover:opacity-100"
          >
            Supabase
          </a>
        </header>

        <main className="max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reuniones" element={<Reuniones />} />
            <Route path="/reporte" element={<ReporteMisionero />} />
            <Route path="/puntajes" element={<AdminPuntajes />} />
            <Route path="*" element={<div>404 - Página no encontrada</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
