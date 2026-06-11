import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AlertsPage from "./pages/Alerts";
import DashboardPage from "./pages/Dashboard";
import DeviceDetailPage from "./pages/DeviceDetail";
import DevicesPage from "./pages/Devices";
import InventoryPage from "./pages/Inventory";
import InventoryCategoriesPage from "./pages/InventoryCategories";
import InventoryDetailPage from "./pages/InventoryDetail";
import InventoryLabelsPage from "./pages/InventoryLabels";
import LoginPage from "./pages/Login";
import SettingsPage from "./pages/Settings";
import TvModePage from "./pages/TvMode";
import UsersPage from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Modo TV: autenticado pero a pantalla completa, sin sidebar */}
      <Route
        path="/tv"
        element={
          <ProtectedRoute>
            <TvModePage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:id" element={<DeviceDetailPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/categories" element={<InventoryCategoriesPage />} />
        <Route path="/inventory/labels" element={<InventoryLabelsPage />} />
        <Route path="/inventory/:id" element={<InventoryDetailPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requireAdmin>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requireAdmin>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
