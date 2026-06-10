import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Valida el token guardado al montar la app.
  useEffect(() => {
    let mounted = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((u) => mounted && setUser(u))
      .catch(() => {
        setToken("");
        if (mounted) setUser(null);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Logout automático si el backend responde 401.
  useEffect(() => {
    const onUnauthorized = () => {
      setToken("");
      setUser(null);
    };
    window.addEventListener("ti:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ti:unauthorized", onUnauthorized);
  }, []);

  const login = async (username, password) => {
    const { access_token } = await api.login(username, password);
    setToken(access_token);
    const u = await api.me();
    setUser(u);
    return u;
  };

  const logout = () => {
    setToken("");
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    refreshUser: () => api.me().then(setUser).catch(() => {}),
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
