import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";

// IMPORTS A COMPONENTS (todo está en src/components)
import AdminHome from "./components/AdminHome";
import AdminPuntajes from "./components/AdminPuntajes";
import AdminRanking from "./components/AdminRanking";
import Dashboard from "./components/Dashboard";
import Historial from "./components/Historial";
import Importar from "./components/Importar";
import QrScanner from "./components/QrScanner";
import ReporteMisionero from "./components/ReporteMisionero";
import Reuniones from "./components/Reuniones";

// --- DEBUG: muestra la ruta actual para verificar navegación ---
function CurrentPathBadge() {
  const { pathname } = useLocation();
  return (
    <div className="text-xs px-2 py-1 rounded bg-slate-100 border inline-block">
      Ruta actual: <b>{pathname}</b>
    </div>
  );
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1 rounded-lg text-sm ${isActive ? "bg-indigo-600 text-white" : "hover:bg-slate-100"}`;

// --- OPCIONAL: placeholder si algún componente no existiera ---
// const Fallback = ({ name }: { name: string }) => (
//   <div style={{ padding: 16 }}>Placeholder de <b>{name}</b></div>
// );

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen p-4 md:p-8">
        <header className="max-w-6xl mx-auto mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold">Misiones – Admin</h1>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-sm underline opacity-70 hover:opacity-100"
            >
              Supabase
            </a>
          </div>

          {/* NAVBAR */}
          <nav className="mt-3 flex flex-wrap gap-2">
            <NavLink to="/dashboard" className={linkCls}>Dashboard</NavLink>
            <NavLink to="/reuniones" className={linkCls}>Reuniones</NavLink>
            <NavLink to="/puntajes" className={linkCls}>Puntajes</NavLink>
            <NavLink to="/ranking" className={linkCls}>Ranking</NavLink>
            <NavLink to="/historial" className={linkCls}>Historial</NavLink>
            <NavLink to="/importar" className={linkCls}>Importar</NavLink>
            <NavLink to="/reporte" className={linkCls}>Reporte</NavLink>
            <NavLink to="/qr" className={linkCls}>QR</NavLink>
            <NavLink to="/home" className={linkCls}>Home</NavLink>
            <NavLink to="/ping" className={linkCls}>Ping</NavLink>
          </nav>
        </header>

        <main className="max-w-6xl mx-auto space-y-3">
          <CurrentPathBadge />

          <Routes>
            {/* redirección inicial */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* rutas reales (todas en components) */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reuniones" element={<Reuniones />} />
            <Route path="/reporte" element={<ReporteMisionero />} />
            <Route path="/puntajes" element={<AdminPuntajes />} />
            <Route path="/ranking" element={<AdminRanking />} />
            <Route path="/historial" element={<Historial />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/qr" element={<QrScanner />} />
            <Route path="/home" element={<AdminHome />} />

            {/* ruta de prueba para verificar que el enrutador funciona */}
            <Route path="/ping" element={<div style={{ padding: 16 }}>PING OK ✅ — El router funciona.</div>} />

            {/* 404 */}
            <Route path="*" element={<div style={{ padding: 16 }}>404 - Página no encontrada</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
