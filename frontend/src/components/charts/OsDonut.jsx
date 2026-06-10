import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#818cf8", "#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c"];

export default function OsDonut({ data = [] }) {
  if (!data.length) {
    return <div className="text-center py-12 text-dark-500 text-sm">Sin datos</div>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#131729",
              border: "1px solid #272d43",
              borderRadius: "0.75rem",
              color: "#d0d3dc",
              fontSize: "0.8rem",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 w-full">
        {data.map((entry, i) => (
          <div key={entry.name} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-dark-300 truncate flex-1">{entry.name}</span>
            <span className="text-dark-100 font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
