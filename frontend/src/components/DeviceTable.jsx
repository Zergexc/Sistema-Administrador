import { useNavigate } from "react-router-dom";

function StatusDot({ online }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? "bg-emerald-400" : "bg-red-400"}`} />
    </span>
  );
}

export default function DeviceTable({ devices, onViewDetail }) {
  const navigate = useNavigate();

  if (!devices.length) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
        <svg className="w-16 h-16 mx-auto text-dark-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-dark-400 font-medium">No hay equipos registrados</p>
        <p className="text-dark-500 text-sm mt-1">Los equipos aparecerán cuando el agente envíe su primer reporte</p>
      </div>
    );
  }

  const isOnline = (device) => Date.now() - new Date(device.last_seen).getTime() <= 300000;

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Equipos Registrados</h3>
          <span className="badge-info">{devices.length} equipos</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" id="devices-table">
          <thead>
            <tr className="border-b border-dark-700/30">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider">Equipo</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider">IP</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider">SO</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider">Estado</th>
              <th className="text-right px-6 py-3.5 text-xs font-semibold text-dark-400 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/20">
            {devices.map((device, index) => {
              const online = isOnline(device);
              return (
                <tr
                  key={device.id}
                  className="group hover:bg-dark-700/30 transition-colors duration-150 cursor-pointer"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => onViewDetail ? onViewDetail(device.id) : navigate(`/devices/${device.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-500/20 to-accent-700/20 border border-accent-500/20 flex items-center justify-center">
                        <svg className="w-4.5 h-4.5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white group-hover:text-accent-400 transition-colors">{device.hostname}</p>
                        <p className="text-[11px] text-dark-500">Agente v{device.agent_version || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-dark-300">{device.current_user || "—"}</td>
                  <td className="px-6 py-4">
                    <code className="text-xs font-mono text-dark-300 bg-dark-700/50 px-2 py-1 rounded">{device.ip_address || "—"}</code>
                  </td>
                  <td className="px-6 py-4 text-sm text-dark-300">{device.os_version || "—"}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <StatusDot online={online} />
                      <span className={`text-xs font-medium ${online ? "text-emerald-400" : "text-red-400"}`}>
                        {online ? "Online" : "Offline"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-400 hover:text-accent-300 text-sm font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetail ? onViewDetail(device.id) : navigate(`/devices/${device.id}`);
                      }}
                    >
                      Ver detalle →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
