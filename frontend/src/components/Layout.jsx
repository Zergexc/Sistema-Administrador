import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWebSocket } from "../hooks/useWebSocket";
import Sidebar from "./Sidebar";

const PWD_BANNER_KEY = "ti_hide_pwd_banner";

function DefaultPasswordBanner() {
  const { user, isAdmin } = useAuth();
  const [hidden, setHidden] = useState(() => localStorage.getItem(PWD_BANNER_KEY) === "1");
  // Heurística: recuerda al admin por defecto cambiar la contraseña.
  if (hidden || !isAdmin || user?.username !== "admin") return null;
  return (
    <div className="flex items-center gap-3 p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
      </svg>
      <p className="text-sm text-amber-200 flex-1">
        Estás usando la cuenta por defecto. Por seguridad, cambia la contraseña en{" "}
        <Link to="/users" className="underline font-medium hover:text-amber-100">Usuarios</Link>.
      </p>
      <button onClick={() => { localStorage.setItem(PWD_BANNER_KEY, "1"); setHidden(true); }}
        className="text-amber-400/70 hover:text-amber-300">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

const TITLE_MAP = [
  [/^\/$/, "Dashboard"],
  [/^\/devices\/.+/, "Detalle de Equipo"],
  [/^\/devices/, "Equipos"],
  [/^\/inventory\/categories/, "Categorías de Inventario"],
  [/^\/inventory\/.+/, "Detalle de Item"],
  [/^\/inventory/, "Inventario"],
  [/^\/alerts/, "Alertas"],
  [/^\/settings/, "Configuración"],
  [/^\/users/, "Usuarios"],
];

function pageTitle(pathname) {
  const match = TITLE_MAP.find(([re]) => re.test(pathname));
  return match ? `${match[1]} · TI Diagnostic` : "TI Diagnostic Panel";
}

export default function Layout() {
  const location = useLocation();
  const { addToast } = useToast();
  const { connected } = useWebSocket((msg) => {
    // Re-emite para que las páginas refresquen.
    window.dispatchEvent(new CustomEvent("ti:ws", { detail: msg }));
    // Notificaciones en vivo.
    if (msg.type === "alert_created" && msg.alert) {
      addToast(
        `${msg.alert.code}: ${msg.alert.message}`,
        msg.alert.severity === "critical" ? "error" : "warning"
      );
    } else if (msg.type === "device_registered" && msg.device) {
      addToast(`Nuevo equipo registrado: ${msg.device.hostname}`, "info");
    }
  });

  // Título dinámico por página (Fase 2).
  useEffect(() => {
    document.title = pageTitle(location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-dark-900">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 md:p-8 pt-20 md:pt-8 overflow-y-auto max-h-screen">
        {/* Indicador de conexión en vivo */}
        <div className="hidden md:flex items-center justify-end mb-2">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
              connected ? "text-emerald-400" : "text-dark-500"
            }`}
            title={connected ? "Tiempo real activo" : "Reconectando…"}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse-slow" : "bg-dark-500"}`} />
            {connected ? "En vivo" : "Sin conexión en vivo"}
          </span>
        </div>
        <DefaultPasswordBanner />
        <Outlet />
      </main>
    </div>
  );
}
