import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);
const DevicesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const InventoryIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const AlertsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);
const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 00-3-3.87" />
  </svg>
);

const ALL_ITEMS = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/devices", label: "Equipos", icon: DevicesIcon },
  { to: "/inventory", label: "Inventario", icon: InventoryIcon },
  { to: "/alerts", label: "Alertas", icon: AlertsIcon },
  { to: "/settings", label: "Configuración", icon: SettingsIcon, adminOnly: true },
  { to: "/users", label: "Usuarios", icon: UsersIcon, adminOnly: true },
];

function NavLinks({ onNavigate }) {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav className="flex-1 space-y-1.5">
      {ALL_ITEMS.filter((i) => !i.adminOnly || isAdmin).map((item) => {
        const active = isActive(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            id={`nav-${item.to.replace("/", "") || "dashboard"}`}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-accent-600/15 text-accent-400 border border-accent-500/20 shadow-sm"
                : "text-dark-300 hover:text-white hover:bg-dark-700/50 border border-transparent"
            }`}
          >
            <Icon />
            <span>{item.label}</span>
            {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse-slow" />}
          </Link>
        );
      })}
    </nav>
  );
}

function UserFooter() {
  const { user, logout } = useAuth();
  return (
    <div className="mt-auto pt-6 border-t border-dark-700/50">
      <div className="flex items-center gap-3 px-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center text-white text-xs font-bold uppercase">
          {(user?.username || "?").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-100 truncate">{user?.full_name || user?.username}</p>
          <p className="text-[10px] text-dark-500 capitalize">{user?.role === "admin" ? "Administrador" : "Visualizador"}</p>
        </div>
      </div>
      <button
        onClick={logout}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Cerrar Sesión
      </button>
    </div>
  );
}

const Brand = () => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-600/30">
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    </div>
    <div>
      <h1 className="text-lg font-bold text-white tracking-tight">TI Diagnostic</h1>
      <p className="text-xs text-dark-400 font-medium">Panel de Monitoreo</p>
    </div>
  </div>
);

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Topbar móvil con hamburguesa */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-16 bg-dark-900/90 backdrop-blur-xl border-b border-dark-700/50">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700/50"
          aria-label="Abrir menú"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-72 min-h-screen bg-dark-900/80 backdrop-blur-xl border-r border-dark-700/50 p-6 animate-slide-in-left">
        <div className="mb-10">
          <Brand />
        </div>
        <NavLinks />
        <UserFooter />
      </aside>

      {/* Drawer móvil */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[80vw] flex flex-col bg-dark-900 border-r border-dark-700/50 p-6 animate-slide-in-left">
            <div className="flex items-center justify-between mb-8">
              <Brand />
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-dark-400 hover:text-white" aria-label="Cerrar menú">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <UserFooter />
          </aside>
        </div>
      )}
    </>
  );
}
