import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";

// Hoja de etiquetas QR imprimibles para activos de inventario y equipos del agente.
// Selecciona items/equipos, previsualiza la hoja y usa "Imprimir" (Ctrl+P).
// El CSS @media print oculta todo menos las etiquetas (.print-area en index.css).

export default function InventoryLabelsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [activeTab, setActiveTab] = useState("inventory"); // "inventory" o "devices"
  
  // Guardamos las selecciones usando prefijos para evitar colisiones de IDs:
  // "item:123" para inventario, "device:456" para dispositivos.
  const [selected, setSelected] = useState(() => {
    const ids = (params.get("ids") || "").split(",").filter(Boolean);
    return new Set(ids.map(id => `item:${id}`));
  });

  // key → objectURL del PNG del QR (el key es "item:id" o "device:id")
  const [qrUrls, setQrUrls] = useState({});
  const urlsRef = useRef({});

  useEffect(() => {
    api.getItems().then(setItems).catch(() => {});
    api.getDevices().then(setDevices).catch(() => {});
    api.getCategories().then(setCategories).catch(() => {});
    
    const urls = urlsRef.current;
    return () => {
      Object.values(urls).forEach((u) => {
        if (u && u !== "pending") {
          URL.revokeObjectURL(u);
        }
      });
    };
  }, []);

  // Baja los QR de los items o dispositivos seleccionados que aún no se tienen.
  useEffect(() => {
    selected.forEach((key) => {
      if (urlsRef.current[key]) return;
      urlsRef.current[key] = "pending";
      const [type, idStr] = key.split(":");
      const id = Number(idStr);
      const promise = type === "item" ? api.getItemQrUrl(id) : api.getDeviceQrUrl(id);
      
      promise
        .then((url) => {
          urlsRef.current[key] = url;
          setQrUrls((prev) => ({ ...prev, [key]: url }));
        })
        .catch(() => {
          delete urlsRef.current[key];
        });
    });
  }, [selected]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (category) list = list.filter((i) => String(i.category_id) === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.serial_number?.toLowerCase().includes(q) ||
          i.assigned_to?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, category, search]);

  const filteredDevices = useMemo(() => {
    let list = devices;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.hostname?.toLowerCase().includes(q) ||
          d.mac_address?.toLowerCase().includes(q) ||
          d.ip_address?.toLowerCase().includes(q) ||
          d.current_user?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [devices, search]);

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (activeTab === "inventory") {
        filteredItems.forEach((i) => next.add(`item:${i.id}`));
      } else {
        filteredDevices.forEach((d) => next.add(`device:${d.id}`));
      }
      return next;
    });
  };

  // Mapeamos los elementos seleccionados para la vista previa
  const selectedList = useMemo(() => {
    const list = [];
    items.forEach((item) => {
      const key = `item:${item.id}`;
      if (selected.has(key)) {
        list.push({
          key,
          id: item.id,
          name: item.name,
          serial_number: item.serial_number,
          subtitle: `${item.category_name || "Sin Categoría"}`,
          typeLabel: "Inventario",
          qrUrl: qrUrls[key],
        });
      }
    });
    devices.forEach((dev) => {
      const key = `device:${dev.id}`;
      if (selected.has(key)) {
        list.push({
          key,
          id: dev.id,
          name: dev.hostname,
          serial_number: dev.mac_address || dev.ip_address,
          subtitle: `${dev.os_version || "Windows PC"} · ${dev.ip_address || "Sin IP"}`,
          typeLabel: "Equipo Agente",
          qrUrl: qrUrls[key],
        });
      }
    });
    return list;
  }, [items, devices, selected, qrUrls]);

  const readyToPrint = selectedList.length > 0 && selectedList.every((i) => i.qrUrl && i.qrUrl !== "pending");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <button onClick={() => navigate("/inventory")} className="text-sm text-dark-500 hover:text-accent-400 flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Volver a Inventario
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Etiquetas QR</h1>
            <p className="text-dark-400 text-sm mt-1">
              Selecciona los activos o equipos registrados, imprime la hoja y pega cada etiqueta en el equipo físico.
            </p>
          </div>
          <button className="btn-primary" disabled={!readyToPrint} onClick={() => window.print()}>
            Imprimir {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>

      {/* Tabs de Selección */}
      <div className="flex border-b border-dark-600">
        <button
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 ${
            activeTab === "inventory"
              ? "border-accent-500 text-white"
              : "border-transparent text-dark-400 hover:text-white"
          }`}
          onClick={() => {
            setActiveTab("inventory");
            setSearch("");
          }}
        >
          Inventario
        </button>
        <button
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 ${
            activeTab === "devices"
              ? "border-accent-500 text-white"
              : "border-transparent text-dark-400 hover:text-white"
          }`}
          onClick={() => {
            setActiveTab("devices");
            setSearch("");
          }}
        >
          Equipos Registrados (Agente)
        </button>
      </div>

      {/* Selección */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            className="input-field flex-1"
            placeholder={activeTab === "inventory" ? "Buscar por nombre, serie o asignado..." : "Buscar por hostname, MAC, IP o usuario..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {activeTab === "inventory" && (
            <select className="input-field sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn-success" onClick={selectAllFiltered}>Seleccionar visibles</button>
          <button className="text-sm text-dark-400 hover:text-white px-2" onClick={() => setSelected(new Set())}>Limpiar todo</button>
        </div>

        {activeTab === "inventory" ? (
          filteredItems.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {filteredItems.map((i) => {
                const key = `item:${i.id}`;
                return (
                  <label key={key} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    selected.has(key) ? "bg-accent-600/15 border-accent-500/40" : "bg-dark-700/30 border-transparent hover:border-dark-600"
                  }`}>
                    <input type="checkbox" className="accent-accent-500" checked={selected.has(key)} onChange={() => toggle(key)} />
                    <div className="min-w-0">
                      <p className="text-sm text-dark-100 font-medium truncate">{i.name}</p>
                      <p className="text-[11px] text-dark-500 truncate">
                        {i.category_name}{i.serial_number ? ` · ${i.serial_number}` : ""}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-dark-500 text-sm text-center py-6">No hay items de inventario que coincidan</p>
          )
        ) : (
          filteredDevices.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {filteredDevices.map((d) => {
                const key = `device:${d.id}`;
                return (
                  <label key={key} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    selected.has(key) ? "bg-accent-600/15 border-accent-500/40" : "bg-dark-700/30 border-transparent hover:border-dark-600"
                  }`}>
                    <input type="checkbox" className="accent-accent-500" checked={selected.has(key)} onChange={() => toggle(key)} />
                    <div className="min-w-0">
                      <p className="text-sm text-dark-100 font-medium truncate">{d.hostname}</p>
                      <p className="text-[11px] text-dark-500 truncate">
                        {d.ip_address || "Sin IP"}{d.mac_address ? ` · ${d.mac_address}` : ""}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-dark-500 text-sm text-center py-6">No hay equipos registrados que coincidan</p>
          )
        )}
      </div>

      {/* Hoja de etiquetas (lo único visible al imprimir) */}
      {selectedList.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">
            Vista previa de la hoja ({selectedList.length} etiqueta{selectedList.length !== 1 ? "s" : ""})
          </h3>
          <div className="print-area bg-white rounded-2xl p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {selectedList.map((i) => (
                <div key={i.key} className="border border-gray-300 rounded-lg p-3 flex items-center gap-3 break-inside-avoid">
                  {i.qrUrl ? (
                    <img src={i.qrUrl} alt={`QR ${i.name}`} className="w-20 h-20 flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded animate-pulse" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 leading-tight break-words">{i.name}</p>
                    {i.serial_number && <p className="text-[10px] text-gray-600 font-mono mt-1 break-all">S/N: {i.serial_number}</p>}
                    <p className="text-[10px] text-gray-500 mt-0.5">{i.subtitle} · #{i.id}</p>
                    <span className="text-[8px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-semibold">{i.typeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

