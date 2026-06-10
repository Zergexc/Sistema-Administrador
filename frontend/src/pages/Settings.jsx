import { useEffect, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";

const numericFields = [
  { key: "report_interval_seconds", label: "Intervalo de Reporte", description: "Frecuencia (segundos) con la que el agente reporta al servidor", suffix: "segundos" },
  { key: "disk_min_free_gb", label: "Espacio Mínimo en Disco", description: "Genera alerta si el disco baja de este espacio libre", suffix: "GB" },
  { key: "offline_after_minutes", label: "Tiempo para Offline", description: "Marca un equipo offline si no reporta tras este tiempo", suffix: "minutos" },
];

const defaultForm = {
  report_interval_seconds: 120,
  disk_min_free_gb: 15,
  offline_after_minutes: 5,
  ui_theme: "default",
  notifications_enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  smtp_from: "",
  alert_email_to: "",
  webhook_url: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setForm({ ...defaultForm, ...s, smtp_password: "" }))
      .catch((err) => addToast(err.message || "No se pudo cargar configuración", "error"));
  }, [addToast]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.updateSettings({
        ...form,
        report_interval_seconds: Number(form.report_interval_seconds),
        disk_min_free_gb: Number(form.disk_min_free_gb),
        offline_after_minutes: Number(form.offline_after_minutes),
        smtp_port: form.smtp_port ? Number(form.smtp_port) : null,
      });
      addToast("Configuración guardada exitosamente", "success");
      set("smtp_password", "");
    } catch (err) {
      addToast(err.message || "No se pudo guardar configuración", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-dark-400 text-sm mt-1">Ajusta los parámetros del sistema de monitoreo</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Umbrales globales */}
        <div className="glass-card p-6 space-y-5">
          <h3 className="text-lg font-semibold text-white">Monitoreo</h3>
          {numericFields.map((field) => (
            <div key={field.key}>
              <label className="text-sm font-semibold text-white" htmlFor={`setting-${field.key}`}>{field.label}</label>
              <p className="text-xs text-dark-500 mt-0.5 mb-2">{field.description}</p>
              <div className="relative">
                <input id={`setting-${field.key}`} type="number" className="input-field pr-20" value={form[field.key]}
                  onChange={(e) => set(field.key, e.target.value)} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-dark-500 font-medium pointer-events-none">{field.suffix}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Notificaciones */}
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Notificaciones de Alertas Críticas</h3>
              <p className="text-xs text-dark-500 mt-0.5">Email y/o webhook (Teams/Slack) ante alertas críticas</p>
            </div>
            <button type="button" onClick={() => set("notifications_enabled", !form.notifications_enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.notifications_enabled ? "bg-accent-600" : "bg-dark-600"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.notifications_enabled ? "translate-x-6" : ""}`} />
            </button>
          </div>

          {form.notifications_enabled && (
            <div className="space-y-4 pt-2 border-t border-dark-700/40">
              <p className="text-xs font-semibold text-dark-300 uppercase tracking-wider pt-2">SMTP (Email)</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Servidor SMTP</label>
                  <input type="text" className="input-field" placeholder="smtp.gmail.com" value={form.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Puerto</label>
                  <input type="number" className="input-field" placeholder="587" value={form.smtp_port || ""} onChange={(e) => set("smtp_port", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Usuario</label>
                  <input type="text" className="input-field" autoComplete="off" value={form.smtp_user || ""} onChange={(e) => set("smtp_user", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Contraseña</label>
                  <input type="password" className="input-field" placeholder="(sin cambios)" autoComplete="new-password" value={form.smtp_password || ""} onChange={(e) => set("smtp_password", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Remitente (From)</label>
                  <input type="text" className="input-field" placeholder="ti@empresa.com" value={form.smtp_from || ""} onChange={(e) => set("smtp_from", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-dark-300 mb-1.5 block">Destinatarios (coma)</label>
                  <input type="text" className="input-field" placeholder="soporte@empresa.com" value={form.alert_email_to || ""} onChange={(e) => set("alert_email_to", e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-dark-300">
                <input type="checkbox" checked={!!form.smtp_use_tls} onChange={(e) => set("smtp_use_tls", e.target.checked)} className="accent-accent-600 w-4 h-4" />
                Usar TLS
              </label>

              <p className="text-xs font-semibold text-dark-300 uppercase tracking-wider pt-2">Webhook</p>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">URL de Webhook (Teams/Slack)</label>
                <input type="text" className="input-field" placeholder="https://hooks.slack.com/..." value={form.webhook_url || ""} onChange={(e) => set("webhook_url", e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary px-8" disabled={loading}>
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Guardar Configuración"}
          </button>
        </div>
      </form>
    </div>
  );
}
