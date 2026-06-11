import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AlertBadge from "../components/AlertBadge";
import MetricsChart from "../components/charts/MetricsChart";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWsEvent } from "../hooks/useWsEvent";
import { api } from "../services/api";
import { formatDateTime, formatGB, formatUptime, isDeviceOnline, timeAgo } from "../utils/formatters";

const TABS = [
  ["resumen", "Resumen"],
  ["rendimiento", "Rendimiento"],
  ["procesos", "Procesos"],
  ["software", "Software"],
  ["energia", "Energía"],
  ["discos", "Discos"],
  ["red", "Red"],
  ["cambios", "Cambios"],
  ["historial", "Historial"],
];

// Acciones remotas que el panel puede enviar al agente.
const REMOTE_ACTIONS = {
  restart: {
    label: "Reiniciar",
    confirm: "Se reiniciará el equipo. El usuario verá un aviso con cuenta regresiva.",
    btn: "btn-primary",
    hasDelay: true,
  },
  shutdown: {
    label: "Apagar",
    confirm: "Se apagará el equipo. El usuario verá un aviso con cuenta regresiva.",
    btn: "btn-danger",
    hasDelay: true,
  },
  logoff: {
    label: "Cerrar sesión",
    confirm: "Se cerrarán todas las sesiones de usuario abiertas en el equipo.",
    btn: "btn-danger",
    hasDelay: false,
  },
  message: {
    label: "Enviar mensaje",
    confirm: "El mensaje aparecerá como aviso emergente en el equipo.",
    btn: "btn-primary",
    hasDelay: false,
  },
};

const CHANGE_LABEL = {
  program_installed: { label: "Programa instalado", dot: "bg-emerald-400", color: "text-emerald-400" },
  program_removed: { label: "Programa desinstalado", dot: "bg-red-400", color: "text-red-400" },
  program_updated: { label: "Programa actualizado", dot: "bg-accent-400", color: "text-accent-400" },
  ram_changed: { label: "Cambio de RAM", dot: "bg-amber-400", color: "text-amber-400" },
  cpu_changed: { label: "Cambio de CPU", dot: "bg-amber-400", color: "text-amber-400" },
  storage_changed: { label: "Cambio de almacenamiento", dot: "bg-cyan-400", color: "text-cyan-400" },
};

const TASK_LABEL = {
  diagnostic: "Diagnóstico",
  restart: "Reinicio",
  shutdown: "Apagado",
  logoff: "Cierre de sesión",
  message: "Mensaje",
};

const Spinner = () => (
  <div className="flex items-center justify-center py-32 animate-fade-in">
    <div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
  </div>
);

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-700/30 last:border-0 gap-4">
      <span className="text-sm text-dark-400 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium text-dark-100 text-right truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function ProgressRing({ percentage, color, label, value }) {
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (percentage / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" className="text-dark-700" strokeWidth="6" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" className={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease-out" }} />
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

const EVENT_LABEL = {
  startup: { label: "Encendido", color: "text-emerald-400", dot: "bg-emerald-400" },
  shutdown: { label: "Apagado", color: "text-dark-300", dot: "bg-dark-400" },
  unexpected_shutdown: { label: "Apagado inesperado", color: "text-red-400", dot: "bg-red-400" },
  sleep: { label: "Suspensión", color: "text-amber-400", dot: "bg-amber-400" },
  wake: { label: "Reanudación", color: "text-accent-400", dot: "bg-accent-400" },
};

export default function DeviceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [tab, setTab] = useState("resumen");

  // Datos por pestaña (carga diferida)
  const [snapshots, setSnapshots] = useState([]);
  const [range, setRange] = useState("24h");
  const [programs, setPrograms] = useState(null);
  const [programSearch, setProgramSearch] = useState("");
  const [powerEvents, setPowerEvents] = useState(null);
  const [thresholds, setThresholds] = useState({ disk: "", ram: "" });
  const [changes, setChanges] = useState(null);
  const [actionsHistory, setActionsHistory] = useState(null);

  // Modal de confirmación de acción remota.
  const [pendingAction, setPendingAction] = useState(null); // clave de REMOTE_ACTIONS
  const [actionMessage, setActionMessage] = useState("");
  const [actionDelay, setActionDelay] = useState(60);

  const load = useCallback(() => {
    api
      .getDevice(id)
      .then((d) => {
        setData(d);
        setThresholds({
          disk: d.device.alert_disk_min_free_gb ?? "",
          ram: d.device.alert_ram_min_free_gb ?? "",
        });
      })
      .catch((err) => setError(err.message || "No se pudo cargar el detalle."));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useWsEvent((msg) => {
    const did = msg.device?.id || msg.alert?.device_id || msg.diagnostic?.device_id;
    if (did && String(did) === String(id)) load();
  });

  // Carga diferida según pestaña
  useEffect(() => {
    if (tab === "rendimiento") api.getSnapshots(id, range).then(setSnapshots).catch(() => setSnapshots([]));
  }, [tab, range, id]);
  useEffect(() => {
    if (tab === "software" && programs === null) api.getPrograms(id).then(setPrograms).catch(() => setPrograms([]));
  }, [tab, id, programs]);
  useEffect(() => {
    if (tab === "energia" && powerEvents === null) api.getPowerEvents(id).then(setPowerEvents).catch(() => setPowerEvents([]));
  }, [tab, id, powerEvents]);
  useEffect(() => {
    if (tab === "cambios" && changes === null) api.getDeviceChanges(id).then(setChanges).catch(() => setChanges([]));
  }, [tab, id, changes]);
  useEffect(() => {
    if (tab === "historial" && actionsHistory === null) api.getDeviceActions(id).then(setActionsHistory).catch(() => setActionsHistory([]));
  }, [tab, id, actionsHistory]);

  const filteredPrograms = useMemo(() => {
    if (!programs) return [];
    if (!programSearch) return programs;
    const q = programSearch.toLowerCase();
    return programs.filter((p) => p.name?.toLowerCase().includes(q) || p.publisher?.toLowerCase().includes(q));
  }, [programs, programSearch]);

  if (error && !data) {
    return <div className="glass-card p-8 text-center animate-fade-in"><p className="text-red-400 font-medium">{error}</p></div>;
  }
  if (!data) return <Spinner />;

  const device = data.device || {};
  const payload = data.latest_payload || {};
  const online = isDeviceOnline(device);

  const ramUsedPct = device.ram_total_gb && device.ram_free_gb != null
    ? Math.round(((device.ram_total_gb - device.ram_free_gb) / device.ram_total_gb) * 100) : 0;
  const diskUsedPct = device.disk_used_percent != null ? Math.round(device.disk_used_percent) : 0;

  const runAction = async (name, action, successMsg) => {
    setActionLoading(name);
    try {
      const result = await action();
      addToast(result?.message || successMsg || "Operación completada.", "success");
    } catch (err) {
      addToast(err.message || "No se pudo completar la operación.", "error");
    } finally {
      setActionLoading("");
    }
  };

  const resolveAlert = (alertId) =>
    runAction(`resolve-${alertId}`, () => api.resolveAlert(alertId, "Resuelto desde el panel"), "Alerta resuelta").then(load);

  const saveThresholds = () =>
    runAction("thresholds", () =>
      api.updateThresholds(id, {
        alert_disk_min_free_gb: thresholds.disk === "" ? null : Number(thresholds.disk),
        alert_ram_min_free_gb: thresholds.ram === "" ? null : Number(thresholds.ram),
      }), "Umbrales guardados").then(load);

  const openAction = (key) => {
    setActionMessage("");
    setActionDelay(60);
    setPendingAction(key);
  };

  const submitAction = () =>
    runAction(`act-${pendingAction}`, async () => {
      await api.sendAction(id, pendingAction, {
        message: actionMessage.trim() || null,
        delaySeconds: Number(actionDelay) || 60,
      });
      setPendingAction(null);
      setActionsHistory(null); // refresca el historial de acciones
      return { message: `${REMOTE_ACTIONS[pendingAction].label}: enviado al agente (se ejecuta en segundos).` };
    });

  const topProcesses = payload.top_processes || [];
  const network = payload.network || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <button onClick={() => navigate("/devices")} className="text-sm text-dark-500 hover:text-accent-400 transition-colors mb-3 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Volver a Equipos
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-600/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{device.hostname}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={online ? "badge-online" : "badge-offline"}>
                  <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
                  {online ? "Online" : "Offline"}
                </span>
                <span className="text-xs text-dark-500">{device.os_version}</span>
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={!!actionLoading} onClick={() => runAction("diag", () => api.requestDiagnostic(id), "Diagnóstico solicitado")}>
                {actionLoading === "diag" ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Solicitar Diagnóstico"}
              </button>
              <button type="button" className="btn-success" disabled={!!actionLoading} onClick={() => runAction("wol", () => api.sendWol(id), "WOL enviado")}>
                {actionLoading === "wol" ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Encender WOL"}
              </button>
              {Object.entries(REMOTE_ACTIONS).map(([key, meta]) => (
                <button key={key} type="button" className={meta.btn} disabled={!!actionLoading || !online}
                  title={!online ? "El equipo está offline" : meta.label}
                  onClick={() => openAction(key)}>
                  {meta.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertas activas */}
      {data.active_alerts?.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex flex-col gap-2">
            {data.active_alerts.map((a) => (
              <div key={a.id || a.code} className="flex items-center justify-between gap-3 flex-wrap">
                <AlertBadge text={a.message} severity={a.severity || "warning"} />
                {isAdmin && a.id && (
                  <button onClick={() => resolveAlert(a.id)} disabled={actionLoading === `resolve-${a.id}`}
                    className="text-xs text-accent-400 hover:text-accent-300 font-medium">
                    Marcar como resuelta
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="glass-card p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === key ? "bg-accent-600/20 text-accent-300" : "text-dark-400 hover:text-white hover:bg-dark-700/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* === Resumen === */}
      {tab === "resumen" && (
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Uso de Recursos</h3>
            <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-16">
              <ProgressRing percentage={ramUsedPct} color={ramUsedPct > 80 ? "text-red-400" : ramUsedPct > 60 ? "text-amber-400" : "text-accent-400"}
                label="RAM Usada" value={`${(device.ram_total_gb - (device.ram_free_gb || 0)).toFixed(1)} / ${device.ram_total_gb} GB`} />
              <ProgressRing percentage={diskUsedPct} color={diskUsedPct > 85 ? "text-red-400" : diskUsedPct > 70 ? "text-amber-400" : "text-emerald-400"}
                label="Disco" value={device.disk_total_gb ? formatGB(device.disk_total_gb) : `${device.disk_c_free_gb || "—"} GB libres`} />
              <ProgressRing percentage={Math.round(device.cpu_percent || 0)} color={(device.cpu_percent || 0) > 80 ? "text-red-400" : (device.cpu_percent || 0) > 60 ? "text-amber-400" : "text-cyan-400"}
                label="CPU" value={`${device.cpu_cores || "—"} núcleos`} />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Información del Equipo</h3>
              <InfoRow label="CPU" value={device.cpu_model} />
              <InfoRow label="Frecuencia" value={device.cpu_freq_mhz ? `${device.cpu_freq_mhz} MHz` : null} />
              <InfoRow label="RAM Total" value={device.ram_total_gb ? `${device.ram_total_gb} GB` : null} />
              <InfoRow label="RAM Libre" value={device.ram_free_gb ? `${device.ram_free_gb} GB` : null} />
              <InfoRow label="Disco Total" value={formatGB(device.disk_total_gb)} />
              <InfoRow label="Dirección IP" value={device.ip_address} mono />
              <InfoRow label="MAC Address" value={device.mac_address} mono />
              <InfoRow label="Usuario" value={device.current_user} />
              <InfoRow label="Tiempo Encendido" value={formatUptime(device.uptime_seconds)} />
              <InfoRow label="Internet" value={device.internet_ok ? "✓ Conectado" : "✗ Sin conexión"} />
              <InfoRow label="GLPI Agent" value={device.glpi_status} />
              <InfoRow label="Última conexión" value={timeAgo(device.last_seen)} />
            </div>

            {isAdmin && (
              <div className="glass-card p-6 self-start">
                <h3 className="text-lg font-semibold text-white mb-1">Umbrales de Alerta</h3>
                <p className="text-xs text-dark-500 mb-4">Sobreescriben los umbrales globales para este equipo. Vacío = usar global.</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-dark-300 mb-1.5 block">Disco mínimo libre (GB)</label>
                    <input type="number" className="input-field" placeholder="Global" value={thresholds.disk}
                      onChange={(e) => setThresholds((t) => ({ ...t, disk: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm text-dark-300 mb-1.5 block">RAM mínima libre (GB)</label>
                    <input type="number" step="0.1" className="input-field" placeholder="1.5" value={thresholds.ram}
                      onChange={(e) => setThresholds((t) => ({ ...t, ram: e.target.value }))} />
                  </div>
                  <button className="btn-primary" disabled={actionLoading === "thresholds"} onClick={saveThresholds}>
                    Guardar umbrales
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === Rendimiento === */}
      {tab === "rendimiento" && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-white">Rendimiento histórico</h3>
            <div className="flex gap-1 bg-dark-700/40 p-1 rounded-lg">
              {["24h", "7d", "30d"].map((r) => (
                <button key={r} onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-medium ${range === r ? "bg-accent-600/30 text-accent-300" : "text-dark-400 hover:text-white"}`}>
                  {r === "24h" ? "24 horas" : r === "7d" ? "7 días" : "30 días"}
                </button>
              ))}
            </div>
          </div>
          <MetricsChart data={snapshots} range={range} />
        </div>
      )}

      {/* === Procesos === */}
      {tab === "procesos" && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Procesos</h3>
          {topProcesses.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase">
                    <th className="py-2 pr-4">Proceso</th>
                    <th className="py-2 pr-4">PID</th>
                    <th className="py-2 pr-4">RAM</th>
                    <th className="py-2">CPU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/20">
                  {topProcesses.map((p, i) => (
                    <tr key={`${p.name}-${i}`} className="hover:bg-dark-700/20">
                      <td className="py-2.5 pr-4 text-dark-100 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4 text-dark-400 font-mono">{p.pid ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-dark-300 font-mono">{p.ram_mb} MB</td>
                      <td className="py-2.5 text-dark-300 font-mono">{p.cpu_percent != null ? `${p.cpu_percent}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin datos de procesos</p>}
        </div>
      )}

      {/* === Software === */}
      {tab === "software" && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-white">Software Instalado {programs ? `(${programs.length})` : ""}</h3>
            <input type="text" className="input-field w-full sm:w-64" placeholder="Buscar programa..." value={programSearch} onChange={(e) => setProgramSearch(e.target.value)} />
          </div>
          {programs === null ? <Spinner /> : filteredPrograms.length ? (
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-dark-800">
                  <tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase">
                    <th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">Versión</th><th className="py-2">Publicador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/20">
                  {filteredPrograms.map((p) => (
                    <tr key={p.id} className="hover:bg-dark-700/20">
                      <td className="py-2.5 pr-4 text-dark-100">{p.name}</td>
                      <td className="py-2.5 pr-4 text-dark-400 font-mono">{p.version || "—"}</td>
                      <td className="py-2.5 text-dark-400">{p.publisher || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin programas registrados. Se actualiza en el escaneo completo del agente.</p>}
        </div>
      )}

      {/* === Energía === */}
      {tab === "energia" && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Historial de Energía</h3>
          {powerEvents === null ? <Spinner /> : powerEvents.length ? (
            <div className="relative pl-4 border-l border-dark-700/50 space-y-4">
              {powerEvents.map((e) => {
                const meta = EVENT_LABEL[e.event_type] || { label: e.event_type, color: "text-dark-300", dot: "bg-dark-400" };
                return (
                  <div key={e.id} className="relative">
                    <span className={`absolute -left-[1.30rem] top-1 w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-dark-500">{formatDateTime(e.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin eventos de energía registrados</p>}
        </div>
      )}

      {/* === Discos === */}
      {tab === "discos" && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Discos</h3>
          {data.disks?.length ? (
            <div className="space-y-5">
              {data.disks.map((d) => (
                <div key={d.mount_point}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-dark-200 font-medium font-mono">{d.mount_point}</span>
                    <span className="text-dark-400">{formatGB(d.free_gb)} libres de {formatGB(d.total_gb)}</span>
                  </div>
                  <div className="progress-bar">
                    <div className={`progress-fill ${(d.percent_used || 0) > 85 ? "bg-red-500" : (d.percent_used || 0) > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${d.percent_used || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin información de discos</p>}
        </div>
      )}

      {/* === Red === */}
      {tab === "red" && (
        <div className="space-y-5">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Configuración de Red</h3>
            <InfoRow label="IP principal" value={device.ip_address} mono />
            <InfoRow label="Gateway" value={network.gateway || payload.gateway} mono />
            <InfoRow label="Servidores DNS" value={(network.dns_servers || payload.dns_servers || []).join(", ")} mono />
          </div>
          {network.interfaces?.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Interfaces</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase">
                    <th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">IP</th><th className="py-2 pr-4">MAC</th><th className="py-2">Velocidad</th>
                  </tr></thead>
                  <tbody className="divide-y divide-dark-700/20">
                    {network.interfaces.map((iface, i) => (
                      <tr key={i} className="hover:bg-dark-700/20">
                        <td className="py-2.5 pr-4 text-dark-100">{iface.name}</td>
                        <td className="py-2.5 pr-4 text-dark-300 font-mono">{iface.ip}</td>
                        <td className="py-2.5 pr-4 text-dark-400 font-mono">{iface.mac || "—"}</td>
                        <td className="py-2.5 text-dark-400">{iface.speed_mbps ? `${iface.speed_mbps} Mbps` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Cambios === */}
      {tab === "cambios" && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-1">Cambios Detectados</h3>
          <p className="text-xs text-dark-500 mb-4">
            Hardware y software comparado entre reportes del agente. El software se revisa en cada escaneo completo.
          </p>
          {changes === null ? <Spinner /> : changes.length ? (
            <div className="relative pl-4 border-l border-dark-700/50 space-y-4 max-h-[60vh] overflow-y-auto">
              {changes.map((c) => {
                const meta = CHANGE_LABEL[c.change_type] || { label: c.change_type, dot: "bg-dark-400", color: "text-dark-300" };
                return (
                  <div key={c.id} className="relative">
                    <span className={`absolute -left-[1.30rem] top-1 w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <span className={`text-xs font-semibold uppercase ${meta.color}`}>{meta.label}</span>
                        <p className="text-sm text-dark-200 mt-0.5">{c.details}</p>
                      </div>
                      <span className="text-xs text-dark-500 flex-shrink-0">{formatDateTime(c.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin cambios detectados. Aparecerán cuando se instale/desinstale software o cambie el hardware.</p>}
        </div>
      )}

      {/* === Historial === */}
      {tab === "historial" && (
        <div className="space-y-5">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Acciones Remotas</h3>
            {actionsHistory === null ? <Spinner /> : actionsHistory.length ? (
              <div className="space-y-2">
                {actionsHistory.map((t) => (
                  <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl bg-dark-700/30 flex-wrap">
                    <span className={t.status === "done" ? "badge-online" : "badge-warning"}>
                      {t.status === "done" ? "Ejecutada" : "Pendiente"}
                    </span>
                    <p className="text-sm text-dark-200 flex-1">{TASK_LABEL[t.task_type] || t.task_type}</p>
                    <span className="text-xs text-dark-500 flex-shrink-0">{formatDateTime(t.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-dark-500 text-sm text-center py-4">Sin acciones enviadas a este equipo</p>}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Historial de Diagnósticos</h3>
            {data.diagnostics_history?.length ? (
              <div className="space-y-2">
                {data.diagnostics_history.map((diag) => (
                  <div key={diag.id} className="flex items-center gap-4 p-3 rounded-xl bg-dark-700/30">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${diag.alerts_detected ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <p className="text-sm text-dark-200 truncate flex-1">{diag.summary || "Diagnóstico"}</p>
                    <span className="text-xs text-dark-500 flex-shrink-0">{formatDateTime(diag.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-dark-500 text-sm text-center py-8">Sin historial</p>}
          </div>
        </div>
      )}

      {/* === Modal de confirmación de acción remota === */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setPendingAction(null); }}>
          <div className="glass-card p-6 w-full max-w-md animate-slide-up">
            <h3 className="text-lg font-semibold text-white mb-2">
              {REMOTE_ACTIONS[pendingAction].label} — {device.hostname}
            </h3>
            <p className="text-sm text-dark-400 mb-4">{REMOTE_ACTIONS[pendingAction].confirm}</p>

            {REMOTE_ACTIONS[pendingAction].hasDelay && (
              <div className="mb-4">
                <label className="text-sm text-dark-300 mb-1.5 block">Cuenta regresiva (segundos)</label>
                <input type="number" min="0" max="3600" className="input-field" value={actionDelay}
                  onChange={(e) => setActionDelay(e.target.value)} />
              </div>
            )}
            {pendingAction === "message" ? (
              <div className="mb-4">
                <label className="text-sm text-dark-300 mb-1.5 block">Mensaje para el usuario *</label>
                <textarea className="input-field min-h-[90px]" placeholder="Ej: El equipo se reiniciará a las 5 PM por mantenimiento."
                  value={actionMessage} onChange={(e) => setActionMessage(e.target.value)} />
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-sm text-dark-300 mb-1.5 block">Aviso para el usuario (opcional)</label>
                <input type="text" className="input-field" placeholder="Texto del aviso en pantalla"
                  value={actionMessage} onChange={(e) => setActionMessage(e.target.value)} />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button className="text-sm text-dark-400 hover:text-white px-4 py-2" onClick={() => setPendingAction(null)}>
                Cancelar
              </button>
              <button className={REMOTE_ACTIONS[pendingAction].btn}
                disabled={!!actionLoading || (pendingAction === "message" && !actionMessage.trim())}
                onClick={submitAction}>
                {actionLoading === `act-${pendingAction}` ? "Enviando..." : `Confirmar ${REMOTE_ACTIONS[pendingAction].label.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
