import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeviceTable from "../components/DeviceTable";
import { api } from "../services/api";

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = () =>
      api
        .getDevices()
        .then((result) => {
          if (mounted) setDevices(result);
        })
        .catch((err) => {
          if (mounted) setError(err.message || "No se pudo cargar equipos.");
        });

    load();
    const interval = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  const filtered = search
    ? devices.filter(
        (d) =>
          d.hostname?.toLowerCase().includes(search.toLowerCase()) ||
          d.current_user?.toLowerCase().includes(search.toLowerCase()) ||
          d.ip_address?.includes(search)
      )
    : devices;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipos</h1>
          <p className="text-dark-400 text-sm mt-1">Gestión y monitoreo de dispositivos</p>
        </div>
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            id="search-devices"
            placeholder="Buscar equipo, usuario o IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 w-full sm:w-80"
          />
        </div>
      </div>

      {/* Table */}
      <DeviceTable devices={filtered} onViewDetail={(id) => navigate(`/devices/${id}`)} />
    </div>
  );
}
