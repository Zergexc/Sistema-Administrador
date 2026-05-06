import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AlertBadge from "../components/AlertBadge";
import { api } from "../services/api";

function formatUptime(seconds) {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-700/30 last:border-0">
      <span className="text-sm text-dark-400">{label}</span>
      <span className={`text-sm font-medium text-dark-100 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function ProgressRing({ percentage, color, label, value }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" className="text-dark-700" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{percentage}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs text-dark-500">{label}</p>
        <p className="text-sm font-medium text-dark-200">{value}</p>
      </div>
    </div>
  );
}

const Spinner = () => (
  <div className="flex items-center justify-center py-32 animate-fade-in">
    <div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
  </div>
);

export default function DeviceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    let mounted = true;
    api
      .getDevice(id)
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "No se pudo cargar el detalle.");
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  if (error && !data) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  if (!data) return <Spinner />;

  const device = data.device || {};
  const payload = data.latest_payload || {};
  const isOnline = Date.now() - new Date(device.last_seen).getTime() <= 300000;

  const ramUsedPct =
    device.ram_total_gb && device.ram_free_gb
      ? Math.round(((device.ram_total_gb - device.ram_free_gb) / device.ram_total_gb) * 100)
      : 0;

  const diskTotalEstimate = payload.disk_c_free_gb ? payload.disk_c_free_gb + 100 : 500;
  const diskUsedPct = payload.disk_c_free_gb
    ? Math.max(0, Math.min(100, Math.round(((diskTotalEstimate - payload.disk_c_free_gb) / diskTotalEstimate) * 100)))
    : 0;

  const runAction = async (actionName, action) => {
    setMessage("");
    setError("");
    setActionLoading(actionName);
    try {
      const result = await action();
      setMessage(result.message || "Operación completada.");
    } catch (err) {
      setError(err.message || "No se pudo completar la operación.");
    } finally {
      setActionLoading("");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb & Header */}
      <div>
        <button
          onClick={() => navigate("/devices")}
          className="text-sm text-dark-500 hover:text-accent-400 transition-colors mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver a Equipos
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-600/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{device.hostname}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={isOnline ? "badge-online" : "badge-offline"}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-red-400"}`} />
                  {isOnline ? "Online" : "Offline"}
                </span>
                <span className="text-xs text-dark-500">{device.os_version}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              disabled={!!actionLoading}
              onClick={() => runAction("diag", () => api.requestDiagnostic(id))}
            >
              {actionLoading === "diag" ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
              Solicitar Diagnóstico
            </button>
            <button
              type="button"
              className="btn-success flex items-center gap-2"
              disabled={!!actionLoading}
              onClick={() => runAction("wol", () => api.sendWol(id))}
            >
              {actionLoading === "wol" ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Encender WOL
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 animate-slide-up">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-emerald-300">{message}</p>
        </div>
      )}
      {error && data && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-slide-up">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Alerts */}
      {data.active_alerts?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.active_alerts.map((alert, i) => (
            <AlertBadge key={`${alert.code}-${i}`} text={alert.message} severity={alert.severity || "warning"} />
          ))}
        </div>
      )}

      {/* Resource Usage Rings */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Uso de Recursos</h3>
        <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-16">
          <ProgressRing
            percentage={ramUsedPct}
            color={ramUsedPct > 80 ? "text-red-400" : ramUsedPct > 60 ? "text-amber-400" : "text-accent-400"}
            label="RAM Usada"
            value={`${(device.ram_total_gb - (device.ram_free_gb || 0)).toFixed(1)} / ${device.ram_total_gb} GB`}
          />
          <ProgressRing
            percentage={diskUsedPct}
            color={diskUsedPct > 85 ? "text-red-400" : diskUsedPct > 70 ? "text-amber-400" : "text-emerald-400"}
            label="Disco C:"
            value={`${device.disk_c_free_gb || payload.disk_c_free_gb || "—"} GB libres`}
          />
        </div>
      </div>

      {/* Device Info + Top Processes */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Device Information */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Información del Equipo</h3>
          <div>
            <InfoRow label="CPU" value={device.cpu_model || payload.cpu_model} />
            <InfoRow label="RAM Total" value={device.ram_total_gb ? `${device.ram_total_gb} GB` : null} />
            <InfoRow label="RAM Libre" value={device.ram_free_gb ? `${device.ram_free_gb} GB` : null} />
            <InfoRow label="Disco C: Libre" value={device.disk_c_free_gb ? `${device.disk_c_free_gb} GB` : (payload.disk_c_free_gb ? `${payload.disk_c_free_gb} GB` : null)} />
            <InfoRow label="Sistema Operativo" value={device.os_version} />
            <InfoRow label="Dirección IP" value={device.ip_address} mono />
            <InfoRow label="MAC Address" value={device.mac_address} mono />
            <InfoRow label="Usuario" value={device.current_user} />
            <InfoRow label="Tiempo Encendido" value={formatUptime(device.uptime_seconds || payload.uptime_seconds)} />
            <InfoRow label="Internet" value={device.internet_ok ? "✓ Conectado" : "✗ Sin conexión"} />
            <InfoRow label="GLPI Agent" value={device.glpi_status} />
            <InfoRow label="Versión Agente" value={device.agent_version} />
          </div>
        </div>

        {/* Top Processes */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Procesos (RAM)</h3>
          {payload.top_processes?.length ? (
            <div className="space-y-3">
              {payload.top_processes.map((proc, i) => {
                const maxRam = payload.top_processes[0]?.ram_mb || 1;
                const pct = Math.round((proc.ram_mb / maxRam) * 100);
                const colors = ["from-accent-500 to-accent-600", "from-cyber-purple to-accent-500", "from-cyber-blue to-accent-400", "from-emerald-500 to-cyan-500", "from-amber-500 to-orange-500"];
                return (
                  <div key={`${proc.name}-${i}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-dark-700 flex items-center justify-center text-[10px] font-bold text-dark-400">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-dark-200 truncate max-w-[180px]">{proc.name}</span>
                      </div>
                      <span className="text-xs font-mono text-dark-400">{proc.ram_mb} MB</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill bg-gradient-to-r ${colors[i] || colors[0]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-dark-500 text-sm">Sin datos de procesos disponibles</p>
              <p className="text-dark-600 text-xs mt-1">Se actualizará con el próximo reporte del agente</p>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics History */}
      {data.diagnostics_history?.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Historial de Diagnósticos</h3>
          <div className="space-y-2">
            {data.diagnostics_history.map((diag) => (
              <div key={diag.id} className="flex items-center gap-4 p-3 rounded-xl bg-dark-700/30">
                <div className="w-2 h-2 rounded-full bg-accent-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-200 truncate">{diag.summary || "Diagnóstico"}</p>
                </div>
                <span className="text-xs text-dark-500 flex-shrink-0">
                  {new Date(diag.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
