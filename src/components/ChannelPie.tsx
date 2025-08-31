import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export type PieDatum = { name: string; value: number };

type Props = {
  data: PieDatum[];
  loading?: boolean;
  error?: Error | string | null;
};

export default function ChannelPie({ data, loading = false, error = null }: Props) {
  if (loading) {
    return <div className="h-full grid place-items-center text-sm text-zinc-500">Cargando…</div>;
  }
  if (error) {
    return (
      <div className="h-full grid place-items-center text-sm text-rose-600">
        Error: {typeof error === "string" ? error : String((error as Error)?.message ?? error)}
      </div>
    );
  }
  if (!data?.length) {
    return <div className="h-full grid place-items-center text-sm text-zinc-500">Sin datos.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={120}>
          {data.map((_, i) => (
            <Cell key={i} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
