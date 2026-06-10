import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import InventoryItemModal, { STATUS_OPTIONS } from "../components/InventoryItemModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";

const STATUS_BADGE = {
  active: "badge-online",
  in_repair: "badge-warning",
  retired: "badge-offline",
  lost: "badge-offline",
};
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS);

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", status: "", search: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const loadItems = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    api
      .getItems(qs ? `?${qs}` : "")
      .then(setItems)
      .catch((err) => setError(err.message || "No se pudo cargar el inventario."));
  }, [filters]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(loadItems, 250); // debounce búsqueda
    return () => clearTimeout(t);
  }, [loadItems]);

  const openCreate = () => { setEditItem(null); setModalOpen(true); };

  const handleExport = async () => {
    try {
      await api.exportInventory(filters.category || null);
    } catch (err) {
      addToast(err.message || "No se pudo exportar", "error");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const categoryId = filters.category || categories[0]?.id;
    if (!categoryId) return addToast("Crea una categoría primero", "warning");
    try {
      const res = await api.importInventory(categoryId, file);
      addToast(`Importado: ${res.created} creados, ${res.updated} actualizados`, "success");
      loadItems();
    } catch (err) {
      addToast(err.message || "No se pudo importar", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-dark-400 text-sm mt-1">Gestión de equipos y activos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("/inventory/categories")} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700">
            Categorías
          </button>
          <button onClick={handleExport} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700">
            Exportar Excel
          </button>
          {isAdmin && (
            <>
              <button onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700">
                Importar
              </button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
              <button onClick={openCreate} className="btn-primary">+ Nuevo Item</button>
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
        <input className="input-field flex-1" placeholder="Buscar por nombre, serie, marca..." value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        <select className="input-field sm:w-48" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input-field sm:w-44" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {error && <div className="glass-card p-4 text-red-400 text-sm">{error}</div>}

      {/* Tabla */}
      <div className="glass-card overflow-hidden">
        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Nombre</th>
                  <th className="px-6 py-3.5">Categoría</th>
                  <th className="px-6 py-3.5">Serie</th>
                  <th className="px-6 py-3.5">Asignado</th>
                  <th className="px-6 py-3.5">Estado</th>
                  <th className="px-6 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/20">
                {items.map((it) => (
                  <tr key={it.id} className="group hover:bg-dark-700/20 cursor-pointer" onClick={() => navigate(`/inventory/${it.id}`)}>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-white group-hover:text-accent-400">{it.name}</p>
                      <p className="text-[11px] text-dark-500">{[it.brand, it.model].filter(Boolean).join(" ") || "—"}</p>
                    </td>
                    <td className="px-6 py-3.5 text-dark-300">{it.category_name}</td>
                    <td className="px-6 py-3.5 text-dark-400 font-mono text-xs">{it.serial_number || "—"}</td>
                    <td className="px-6 py-3.5 text-dark-300">{it.assigned_to || "—"}</td>
                    <td className="px-6 py-3.5"><span className={STATUS_BADGE[it.status] || "badge-info"}>{STATUS_LABEL[it.status] || it.status}</span></td>
                    <td className="px-6 py-3.5 text-right">
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); setEditItem(it); setModalOpen(true); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-400 hover:text-accent-300 text-sm font-medium">
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-dark-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-dark-400 font-medium">No hay items en el inventario</p>
            {isAdmin && <button onClick={openCreate} className="btn-primary mt-4">+ Crear el primero</button>}
          </div>
        )}
      </div>

      <InventoryItemModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={loadItems} categories={categories} item={editItem} />
    </div>
  );
}
