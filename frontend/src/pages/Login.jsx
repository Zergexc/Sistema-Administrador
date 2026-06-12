import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";

const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export default function LoginPage() {
  const { user, login, logout, refreshUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Estados de Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados de Cambio de Contraseña Obligatorio
  const [forceChangePassword, setForceChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        if (user.needs_password_change) {
          setForceChangePassword(true);
          if (password) {
            setCurrentPassword(password);
          }
        } else {
          navigate("/", { replace: true });
        }
      }
    }
  }, [user, authLoading, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(username.trim(), password);
      if (u.needs_password_change) {
        setForceChangePassword(true);
        setCurrentPassword(password);
      } else {
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const onPasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) {
      setError("Las nuevas contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 4) {
      setError("La nueva contraseña debe tener al menos 4 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      await refreshUser();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    logout();
    setForceChangePassword(false);
    setUsername("");
    setPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4 relative overflow-hidden">
      {/* Glow de fondo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyber-purple/10 rounded-full blur-3xl" />

      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-600/30 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">TI Diagnostic</h1>
          <p className="text-dark-400 text-sm mt-1">Panel de Administración y Monitoreo</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {forceChangePassword ? (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-accent-500/10 border border-accent-500/20 rounded-xl p-3 text-center mb-2">
              <p className="text-xs font-semibold text-accent-400 uppercase tracking-wider">Cambio Obligatorio</p>
              <p className="text-xs text-dark-300 mt-1">Por seguridad, debes cambiar tu contraseña temporal antes de continuar.</p>
            </div>

            <form onSubmit={onPasswordChangeSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-dark-300 mb-1.5 block" htmlFor="current-pass">
                  Contraseña Actual (Temporal)
                </label>
                <div className="relative">
                  <input
                    id="current-pass"
                    type={showCurrentPassword ? "text" : "password"}
                    className="input-field pr-10 w-full"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-dark-300 mb-1.5 block" htmlFor="new-pass">
                  Nueva Contraseña
                </label>
                <div className="relative">
                  <input
                    id="new-pass"
                    type={showNewPassword ? "text" : "password"}
                    className="input-field pr-10 w-full"
                    placeholder="Nueva contraseña..."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-dark-300 mb-1.5 block" htmlFor="confirm-new-pass">
                  Confirmar Nueva Contraseña
                </label>
                <div className="relative">
                  <input
                    id="confirm-new-pass"
                    type={showConfirmPassword ? "text" : "password"}
                    className="input-field pr-10 w-full"
                    placeholder="Confirmar nueva contraseña..."
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button type="submit" className="btn-primary w-full justify-center py-3" disabled={loading}>
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Guardar y Acceder"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-dark-400 hover:text-white bg-dark-800/40 hover:bg-dark-800 transition-colors w-full text-center cursor-pointer"
                >
                  Volver al Login
                </button>
              </div>
            </form>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-dark-300 mb-1.5 block" htmlFor="login-user">
                Usuario
              </label>
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                className="input-field w-full"
                placeholder="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-dark-300 mb-1.5 block" htmlFor="login-pass">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input-field pr-10 w-full"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-3" disabled={loading}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Iniciar Sesión"
              )}
            </button>
          </form>
        )}


      </div>
    </div>
  );
}
