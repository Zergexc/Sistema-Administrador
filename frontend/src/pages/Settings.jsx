import { useEffect, useState } from "react";
import { api } from "../services/api";

const defaultForm = {
  report_interval_seconds: 120,
  disk_min_free_gb: 15,
  offline_after_minutes: 5,
  ui_theme: "default",
};

const fields = [
  {
    key: "report_interval_seconds",
    label: "Intervalo de Reporte",
    description: "Frecuencia en segundos con la que el agente envía reportes al servidor",
    suffix: "segundos",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "disk_min_free_gb",
    label: "Espacio Mínimo en Disco",
    description: "Genera una alerta si el disco tiene menos de este espacio libre",
    suffix: "GB",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 4v3h8V4M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
  {
    key: "offline_after_minutes",
    label: "Tiempo para Offline",
    description: "Marca un equipo como offline si no reporta después de este tiempo",
    suffix: "minutos",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728m2.828-9.9a5 5 0 017.072 0m-7.072 7.072a5 5 0 007.072 0M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    api
      .getSettings()
      .then((result) => {
        if (mounted) setForm(result);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "No se pudo cargar configuración.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      await api.updateSettings({
        ...form,
        report_interval_seconds: Number(form.report_interval_seconds),
        disk_min_free_gb: Number(form.disk_min_free_gb),
        offline_after_minutes: Number(form.offline_after_minutes),
      });
      setMessage("Configuración guardada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar configuración.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-dark-400 text-sm mt-1">Ajusta los parámetros del sistema de monitoreo</p>
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
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-slide-up">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={onSubmit} className="space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="glass-card-hover p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-400 flex-shrink-0">
                {field.icon}
              </div>
              <div className="flex-1">
                <label className="text-sm font-semibold text-white" htmlFor={`setting-${field.key}`}>
                  {field.label}
                </label>
                <p className="text-xs text-dark-500 mt-0.5 mb-3">{field.description}</p>
                <div className="relative">
                  <input
                    id={`setting-${field.key}`}
                    type="number"
                    className="input-field pr-20"
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-dark-500 font-medium pointer-events-none">
                    {field.suffix}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2 px-8"
            disabled={loading}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Guardar Configuración
          </button>
        </div>
      </form>
    </div>
  );
}
