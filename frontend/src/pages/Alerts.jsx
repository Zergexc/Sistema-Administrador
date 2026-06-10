import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWsEvent } from "../hooks/useWsEvent";
import { api } from "../services/api";
import { formatDateTime, timeAgo } from "../utils/formatters";

const SEV_STYLE = {
  critical: "bg-red-500/15 border-red-500/30 text-red-400",
  warning: "bg-amber-500/15 border-amber-500/30 text-amber-400",
  info: "bg-blue-500/15 border-blue-500/30 text-blue-400",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("active"); // active | all
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(0);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const load = useCallback(() => {
    const params = filter === "active" ? "?active=true" : "";
    api
      .getAlerts(params)
      .then(setAlerts)
      .catch((err) => setError(err.message || "No se pudo cargar alertas."));
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useWsEvent((msg) => {
    if (["alert_created", "alert_resolved"].includes(msg.type)) load();
  });

  const resolve = async (id) => {
    setBusy(id);
    try {
      await api.resolveAlert(id, "Resuelto desde el panel");
      addToast("Alerta resuelta", "success");
      load();
    } catch (err) {
      addToast(err.message || "No se pudo resolver", "error");
    } finally {
      setBusy(0);
    }
  };

  if (error) {
    return <div className="glass-card p-8 text-center animate-fade-in"><p className="text-red-400 font-medium">{error}</p></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Alertas</h1>
          <p className="text-dark-400 text-sm mt-1">Historial y gestión de alertas del sistema</p>
        </div>
        <div className="flex gap-1 bg-dark-700/40 p-1 rounded-lg self-start">
          {[["active", "Activas"], ["all", "Todas"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${filter === k ? "bg-accent-600/30 text-accent-300" : "text-dark-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {alerts.length ? (
          <div className="divide-y divide-dark-700/30">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-4 p-5 hover:bg-dark-700/20 transition-colors">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex-shrink-0 ${SEV_STYLE[a.severity] || SEV_STYLE.warning}`}>
                  {a.code}
                </span>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/devices/${a.device_id}`)}>
                  <p className="text-sm font-medium text-dark-100 truncate">{a.message}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[11px] text-dark-500">Equipo #{a.device_id}</span>
                    <span className="text-[11px] text-dark-500">Creada {timeAgo(a.created_at)}</span>
                    {!a.is_active && a.resolved_at && (
                      <span className="text-[11px] text-emerald-400">
                        ✓ Resuelta {formatDateTime(a.resolved_at)} por {a.resolved_by || "—"}
                      </span>
                    )}
                  </div>
                </div>
                {a.is_active ? (
                  isAdmin && (
                    <button onClick={() => resolve(a.id)} disabled={busy === a.id}
                      className="btn-success !py-1.5 !px-3 text-xs flex-shrink-0">
                      {busy === a.id ? "..." : "Resolver"}
                    </button>
                  )
                ) : (
                  <span className="badge-online flex-shrink-0">Resuelta</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-dark-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-dark-400 font-medium">{filter === "active" ? "Sin alertas activas 🎉" : "No hay alertas registradas"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
