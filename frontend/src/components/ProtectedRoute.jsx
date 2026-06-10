import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const FullSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-dark-900">
    <div className="w-10 h-10 border-3 border-dark-600 border-t-accent-500 rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) return <FullSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
