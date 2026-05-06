import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/StatCard";
import { api } from "../services/api";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

const Spinner = () => (
  <div className="flex items-center justify-center py-32 animate-fade-in">
    <div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
  </div>
);

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = () =>
      api
        .getDashboard()
        .then((result) => {
          if (mounted) setData(result);
        })
        .catch((err) => {
          if (mounted) setError(err.message || "No se pudo cargar el dashboard.");
        });

    load();
    const interval = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <svg className="w-12 h-12 mx-auto text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-red-400 font-medium">{error}</p>
        <p className="text-dark-500 text-sm mt-1">Verifica que el backend esté corriendo</p>
      </div>
    );
  }

  if (!data) return <Spinner />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 text-sm mt-1">Resumen general del estado de los equipos</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total de Equipos"
          value={data.total_devices}
          color="indigo"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Equipos Online"
          value={data.online_devices}
          color="green"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          }
        />
        <StatCard
          label="Equipos Offline"
          value={data.offline_devices}
          color="red"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728m2.828-9.9a5 5 0 017.072 0m-7.072 7.072a5 5 0 007.072 0M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          }
        />
        <StatCard
          label="Con Alertas"
          value={data.devices_with_alerts || 0}
          color="amber"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Network Health & Recent Activity */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Network Health */}
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">Estado de la Red</h3>
            <span className={data.network_health === "OK" ? "badge-online" : "badge-warning"}>
              {data.network_health === "OK" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Saludable
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {data.network_health}
                </>
              )}
            </span>
          </div>

          <div className="space-y-4">
            {/* Online ratio bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-dark-400">Disponibilidad</span>
                <span className="text-white font-medium">
                  {data.total_devices > 0
                    ? Math.round((data.online_devices / data.total_devices) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill bg-gradient-to-r from-accent-500 to-emerald-500"
                  style={{
                    width: `${data.total_devices > 0 ? (data.online_devices / data.total_devices) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center p-3 rounded-xl bg-dark-700/30">
                <p className="text-xl font-bold text-emerald-400">{data.online_devices}</p>
                <p className="text-[11px] text-dark-500 mt-0.5">Activos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-dark-700/30">
                <p className="text-xl font-bold text-red-400">{data.offline_devices}</p>
                <p className="text-[11px] text-dark-500 mt-0.5">Inactivos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-dark-700/30">
                <p className="text-xl font-bold text-amber-400">{data.devices_with_alerts || 0}</p>
                <p className="text-[11px] text-dark-500 mt-0.5">Alertas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Diagnostics */}
        <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">Diagnósticos Recientes</h3>
            <button
              onClick={() => navigate("/alerts")}
              className="text-xs text-accent-400 hover:text-accent-300 font-medium transition-colors"
            >
              Ver todos →
            </button>
          </div>

          {data.latest_diagnostics?.length ? (
            <div className="space-y-3">
              {data.latest_diagnostics.map((diag) => (
                <div
                  key={diag.id}
                  className="flex items-center gap-4 p-3.5 rounded-xl bg-dark-700/30 hover:bg-dark-700/50 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/devices/${diag.device_id}`)}
                >
                  <div className="w-9 h-9 rounded-lg bg-accent-500/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4.5 h-4.5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-200 truncate group-hover:text-white transition-colors">
                      {diag.summary}
                    </p>
                    <p className="text-[11px] text-dark-500 mt-0.5">Dispositivo #{diag.device_id}</p>
                  </div>
                  <span className="text-[11px] text-dark-500 flex-shrink-0">
                    {timeAgo(diag.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-10 h-10 mx-auto text-dark-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-dark-500 text-sm">Sin diagnósticos recientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
