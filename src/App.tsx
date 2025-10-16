import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminHome from "./components/AdminHome";
import AdminPuntajes from "./components/AdminPuntajes";
import AdminRanking from "./components/AdminRanking";
import Dashboard from "./components/Dashboard";
import Historial from "./components/Historial";
import Importar from "./components/Importar";
import QrScanner from "./components/QrScanner";
import ReporteMisionero from "./components/ReporteMisionero";
import Reuniones from "./components/Reuniones";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen p-4 md:p-8">
        <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">Misiones – Admin</h1>
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
            <Route path="/ranking" element={<AdminRanking />} />
            <Route path="/historial" element={<Historial />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/qr" element={<QrScanner />} />
            <Route path="/home" element={<AdminHome />} />
            <Route path="*" element={<div>404 - Página no encontrada</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
