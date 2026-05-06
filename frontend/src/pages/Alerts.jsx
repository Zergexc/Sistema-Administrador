import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function AlertsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    api
      .getDiagnostics()
      .then((result) => {
        if (mounted) setItems(Array.isArray(result) ? result : result?.value || []);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "No se pudo cargar alertas.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Alertas y Diagnósticos</h1>
        <p className="text-dark-400 text-sm mt-1">Historial de reportes y alertas del sistema</p>
      </div>

      {/* Content */}
      <div className="glass-card overflow-hidden">
        {items.length > 0 ? (
          <div className="divide-y divide-dark-700/30">
            {items.map((item) => {
              const hasAlerts = item.alerts_detected && item.alerts_detected !== "OK" && item.alerts_detected.length > 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-5 hover:bg-dark-700/30 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/devices/${item.device_id}`)}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    hasAlerts
                      ? "bg-amber-500/15 border border-amber-500/20"
                      : "bg-emerald-500/15 border border-emerald-500/20"
                  }`}>
                    {hasAlerts ? (
                      <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-200 group-hover:text-white transition-colors truncate">
                      {item.summary || "Diagnóstico"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-dark-500">Dispositivo #{item.device_id}</span>
                      {hasAlerts ? (
                        <span className="text-[11px] text-amber-400 font-medium">⚠ Alertas detectadas</span>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-medium">✓ Sin alertas</span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-dark-500">{timeAgo(item.created_at)}</p>
                    <p className="text-[10px] text-dark-600 mt-0.5">
                      {item.created_at ? new Date(item.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : ""}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-dark-600 group-hover:text-accent-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-dark-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-dark-400 font-medium">No hay registros aún</p>
            <p className="text-dark-500 text-sm mt-1">Los diagnósticos aparecerán cuando el agente envíe reportes</p>
          </div>
        )}
      </div>
    </div>
  );
}
