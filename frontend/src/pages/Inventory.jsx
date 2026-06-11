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
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [filters, setFilters] = useState({ status: "", search: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const loadCategories = useCallback(() => {
    api
      .getCategories()
      .then((cats) => {
        setCategories(cats);
        if (cats.length > 0 && !activeCategoryId) {
          setActiveCategoryId(cats[0].id);
        }
      })
      .catch(() => {});
  }, [activeCategoryId]);

  const loadItems = useCallback(() => {
    if (!activeCategoryId) return;
    const params = new URLSearchParams();
    params.set("category", activeCategoryId);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    api
      .getItems(qs ? `?${qs}` : "")
      .then(setItems)
      .catch((err) => setError(err.message || "No se pudo cargar el inventario."));
  }, [activeCategoryId, filters.status, filters.search]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const t = setTimeout(loadItems, 250); // debounce búsqueda
    return () => clearTimeout(t);
  }, [loadItems]);

  const openCreate = () => {
    setEditItem(null);
    setModalOpen(true);
  };

  const handleExport = async () => {
    try {
      await api.exportInventory(activeCategoryId || null);
    } catch (err) {
      addToast(err.message || "No se pudo exportar", "error");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!activeCategoryId) return addToast("Selecciona una categoría primero", "warning");
    try {
      const res = await api.importInventory(activeCategoryId, file);
      addToast(`Importado: ${res.created} creados, ${res.updated} actualizados`, "success");
      loadItems();
      loadCategories();
    } catch (err) {
      addToast(err.message || "No se pudo importar", "error");
    }
  };

  const [syncingGlpi, setSyncingGlpi] = useState(false);

  const handleGlpiSync = async () => {
    setSyncingGlpi(true);
    try {
      const res = await api.syncGlpi();
      if (res.status === "success") {
        addToast(
          `Sincronizado con GLPI: ${res.result.created} creados, ${res.result.updated} actualizados`,
          "success"
        );
        loadItems();
        loadCategories();
      } else {
        addToast("Error al sincronizar con GLPI", "error");
      }
    } catch (err) {
      addToast(err.message || "Error al sincronizar con GLPI", "error");
    } finally {
      setSyncingGlpi(false);
    }
  };

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState("id");
  const [sortDirection, setSortDirection] = useState("asc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    id: "",
    name: "",
    brand: "",
    model: "",
    serial_number: "",
    assigned_to: ""
  });

  // Limpiar selección, orden y filtros cuando cambia de categoría
  useEffect(() => {
    setSelectedIds(new Set());
    setColumnFilters({
      id: "",
      name: "",
      brand: "",
      model: "",
      serial_number: "",
      assigned_to: ""
    });
    setSortField("id");
    setSortDirection("asc");
    setShowAdvancedFilters(false);
  }, [activeCategoryId]);

  const handleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds((prev) => {
      const allSelected = items.length > 0 && items.every((it) => prev.has(it.id));
      const next = new Set(prev);
      if (allSelected) {
        items.forEach((it) => next.delete(it.id));
      } else {
        items.forEach((it) => next.add(it.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar los ${selectedIds.size} items seleccionados?`)) return;
    try {
      addToast("Eliminando items...", "info");
      await Promise.all(Array.from(selectedIds).map((id) => api.deleteItem(id)));
      addToast("Items eliminados correctamente", "success");
      setSelectedIds(new Set());
      loadItems();
      loadCategories();
    } catch (err) {
      addToast(err.message || "Error al eliminar algunos items", "error");
      loadItems();
      loadCategories();
    }
  };

  const handleBulkStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus) return;
    e.target.value = ""; // reset select
    try {
      addToast("Actualizando estados...", "info");
      await Promise.all(
        Array.from(selectedIds).map((id) => {
          const it = items.find((item) => item.id === id);
          if (!it) return Promise.resolve();
          return api.updateItem(id, {
            ...it,
            status: newStatus,
          });
        })
      );
      addToast("Estados actualizados correctamente", "success");
      setSelectedIds(new Set());
      loadItems();
    } catch (err) {
      addToast(err.message || "Error al actualizar algunos estados", "error");
      loadItems();
    }
  };

  const handleBulkQr = () => {
    navigate(`/inventory/labels?ids=${Array.from(selectedIds).join(",")}`);
  };

  const activeCategoryName = categories.find((c) => c.id === activeCategoryId)?.name || "";

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (labelText, colName) => {
    const isSorted = sortField === colName;
    return (
      <th 
        onClick={() => handleSort(colName)} 
        className="px-6 py-3.5 cursor-pointer hover:text-white select-none group/hdr"
      >
        <div className="flex items-center gap-1.5">
          <span>{labelText}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <svg className="w-3.5 h-3.5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            )
          ) : (
            <svg className="w-3 h-3 text-dark-500 group-hover/hdr:text-dark-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-8 8h16l-8-8zM12 20l-8-8h16l-8 8z"/>
            </svg>
          )}
        </div>
      </th>
    );
  };

  const filteredItems = items.filter((it) => {
    if (columnFilters.id && !String(it.id).toLowerCase().includes(columnFilters.id.toLowerCase())) return false;
    
    if (activeCategoryName === "Correos") {
      if (columnFilters.assigned_to && !String(it.assigned_to || "").toLowerCase().includes(columnFilters.assigned_to.toLowerCase())) return false;
      if (columnFilters.name && !String(it.name || "").toLowerCase().includes(columnFilters.name.toLowerCase())) return false;
    } else {
      if (columnFilters.name && !String(it.name || "").toLowerCase().includes(columnFilters.name.toLowerCase())) return false;
      if (columnFilters.brand && !String(it.brand || "").toLowerCase().includes(columnFilters.brand.toLowerCase())) return false;
      if (columnFilters.serial_number && !String(it.serial_number || "").toLowerCase().includes(columnFilters.serial_number.toLowerCase())) return false;
      if (columnFilters.assigned_to && !String(it.assigned_to || "").toLowerCase().includes(columnFilters.assigned_to.toLowerCase())) return false;
    }
    
    if (columnFilters.model && !String(it.model || "").toLowerCase().includes(columnFilters.model.toLowerCase())) return false;
    
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    
    if (sortField === "id") {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else {
      valA = String(valA || "").toLowerCase();
      valB = String(valB || "").toLowerCase();
    }
    
    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-16">
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
          <button onClick={() => navigate("/inventory/labels")} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700">
            Etiquetas QR
          </button>
          {isAdmin && (
            <>
              <button onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700">
                Importar
              </button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
              <button onClick={handleGlpiSync} disabled={syncingGlpi} className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white bg-dark-700/50 hover:bg-dark-700 flex items-center gap-1.5">
                {syncingGlpi ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-dark-300/30 border-t-white rounded-full animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  "Sincronizar GLPI"
                )}
              </button>
              <button onClick={openCreate} className="btn-primary">+ Nuevo Item</button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas de Categoría */}
      <div className="flex border-b border-dark-600 overflow-x-auto scrollbar-none gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeCategoryId === c.id
                ? "border-accent-500 text-white bg-accent-600/5"
                : "border-transparent text-dark-400 hover:text-white"
            }`}
            onClick={() => setActiveCategoryId(c.id)}
          >
            {c.name}
            <span className="text-xs bg-dark-700/60 px-2 py-0.5 rounded-md text-dark-300 font-normal">
              {c.item_count ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              className="input-field pl-10 w-full" 
              placeholder={activeCategoryName === "Correos" ? "Buscar por correo, nombre..." : "Buscar por nombre, serie, marca..."} 
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} 
            />
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {activeCategoryName === "Correos" && (
              <select 
                className="input-field w-full sm:w-56 cursor-pointer bg-dark-800" 
                value={columnFilters.model} 
                onChange={(e) => setColumnFilters(f => ({ ...f, model: e.target.value }))}
              >
                <option value="">Todas las licencias</option>
                <option value="Microsoft 365 F1">Microsoft 365 F1</option>
                <option value="Microsoft 365 Business Basic">Microsoft 365 Business Basic</option>
              </select>
            )}

            <select 
              className="input-field w-full sm:w-44 cursor-pointer bg-dark-800" 
              value={filters.status} 
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 flex items-center justify-center gap-2 ${
                showAdvancedFilters
                  ? "border-accent-500/50 bg-accent-500/10 text-white shadow-sm shadow-accent-500/10"
                  : "border-dark-600 bg-dark-700/30 text-dark-300 hover:text-white hover:bg-dark-700/50"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
              </svg>
              <span>Filtros avanzados</span>
            </button>
          </div>
        </div>

        {/* Panel colapsable de filtros avanzados */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 border-t border-dark-700/30 animate-fade-in">
            {activeCategoryName === "Correos" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">ID del Item</label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por ID..."
                    value={columnFilters.id}
                    onChange={(e) => setColumnFilters(f => ({ ...f, id: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">Nombre (Asignado)</label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por nombre..."
                    value={columnFilters.assigned_to}
                    onChange={(e) => setColumnFilters(f => ({ ...f, assigned_to: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">Correo</label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por correo..."
                    value={columnFilters.name}
                    onChange={(e) => setColumnFilters(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">Nombre / Activo</label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por nombre..."
                    value={columnFilters.name}
                    onChange={(e) => setColumnFilters(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">
                    {activeCategoryName === "Licencias" ? "Editor" : activeCategoryName === "Software" ? "Desarrollador" : "Marca"}
                  </label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por marca..."
                    value={columnFilters.brand}
                    onChange={(e) => setColumnFilters(f => ({ ...f, brand: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">
                    {activeCategoryName === "Software" ? "Versión" : "Modelo"}
                  </label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por modelo..."
                    value={columnFilters.model}
                    onChange={(e) => setColumnFilters(f => ({ ...f, model: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">
                    {activeCategoryName === "Licencias" ? "Clave (Product Key)" : "Nro Serie"}
                  </label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por serie..."
                    value={columnFilters.serial_number}
                    onChange={(e) => setColumnFilters(f => ({ ...f, serial_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 mb-1.5">Asignado a</label>
                  <input
                    className="input-field text-xs py-2 px-3 w-full bg-dark-800/40 border-dark-600/30 focus:border-accent-500/50"
                    placeholder="Filtrar por asignado..."
                    value={columnFilters.assigned_to}
                    onChange={(e) => setColumnFilters(f => ({ ...f, assigned_to: e.target.value }))}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && <div className="glass-card p-4 text-red-400 text-sm">{error}</div>}

      {/* Tabla */}
      <div className="glass-card overflow-hidden">
        {sortedItems.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 w-10 select-none">
                    <label className="relative flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={items.length > 0 && items.every((it) => selectedIds.has(it.id))}
                        onChange={handleSelectAll}
                      />
                      <div className="w-5 h-5 rounded-md border border-dark-500 bg-dark-900/60 peer-checked:bg-accent-500 peer-checked:border-accent-500 flex items-center justify-center transition-all duration-200 hover:border-accent-400 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/50 shadow-inner">
                        <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </label>
                  </th>
                  {activeCategoryName === "Correos" ? (
                    <>
                      {renderSortableHeader("ID", "id")}
                      {renderSortableHeader("Nombre", "assigned_to")}
                      {renderSortableHeader("Correo", "name")}
                      {renderSortableHeader("Licencia", "model")}
                      {renderSortableHeader("Estado", "status")}
                    </>
                  ) : (
                    <>
                      {renderSortableHeader("Nombre / Activo", "name")}
                      {renderSortableHeader(
                        activeCategoryName === "Licencias" ? "Editor" : 
                        activeCategoryName === "Software" ? "Desarrollador" : "Marca",
                        "brand"
                      )}
                      {renderSortableHeader(
                        activeCategoryName === "Software" ? "Versión" : "Modelo",
                        "model"
                      )}
                      {renderSortableHeader(
                        activeCategoryName === "Licencias" ? "Clave (Product Key)" : "Nro Serie",
                        "serial_number"
                      )}
                      {renderSortableHeader("Asignado a", "assigned_to")}
                      {renderSortableHeader("Estado", "status")}
                    </>
                  )}
                  <th className="px-6 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/20">
                {sortedItems.map((it) => (
                  <tr key={it.id} className={`group hover:bg-dark-700/20 cursor-pointer transition-colors duration-150 ${selectedIds.has(it.id) ? "bg-accent-950/20 hover:bg-accent-950/30" : ""}`} onClick={() => navigate(`/inventory/${it.id}`)}>
                    <td className="px-6 py-3.5 w-10 select-none" onClick={(e) => e.stopPropagation()}>
                      <label className="relative flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={selectedIds.has(it.id)}
                          onChange={() => handleSelectOne(it.id)}
                        />
                        <div className="w-5 h-5 rounded-md border border-dark-500 bg-dark-900/60 peer-checked:bg-accent-500 peer-checked:border-accent-500 flex items-center justify-center transition-all duration-200 hover:border-accent-400 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/50 shadow-inner">
                          <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </label>
                    </td>
                    {activeCategoryName === "Correos" ? (
                      <>
                        <td className="px-6 py-3.5 text-dark-300 font-mono text-xs">#{it.id}</td>
                        <td className="px-6 py-3.5 font-medium text-white group-hover:text-accent-400">{it.assigned_to || "—"}</td>
                        <td className="px-6 py-3.5 text-dark-300">{it.name}</td>
                        <td className="px-6 py-3.5 text-dark-300">{it.model || "—"}</td>
                        <td className="px-6 py-3.5"><span className={STATUS_BADGE[it.status] || "badge-info"}>{STATUS_LABEL[it.status] || it.status}</span></td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-3.5 font-medium text-white group-hover:text-accent-400">{it.name}</td>
                        <td className="px-6 py-3.5 text-dark-300">{it.brand || "—"}</td>
                        <td className="px-6 py-3.5 text-dark-300">{it.model || "—"}</td>
                        <td className="px-6 py-3.5 text-dark-400 font-mono text-xs">{it.serial_number || "—"}</td>
                        <td className="px-6 py-3.5 text-dark-300">{it.assigned_to || "—"}</td>
                        <td className="px-6 py-3.5"><span className={STATUS_BADGE[it.status] || "badge-info"}>{STATUS_LABEL[it.status] || it.status}</span></td>
                      </>
                    )}
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
            <p className="text-dark-400 font-medium">No hay items en esta categoría</p>
            {isAdmin && <button onClick={openCreate} className="btn-primary mt-4">+ Crear el primero</button>}
          </div>
        )}
      </div>

      {/* Barra de herramientas flotante de acciones en lote */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-card bg-dark-900/95 border-accent-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_10px_50px_rgba(99,102,241,0.25)] border-2 animate-slide-up w-[95vw] sm:max-w-2xl">
          <div className="flex items-center justify-between w-full sm:w-auto gap-3 border-b border-dark-700/50 pb-3 sm:pb-0 sm:border-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500"></span>
              </span>
              <span className="text-xs font-bold text-white whitespace-nowrap bg-accent-500/10 border border-accent-500/20 px-3 py-1.5 rounded-xl">
                {selectedIds.size} seleccionados
              </span>
            </div>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-dark-300 hover:text-white transition-colors flex items-center gap-1.5 bg-dark-800/40 hover:bg-dark-700/50 px-2.5 py-1.5 rounded-xl border border-dark-600/30">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Limpiar</span>
            </button>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button onClick={handleBulkQr} className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-semibold py-2 px-4 rounded-xl transition-all duration-200 shadow-md shadow-emerald-500/10 active:scale-95 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span>QR masivo</span>
            </button>
            {isAdmin && (
              <>
                <div className="relative flex items-center">
                  <svg className="absolute left-3 w-4 h-4 text-dark-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <select onChange={handleBulkStatusChange} className="input-field text-xs pl-9 pr-6 py-2 w-28 sm:w-36 rounded-xl cursor-pointer bg-dark-800/80 border-dark-600/50 hover:border-accent-500/50 transition-colors" defaultValue="">
                    <option value="" disabled>Estado...</option>
                    {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white text-xs font-semibold py-2 px-4 rounded-xl transition-all duration-200 shadow-md shadow-red-500/10 active:scale-95 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Eliminar</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <InventoryItemModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onSaved={() => { loadItems(); loadCategories(); }} 
        categories={categories} 
        item={editItem} 
        defaultCategoryId={activeCategoryId}
      />
    </div>
  );
}
