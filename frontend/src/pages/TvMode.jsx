import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { timeAgo } from "../utils/formatters";

// Vista a pantalla completa para un monitor fijo del área de TI.
// Sin sidebar, tipografía grande, auto-refresh por WebSocket + polling.

const STATE_STYLES = {
  ok: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  warning: "bg-amber-500/15 border-amber-500/40 text-amber-400",
  critical: "bg-red-500/15 border-red-500/40 text-red-400 animate-pulse-slow",
  offline: "bg-dark-700/40 border-dark-600/50 text-dark-500",
};
const STATE_LABEL = { ok: "OK", warning: "Advertencia", critical: "Crítico", offline: "Offline" };

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <p className="text-4xl font-bold text-white font-mono tabular-nums">
        {now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="text-sm text-dark-400 capitalize">
        {now.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
      </p>
    </div>
  );
}

function BigStat({ label, value, color }) {
  return (
    <div className="glass-card px-6 py-4 flex-1 min-w-[140px]">
      <p className="text-xs text-dark-400 uppercase tracking-wide">{label}</p>
      <p className={`text-4xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

export default function TvModePage() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.getDashboard().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000); // fallback al WS
    return () => clearInterval(interval);
  }, [load]);

  const { connected } = useWebSocket((msg) => {
    if (["device_update", "device_registered", "alert_created", "alert_resolved", "diagnostic_new"].includes(msg.type)) {
      load();
    }
  });

  // Salir con la tecla ESC.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (!data) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
      </div>
    );
  }

  const alerts = data.recent_alerts || [];
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="min-h-screen bg-dark-900 p-6 lg:p-10 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-600/30">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Centro de Monitoreo TI</h1>
            <p className="text-sm text-dark-400 flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {connected ? "En vivo" : "Actualizando por intervalos"}
              <button onClick={() => navigate("/")} className="text-dark-500 hover:text-accent-400 ml-3 text-xs">
                (ESC para salir)
              </button>
            </p>
          </div>
        </div>
        <Clock />
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-8">
        <BigStat label="Equipos" value={data.total_devices} color="text-white" />
        <BigStat label="Online" value={data.online_devices} color="text-emerald-400" />
        <BigStat label="Offline" value={data.offline_devices} color={data.offline_devices ? "text-red-400" : "text-dark-300"} />
        <BigStat label="Con alertas" value={data.devices_with_alerts || 0} color={data.devices_with_alerts ? "text-amber-400" : "text-dark-300"} />
        <BigStat label="Críticas" value={critical} color={critical ? "text-red-400" : "text-dark-300"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Heatmap grande */}
        <div className="glass-card p-6 xl:col-span-2">
          <h3 className="text-xl font-semibold text-white mb-5">Estado de Equipos</h3>
          {data.grid?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.grid.map((d) => (
                <div key={d.id} className={`p-4 rounded-xl border ${STATE_STYLES[d.state]}`}>
                  <div className="flex items-center justify-between">
                    <span className="w-2.5 h-2.5 rounded-full bg-current" />
                    {d.cpu_percent != null && (
                      <span className="text-xs font-mono opacity-80">{Math.round(d.cpu_percent)}% CPU</span>
                    )}
                  </div>
                  <p className="text-base font-semibold text-white truncate mt-3">{d.hostname}</p>
                  <p className="text-xs opacity-80 mt-0.5">{STATE_LABEL[d.state]}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-500 text-center py-12">No hay equipos registrados</p>
          )}
        </div>

        {/* Alertas */}
        <div className="glass-card p-6">
          <h3 className="text-xl font-semibold text-white mb-5">Alertas Activas</h3>
          {alerts.length ? (
            <div className="space-y-3">
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className="p-3 rounded-xl bg-dark-700/40">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${a.severity === "critical" ? "bg-red-400 animate-pulse" : "bg-amber-400"}`} />
                    <span className={a.severity === "critical" ? "badge-offline" : "badge-warning"}>{a.code}</span>
                    <span className="text-[11px] text-dark-500 ml-auto">{timeAgo(a.created_at)}</span>
                  </div>
                  <p className="text-sm text-dark-200">{a.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-dark-400">Todo en orden</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
