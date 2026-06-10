import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES = [
  { key: "cpu_percent", name: "CPU %", color: "#818cf8" },
  { key: "ram_used_percent", name: "RAM %", color: "#34d399" },
  { key: "disk_used_percent", name: "Disco %", color: "#fbbf24" },
];

function formatTick(ts, range) {
  const d = new Date(ts);
  if (range === "24h") {
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
}

export default function MetricsChart({ data = [], range = "24h" }) {
  if (!data.length) {
    return (
      <div className="text-center py-16 text-dark-500 text-sm">
        Sin datos históricos todavía. Se generan con cada reporte del agente.
      </div>
    );
  }

  const chartData = data.map((s) => ({
    ...s,
    label: formatTick(s.timestamp, range),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1c2137" />
        <XAxis dataKey="label" tick={{ fill: "#727a94", fontSize: 11 }} stroke="#272d43" minTickGap={24} />
        <YAxis domain={[0, 100]} tick={{ fill: "#727a94", fontSize: 11 }} stroke="#272d43" unit="%" />
        <Tooltip
          contentStyle={{
            background: "#131729",
            border: "1px solid #272d43",
            borderRadius: "0.75rem",
            color: "#d0d3dc",
            fontSize: "0.8rem",
          }}
          labelStyle={{ color: "#a1a7b8" }}
        />
        <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
