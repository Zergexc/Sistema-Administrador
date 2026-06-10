import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InventoryItemModal, { STATUS_OPTIONS } from "../components/InventoryItemModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";
import { formatDateTime } from "../utils/formatters";

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS);
const ACTION_LABEL = {
  created: "Creado",
  updated: "Actualizado",
  assigned: "Asignado",
  unassigned: "Desasignado",
  status_change: "Cambio de estado",
};

const Spinner = () => (
  <div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" /></div>
);

function Field({ label, value, mono }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-dark-700/30 last:border-0 gap-4">
      <span className="text-sm text-dark-400">{label}</span>
      <span className={`text-sm font-medium text-dark-100 text-right ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

export default function InventoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const [item, setItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.getItem(id).then(setItem).catch((e) => setError(e.message));
    api.getItemHistory(id).then(setHistory).catch(() => {});
  }, [id]);

  useEffect(() => { load(); api.getCategories().then(setCategories).catch(() => {}); }, [load]);

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar este item del inventario?")) return;
    try {
      await api.deleteItem(id);
      addToast("Item eliminado", "success");
      navigate("/inventory");
    } catch (err) {
      addToast(err.message || "No se pudo eliminar", "error");
    }
  };

  if (error) return <div className="glass-card p-8 text-center"><p className="text-red-400">{error}</p></div>;
  if (!item) return <Spinner />;

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={() => navigate("/inventory")} className="text-sm text-dark-500 hover:text-accent-400 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Volver a Inventario
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{item.name}</h1>
          <p className="text-dark-400 text-sm mt-1">{item.category_name}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setEditOpen(true)} className="btn-primary">Editar</button>
            <button onClick={handleDelete} className="btn-danger">Eliminar</button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Detalles</h3>
          <Field label="Estado" value={STATUS_LABEL[item.status] || item.status} />
          <Field label="Nro de Serie" value={item.serial_number} mono />
          <Field label="Marca" value={item.brand} />
          <Field label="Modelo" value={item.model} />
          <Field label="Ubicación" value={item.location} />
          <Field label="Asignado a" value={item.assigned_to} />
          <Field label="Equipo vinculado" value={item.device_id ? `#${item.device_id}` : null} />
          <Field label="Fecha de compra" value={item.purchase_date} />
          <Field label="Garantía hasta" value={item.warranty_until} />
          {item.notes && <Field label="Notas" value={item.notes} />}
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Historial</h3>
          {history.length ? (
            <div className="relative pl-4 border-l border-dark-700/50 space-y-4">
              {history.map((h) => (
                <div key={h.id} className="relative">
                  <span className="absolute -left-[1.30rem] top-1 w-2.5 h-2.5 rounded-full bg-accent-400" />
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm font-medium text-dark-100">{ACTION_LABEL[h.action] || h.action}</span>
                    <span className="text-xs text-dark-500">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.details && <p className="text-xs text-dark-400 mt-0.5">{h.details}</p>}
                  {h.changed_by && <p className="text-[11px] text-dark-600 mt-0.5">por {h.changed_by}</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-dark-500 text-sm text-center py-8">Sin historial</p>}
        </div>
      </div>

      <InventoryItemModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={load} categories={categories} item={item} />
    </div>
  );
}
