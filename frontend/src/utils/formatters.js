// Utilidades de formato reutilizables (Fase 2).

export function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export function formatUptime(seconds) {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatGB(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 1024) return `${(value / 1024).toFixed(2)} TB`;
  return `${Number(value).toFixed(1)} GB`;
}

// ¿Está online el equipo? (último reporte dentro de los últimos 5 min)
export function isDeviceOnline(device, windowMs = 300000) {
  if (!device?.last_seen) return false;
  return Date.now() - new Date(device.last_seen).getTime() <= windowMs;
}
