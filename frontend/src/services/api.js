const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const TOKEN_KEY = "ti_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Permite que la app reaccione a un 401 (sesión expirada) sin acoplar al router.
function emitUnauthorized() {
  window.dispatchEvent(new CustomEvent("ti:unauthorized"));
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers, ...options });
  } catch (error) {
    console.error("Error de red al conectar con el backend:", error);
    throw new Error(
      "No se pudo conectar con el backend. Verifica que la API esté levantada en http://127.0.0.1:8000."
    );
  }

  if (response.status === 401) {
    emitUnauthorized();
    throw new Error("Sesión expirada. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || body.message || JSON.stringify(body);
    } catch {
      try {
        message = await response.text();
      } catch {
        /* noop */
      }
    }
    throw new Error(message || "Error de API");
  }

  if (response.status === 204) return null;
  return response.json();
}

async function downloadFile(path, filename) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("No se pudo exportar el archivo.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // --- Auth ---
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request("/auth/me"),
  changePassword: (newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    }),

  // --- Usuarios (admin) ---
  getUsers: () => request("/users"),
  createUser: (payload) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  // --- Dashboard / devices ---
  getDashboard: () => request("/dashboard"),
  getDevices: () => request("/devices"),
  getDevice: (id) => request(`/devices/${id}`),
  updateThresholds: (id, payload) =>
    request(`/devices/${id}/thresholds`, { method: "PUT", body: JSON.stringify(payload) }),
  requestDiagnostic: (id) => request(`/devices/${id}/request-diagnostic`, { method: "POST" }),
  sendWol: (id) => request(`/devices/${id}/wol`, { method: "POST" }),

  // --- Métricas extendidas ---
  getSnapshots: (id, range = "24h") => request(`/devices/${id}/snapshots?range=${range}`),
  getPrograms: (id) => request(`/devices/${id}/programs`),
  getPowerEvents: (id) => request(`/devices/${id}/power-events`),

  // --- Diagnósticos / alertas ---
  getDiagnostics: () => request("/diagnostics"),
  getAlerts: (params = "") => request(`/alerts${params}`),
  resolveAlert: (id, note) =>
    request(`/alerts/${id}/resolve`, { method: "POST", body: JSON.stringify({ note }) }),

  // --- Settings ---
  getSettings: () => request("/settings"),
  updateSettings: (payload) =>
    request("/settings", { method: "PUT", body: JSON.stringify(payload) }),

  // --- Inventario ---
  getCategories: () => request("/inventory/categories"),
  createCategory: (payload) =>
    request("/inventory/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id, payload) =>
    request(`/inventory/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/inventory/categories/${id}`, { method: "DELETE" }),
  getItems: (query = "") => request(`/inventory/items${query}`),
  getItem: (id) => request(`/inventory/items/${id}`),
  createItem: (payload) =>
    request("/inventory/items", { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (id, payload) =>
    request(`/inventory/items/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteItem: (id) => request(`/inventory/items/${id}`, { method: "DELETE" }),
  getItemHistory: (id) => request(`/inventory/items/${id}/history`),
  exportInventory: (categoryId) =>
    downloadFile(
      `/inventory/export${categoryId ? `?category=${categoryId}` : ""}`,
      "inventario.xlsx"
    ),
  importInventory: async (categoryId, file) => {
    const token = getToken();
    const form = new FormData();
    form.append("category_id", categoryId);
    form.append("file", file);
    const response = await fetch(`${API_BASE}/inventory/import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || "No se pudo importar el archivo.");
    }
    return response.json();
  },
};
