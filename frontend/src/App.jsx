import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import AlertsPage from "./pages/Alerts";
import DashboardPage from "./pages/Dashboard";
import DeviceDetailPage from "./pages/DeviceDetail";
import DevicesPage from "./pages/Devices";
import SettingsPage from "./pages/Settings";

export default function App() {
  return (
    <div className="flex min-h-screen bg-dark-900">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-h-screen">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/devices/:id" element={<DeviceDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
