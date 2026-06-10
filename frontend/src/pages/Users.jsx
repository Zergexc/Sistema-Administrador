import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { api } from "../services/api";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "viewer" });
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const { user: me } = useAuth();
  const { addToast } = useToast();

  const load = () => api.getUsers().then(setUsers).catch((e) => addToast(e.message, "error"));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createUser({ ...form, username: form.username.trim() });
      addToast("Usuario creado", "success");
      setForm({ username: "", password: "", full_name: "", role: "viewer" });
      load();
    } catch (err) {
      addToast(err.message || "No se pudo crear", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const changeRole = async (u, role) => {
    try {
      await api.updateUser(u.id, { role });
      load();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    try {
      await api.deleteUser(u.id);
      addToast("Usuario eliminado", "success");
      load();
    } catch (err) {
      addToast(err.message || "No se pudo eliminar", "error");
    }
  };

  const changeMyPassword = async (e) => {
    e.preventDefault();
    if (pwd.length < 4) return addToast("Mínimo 4 caracteres", "warning");
    try {
      await api.changePassword(pwd);
      addToast("Tu contraseña fue actualizada", "success");
      setPwd("");
    } catch (err) {
      addToast(err.message || "No se pudo cambiar", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuarios</h1>
        <p className="text-dark-400 text-sm mt-1">Gestión de accesos al panel</p>
      </div>

      <form onSubmit={create} className="glass-card p-6 grid sm:grid-cols-4 gap-3">
        <input className="input-field" placeholder="Usuario" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
        <input className="input-field" placeholder="Nombre completo" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        <input className="input-field" type="password" placeholder="Contraseña" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
        <div className="flex gap-2">
          <select className="input-field flex-1" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="viewer">Visualizador</option>
            <option value="admin">Administrador</option>
          </select>
          <button type="submit" className="btn-primary" disabled={saving}>+</button>
        </div>
      </form>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700/30 text-left text-xs text-dark-400 uppercase tracking-wider">
              <th className="px-6 py-3.5">Usuario</th><th className="px-6 py-3.5">Rol</th><th className="px-6 py-3.5">Estado</th><th className="px-6 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/20">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-dark-700/20">
                <td className="px-6 py-3.5">
                  <p className="font-medium text-white">{u.username} {u.id === me?.id && <span className="text-[10px] text-accent-400">(tú)</span>}</p>
                  <p className="text-[11px] text-dark-500">{u.full_name || "—"}</p>
                </td>
                <td className="px-6 py-3.5">
                  <select className="bg-dark-700/50 border border-dark-600/50 rounded-lg px-2 py-1 text-xs text-dark-200" value={u.role}
                    onChange={(e) => changeRole(u, e.target.value)} disabled={u.id === me?.id}>
                    <option value="viewer">Visualizador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td className="px-6 py-3.5">
                  <button onClick={() => toggleActive(u)} disabled={u.id === me?.id}
                    className={u.is_active ? "badge-online" : "badge-offline"}>
                    {u.is_active ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-6 py-3.5 text-right">
                  {u.id !== me?.id && (
                    <button onClick={() => remove(u)} className="text-dark-500 hover:text-red-400 text-sm">Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cambiar mi contraseña */}
      <form onSubmit={changeMyPassword} className="glass-card p-6 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 w-full">
          <h3 className="text-base font-semibold text-white mb-1">Cambiar mi contraseña</h3>
          <input className="input-field" type="password" placeholder="Nueva contraseña" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">Actualizar</button>
      </form>
    </div>
  );
}
