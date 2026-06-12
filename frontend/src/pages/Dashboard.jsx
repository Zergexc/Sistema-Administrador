import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import OsDonut from "../components/charts/OsDonut";
import StatCard from "../components/StatCard";
import { useWsEvent } from "../hooks/useWsEvent";
import { api } from "../services/api";
import { formatGB, timeAgo } from "../utils/formatters";

const Spinner = () => (
  <div className="flex items-center justify-center py-32 animate-fade-in">
    <div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
  </div>
);

const STATE_STYLES = {
  ok: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:border-emerald-400/60",
  warning: "bg-amber-500/15 border-amber-500/30 text-amber-400 hover:border-amber-400/60",
  critical: "bg-red-500/15 border-red-500/30 text-red-400 hover:border-red-400/60",
  offline: "bg-dark-700/40 border-dark-600/50 text-dark-500 hover:border-dark-500",
};
const STATE_LABEL = { ok: "OK", warning: "Advertencia", critical: "Crítico", offline: "Offline" };

function TopList({ title, items, unit, icon }) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      {items?.length ? (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-dark-300 truncate max-w-[60%]">{d.hostname}</span>
                <span className="text-dark-100 font-medium font-mono">{Math.round(d.value)}{unit}</span>
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${d.value > 85 ? "bg-red-500" : d.value > 60 ? "bg-amber-500" : "bg-accent-500"}`}
                  style={{ width: `${Math.min(100, d.value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-dark-500 text-sm text-center py-6">Sin datos</p>
      )}
    </div>
  );
}

const CHANGE_META = {
  program_installed: { label: "Instalado", cls: "badge-online" },
  program_removed: { label: "Desinstalado", cls: "badge-offline" },
  program_updated: { label: "Actualizado", cls: "badge-info" },
  ram_changed: { label: "RAM", cls: "badge-warning" },
  cpu_changed: { label: "CPU", cls: "badge-warning" },
  storage_changed: { label: "Discos", cls: "badge-info" },
};

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(
    () =>
      Promise.all([
        api.getDashboard().then(setData),
        api.getRecentChanges().then(setChanges).catch(() => setChanges([])),
      ]).catch((err) => setError(err.message || "No se pudo cargar el dashboard.")),
    []
  );

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // fallback si el WS falla
    return () => clearInterval(interval);
  }, [load]);

  // Refresco en tiempo real.
  useWsEvent((msg) => {
    if (["device_update", "device_registered", "alert_created", "alert_resolved", "diagnostic_new"].includes(msg.type)) {
      load();
    }
  });

  if (error && !data) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <p className="text-red-400 font-medium">{error}</p>
        <p className="text-dark-500 text-sm mt-1">Verifica que el backend esté corriendo</p>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const disk = data.disk_summary || {};
  const diskPct = disk.total_gb ? Math.round((disk.used_gb / disk.total_gb) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-dark-400 text-sm mt-1">Resumen general del estado de los equipos</p>
        </div>
        <button onClick={() => navigate("/tv")} className="btn-primary flex items-center gap-2" title="Vista para monitor del área de TI">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M4 13h16M4 17h16M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" /></svg>
          Modo TV
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total de Equipos" value={data.total_devices} color="indigo"
          icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
        <StatCard label="Equipos Online" value={data.online_devices} color="green"
          icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M13 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg>} />
        <StatCard label="Equipos Offline" value={data.offline_devices} color="red"
          icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M13 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg>} />
        <StatCard label="Con Alertas" value={data.devices_with_alerts || 0} color="amber"
          icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
      </div>

      {/* Mapa de calor de equipos */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-white">Estado de Equipos</h3>
          <div className="flex items-center gap-3 text-[11px]">
            {Object.entries(STATE_LABEL).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5 text-dark-400">
                <span className={`w-2.5 h-2.5 rounded-sm border ${STATE_STYLES[k]}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {data.grid?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {data.grid.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/devices/${d.id}`)}
                className={`p-3 rounded-xl border text-left transition-all ${STATE_STYLES[d.state]}`}
              >
                <div className="flex items-center justify-between">
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {d.cpu_percent != null && <span className="text-[10px] font-mono opacity-80">{Math.round(d.cpu_percent)}%</span>}
                </div>
                <p className="text-sm font-medium text-white truncate mt-2">{d.hostname}</p>
                <p className="text-[10px] opacity-80 mt-0.5">{STATE_LABEL[d.state]}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-dark-500 text-sm text-center py-8">No hay equipos registrados aún</p>
        )}
      </div>

      {/* Top consumo y Potencia */}
      <div className="grid gap-5 lg:grid-cols-3">
        <TopList title="Top consumo RAM" items={data.top_ram} unit="%"
          icon={<svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v3a2 2 0 01-2 2M5 12a2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>} />
        <TopList title="Top consumo CPU" items={data.top_cpu} unit="%"
          icon={<svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>} />
        
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-cyber-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-base font-semibold text-white">Equipos más Potentes</h3>
          </div>
          {data.top_powerful_devices?.length ? (
            <div className="space-y-3">
              {data.top_powerful_devices.map((d, index) => (
                <div key={d.id} className="flex items-center justify-between p-2 rounded-xl bg-dark-700/20 hover:bg-dark-700/40 cursor-pointer transition-colors" onClick={() => navigate(`/devices/${d.id}`)}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-dark-500 font-mono w-4">#{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.hostname}</p>
                      <p className="text-[10px] text-dark-400 truncate">{d.cpu_model || "CPU Desconocido"}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-semibold text-accent-400 bg-accent-500/10 border border-accent-500/20 px-2 py-0.5 rounded-md">
                      {d.ram_total_gb ? `${d.ram_total_gb} GB` : "—"} RAM
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-500 text-sm text-center py-6">Sin datos</p>
          )}
        </div>
      </div>

      {/* Distribución SO + Disco + Red */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="glass-card p-6">
          <h3 className="text-base font-semibold text-white mb-4">Distribución de SO</h3>
          <OsDonut data={data.os_distribution} />
        </div>

        <div className="glass-card p-6 cursor-pointer hover:border-accent-500/50 transition-colors" onClick={() => navigate("/inventory")}>
          <h3 className="text-base font-semibold text-white mb-4">Licencias por Vencer</h3>
          <div className="flex items-end justify-between mb-2">
            <span className={`text-3xl font-bold ${data.expiring_licenses_count > 0 ? "text-amber-400" : "text-white"}`}>{data.expiring_licenses_count || 0}</span>
            <span className="text-sm text-dark-400">próximos 30 días</span>
          </div>
          <div className="progress-bar mb-3">
            <div className={`progress-fill ${data.expiring_licenses_count > 0 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: data.expiring_licenses_count > 0 ? "100%" : "0%" }} />
          </div>
          <p className="text-xs text-dark-500">{data.expiring_licenses_count > 0 ? "Se requiere renovación" : "Todas las licencias al día"}</p>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-base font-semibold text-white mb-4">Red</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-dark-700/30">
              <span className="text-sm text-dark-300">Estado general</span>
              <span className={data.network_health === "OK" ? "badge-online" : "badge-warning"}>{data.network_health}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-dark-700/30">
              <span className="text-sm text-dark-300">Sin internet</span>
              <span className={`text-sm font-bold ${data.devices_without_internet ? "text-red-400" : "text-emerald-400"}`}>
                {data.devices_without_internet || 0} equipos
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Alertas recientes */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Alertas Recientes</h3>
            <button onClick={() => navigate("/alerts")} className="text-xs text-accent-400 hover:text-accent-300 font-medium">Ver todas →</button>
          </div>
          {data.recent_alerts?.length ? (
            <div className="space-y-2">
              {data.recent_alerts.map((a) => (
                <div key={a.id} onClick={() => navigate(`/devices/${a.device_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/30 hover:bg-dark-700/50 cursor-pointer transition-colors">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.severity === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
                  <span className={`badge-${a.severity === "critical" ? "offline" : "warning"} flex-shrink-0`}>{a.code}</span>
                  <p className="text-sm text-dark-200 flex-1 truncate">{a.message}</p>
                  <span className="text-[11px] text-dark-500 flex-shrink-0">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-dark-500 text-sm">Sin alertas activas 🎉</div>
          )}
        </div>

        {/* Licencias por vencer */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Vencimientos de Licencias</h3>
            <button onClick={() => navigate("/inventory")} className="text-xs text-accent-400 hover:text-accent-300 font-medium">Ver todas →</button>
          </div>
          {data.expiring_licenses?.length ? (
            <div className="space-y-2">
              {data.expiring_licenses.map((l) => (
                <div key={l.id} onClick={() => navigate(`/inventory/${l.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/30 hover:bg-dark-700/50 cursor-pointer transition-colors">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
                  <span className="badge-warning flex-shrink-0">EXPIRA</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{l.name}</p>
                    <p className="text-xs text-dark-400 truncate">Equipo: {l.model || "—"} | Asignado: {l.assigned_to || "—"}</p>
                  </div>
                  <span className="text-[11px] text-dark-500 flex-shrink-0">{l.warranty_until ? new Date(l.warranty_until).toLocaleDateString("es-MX") : "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-dark-500 text-sm">Sin licencias por vencer en los próximos 30 días 🎉</div>
          )}
        </div>
      </div>

      {/* Cambios recientes (hardware/software) */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-white mb-1">Cambios Recientes</h3>
        <p className="text-xs text-dark-500 mb-4">Software instalado/desinstalado y cambios de hardware detectados en la oficina</p>
        {changes.length ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {changes.slice(0, 15).map((c) => {
              const meta = CHANGE_META[c.change_type] || { label: c.change_type, cls: "badge-info" };
              return (
                <div key={c.id} onClick={() => navigate(`/devices/${c.device_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/30 hover:bg-dark-700/50 cursor-pointer transition-colors">
                  <span className={`${meta.cls} flex-shrink-0`}>{meta.label}</span>
                  <p className="text-sm text-dark-200 flex-1 truncate">{c.details}</p>
                  <span className="text-[11px] text-dark-500 flex-shrink-0">{timeAgo(c.created_at)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-dark-500 text-sm">Sin cambios detectados aún</div>
        )}
      </div>
    </div>
  );
}
