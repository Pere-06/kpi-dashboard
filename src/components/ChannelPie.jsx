import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];
const euro = (n = 0) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function ChannelPie({ data = [], loading, error }) {
  if (loading) return <div className="h-full grid place-items-center text-sm text-zinc-500">Cargando…</div>;
  if (error)   return <div className="h-full grid place-items-center text-sm text-rose-600">Error: {String(error.message || error)}</div>;
  if (!data.length) return <div className="h-full grid place-items-center text-sm text-zinc-500">Sin datos para este mes.</div>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v, name) => [euro(v), name]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
