// src/components/GenericResultChart.tsx
import React from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const COLORS = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#a855f7","#06b6d4","#84cc16"];

type Props = {
  fields: string[];
  rows: any[];
  spec: { id: string; type: "line"|"bar"|"area"|"pie"; title: string; x?: string; y?: string[]; notes?: string; };
  height?: number;
};

export default function GenericResultChart({ fields, rows, spec, height = 320 }: Props) {
  if (!rows?.length || !fields?.length) {
    return <div className="h-56 grid place-items-center text-sm text-zinc-500">Sin datos.</div>;
  }

  const xKey = spec.x && fields.includes(spec.x) ? spec.x : fields[0];
  const yKeys = (spec.y || fields.slice(1)).filter(c => c !== xKey);

  if (spec.type === "pie") {
    // Si es pie, usamos la primera Y como value
    const valueKey = yKeys[0] || fields[1];
    const pieData = rows.map(r => ({ name: String(r[xKey]), value: Number(r[valueKey]) || 0 }));
    return (
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip /><Legend />
            <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90}>
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === "bar") {
    return (
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} /><YAxis /><Tooltip /><Legend />
            {yKeys.map((k, i) => (
              <Bar key={k} dataKey={k} name={k} radius={[6,6,0,0]} fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === "line") {
    return (
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} /><YAxis /><Tooltip /><Legend />
            {yKeys.map((k, i) => (
              <Line key={k} dataKey={k} name={k} type="monotone" strokeWidth={2} dot={false} stroke={COLORS[i % COLORS.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // area
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} /><YAxis /><Tooltip /><Legend />
          {yKeys.map((k, i) => (
            <Area key={k} dataKey={k} name={k} type="monotone" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
