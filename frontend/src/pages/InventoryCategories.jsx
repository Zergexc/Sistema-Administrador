import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";

export default function InventoryCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const load = () => api.getCategories().then(setCategories).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.createCategory({ name: form.name.trim(), description: form.description || null, fields_schema: [] });
      addToast("Categoría creada", "success");
      setForm({ name: "", description: "" });
      load();
    } catch (err) {
      addToast(err.message || "No se pudo crear", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cat) => {
    if (!window.confirm(`¿Eliminar "${cat.name}"? Se eliminarán también sus ${cat.item_count} items.`)) return;
    try {
      await api.deleteCategory(cat.id);
      addToast("Categoría eliminada", "success");
      load();
    } catch (err) {
      addToast(err.message || "No se pudo eliminar", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <button onClick={() => navigate("/inventory")} className="text-sm text-dark-500 hover:text-accent-400 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Volver a Inventario
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">Categorías de Inventario</h1>
        <p className="text-dark-400 text-sm mt-1">Organiza los activos por tipo</p>
      </div>

      {isAdmin && (
        <form onSubmit={create} className="glass-card p-6 flex flex-col sm:flex-row gap-3">
          <input className="input-field flex-1" placeholder="Nombre de la categoría" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="input-field flex-1" placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <button type="submit" className="btn-primary" disabled={saving}>Agregar</button>
        </form>
      )}

      <div className="glass-card overflow-hidden">
        <div className="divide-y divide-dark-700/30">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-xs text-dark-500">{c.description || "Sin descripción"}</p>
              </div>
              <span className="badge-info">{c.item_count} items</span>
              {isAdmin && (
                <button onClick={() => remove(c)} className="text-dark-500 hover:text-red-400 p-1.5" title="Eliminar">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
          ))}
          {!categories.length && <p className="text-dark-500 text-sm text-center py-10">Sin categorías</p>}
        </div>
      </div>
    </div>
  );
}
