import { useEffect, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";

export const STATUS_OPTIONS = [
  ["active", "Activo"],
  ["in_repair", "En reparación"],
  ["retired", "Retirado"],
  ["lost", "Perdido"],
];

const emptyForm = {
  category_id: "",
  name: "",
  serial_number: "",
  brand: "",
  model: "",
  status: "active",
  location: "",
  assigned_to: "",
  purchase_date: "",
  warranty_until: "",
  notes: "",
};

export default function InventoryItemModal({ open, onClose, onSaved, categories, item, defaultCategoryId }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();
  const isEdit = !!item;

  useEffect(() => {
    if (item) {
      setForm({
        ...emptyForm,
        ...item,
        category_id: item.category_id,
        purchase_date: item.purchase_date || "",
        warranty_until: item.warranty_until || "",
      });
    } else {
      setForm({ ...emptyForm, category_id: defaultCategoryId || categories?.[0]?.id || "" });
    }
  }, [item, categories, open, defaultCategoryId]);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        category_id: Number(form.category_id),
        purchase_date: form.purchase_date || null,
        warranty_until: form.warranty_until || null,
      };
      if (isEdit) await api.updateItem(item.id, payload);
      else await api.createItem(payload);
      addToast(isEdit ? "Item actualizado" : "Item creado", "success");
      onSaved?.();
      onClose();
    } catch (err) {
      addToast(err.message || "No se pudo guardar el item", "error");
    } finally {
      setSaving(false);
    }
  };

  const selectedCategoryName = categories?.find((c) => String(c.id) === String(form.category_id))?.name || "";
  const isCorreos = selectedCategoryName === "Correos";

  const getLabel = (field) => {
    const labels = {
      name: {
        default: "Nombre *",
        Correos: "Correo Electrónico *",
        Licencias: "Nombre de Licencia *",
        Software: "Nombre del Software *",
      },
      serial_number: {
        default: "Nro de Serie",
        Correos: "Contraseña / Token de Acceso",
        Licencias: "Clave de Licencia (Product Key)",
        Software: "Clave de Activación",
      },
      brand: {
        default: "Marca",
        Correos: "Proveedor / Hosting (ej. Outlook, Gmail)",
        Licencias: "Editor / Fabricante (ej. Microsoft, Adobe)",
        Software: "Desarrollador / Distribuidor",
      },
      model: {
        default: "Modelo",
        Correos: "Licencia",
        Licencias: "Duración (ej. Anual, Perpetua)",
        Software: "Versión",
      },
      location: {
        default: "Ubicación",
        Correos: "Servidor / Host (ej. imap.gmail.com)",
        Licencias: "Entidad de Compra / Enlace",
        Software: "Ruta de Descarga / Servidor",
      },
      assigned_to: {
        default: "Asignado a",
        Correos: "Nombre (Usuario Asignado)",
        Licencias: "Usuario / PC Asignado",
        Software: "Usuario / PC Principal",
      },
      purchase_date: {
        default: "Fecha de compra",
        Correos: "Fecha de Creación",
        Licencias: "Fecha de Adquisición",
        Software: "Fecha de Instalación",
      },
      warranty_until: {
        default: "Garantía hasta",
        Correos: "Fecha de Expiración / Renovación",
        Licencias: "Fecha de Vencimiento / Expiración",
        Software: "Soporte Válido Hasta",
      },
    };

    return labels[field]?.[selectedCategoryName] || labels[field]?.default;
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-card relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">{isEdit ? "Editar Item" : "Nuevo Item"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          {isCorreos ? (
            <>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("name")}</label>
                <input className="input-field" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("assigned_to")}</label>
                <input className="input-field" value={form.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("model")}</label>
                <select className="input-field" value={form.model || ""} onChange={(e) => set("model", e.target.value)}>
                  <option value="" disabled>Seleccionar licencia…</option>
                  <option value="Microsoft 365 F1">Microsoft 365 F1</option>
                  <option value="Microsoft 365 Business Basic">Microsoft 365 Business Basic</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">Estado</label>
                <select className="input-field" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm text-dark-300 mb-1.5 block">Categoría *</label>
                <select className="input-field" required value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="" disabled>Seleccionar…</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("name")}</label>
                <input className="input-field" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">Categoría *</label>
                <select className="input-field" required value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="" disabled>Seleccionar…</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">Estado</label>
                <select className="input-field" value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("serial_number")}</label>
                <input className="input-field" value={form.serial_number || ""} onChange={(e) => set("serial_number", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("brand")}</label>
                <input className="input-field" value={form.brand || ""} onChange={(e) => set("brand", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("model")}</label>
                <input className="input-field" value={form.model || ""} onChange={(e) => set("model", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("location")}</label>
                <input className="input-field" value={form.location || ""} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("assigned_to")}</label>
                <input className="input-field" value={form.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("purchase_date")}</label>
                <input type="date" className="input-field" value={form.purchase_date || ""} onChange={(e) => set("purchase_date", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-dark-300 mb-1.5 block">{getLabel("warranty_until")}</label>
                <input type="date" className="input-field" value={form.warranty_until || ""} onChange={(e) => set("warranty_until", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm text-dark-300 mb-1.5 block">Notas</label>
                <textarea className="input-field" rows={3} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </>
          )}

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-dark-300 hover:text-white hover:bg-dark-700/50">Cancelar</button>
            <button type="submit" className="btn-primary px-6" disabled={saving}>
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
