const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const API_KEY = import.meta.env.VITE_API_KEY || "";

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers,
      ...options,
    });
  } catch (error) {
    console.error("Error de red al conectar con el backend:", error);
    throw new Error(
      "No se pudo conectar con el backend. Verifica que la API este levantada en http://127.0.0.1:8000."
    );
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || body.message || JSON.stringify(body);
    } catch {
      message = await response.text();
    }
    console.error("Error de API:", message);
    throw new Error(message || "Error de API");
  }
  return response.json();
}

export const api = {
  getDashboard: () => request("/dashboard"),
  getDevices: () => request("/devices"),
  getDevice: (id) => request(`/devices/${id}`),
  requestDiagnostic: (id) => request(`/devices/${id}/request-diagnostic`, { method: "POST" }),
  sendWol: (id) => request(`/devices/${id}/wol`, { method: "POST" }),
  getDiagnostics: () => request("/diagnostics"),
  getSettings: () => request("/settings"),
  updateSettings: (payload) =>
    request("/settings", { method: "PUT", body: JSON.stringify(payload) }),
};
