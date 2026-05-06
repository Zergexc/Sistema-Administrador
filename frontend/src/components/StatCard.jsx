export default function StatCard({ label, value, icon, color = "indigo", suffix = "", trend }) {
  const colorMap = {
    indigo: {
      glow: "stat-glow-indigo",
      icon: "from-accent-500 to-accent-700",
      text: "text-accent-400",
      bg: "bg-accent-500/10",
    },
    green: {
      glow: "stat-glow-green",
      icon: "from-emerald-500 to-emerald-700",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    red: {
      glow: "stat-glow-red",
      icon: "from-red-500 to-red-700",
      text: "text-red-400",
      bg: "bg-red-500/10",
    },
    amber: {
      glow: "stat-glow-amber",
      icon: "from-amber-500 to-amber-700",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    blue: {
      glow: "stat-glow-blue",
      icon: "from-blue-500 to-blue-700",
      text: "text-blue-400",
      bg: "bg-blue-500/10",
    },
  };

  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className={`glass-card-hover p-6 ${c.glow} animate-slide-up`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-dark-400 mb-1">{label}</p>
          <p className="text-3xl font-bold text-white tracking-tight">
            {value}
            {suffix && <span className="text-lg font-medium text-dark-400 ml-1">{suffix}</span>}
          </p>
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend.up ? "text-emerald-400" : "text-red-400"}`}>
              {trend.up ? "↑" : "↓"} {trend.text}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.icon} flex items-center justify-center shadow-lg`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
