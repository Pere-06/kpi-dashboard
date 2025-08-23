import { useState, useMemo, useEffect } from "react";
import { useSheetData } from "./hooks/useSheetData";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import ChannelPie from "./components/ChannelPie";
import { useDarkMode } from "./hooks/useDarkMode";

const euro = (n = 0) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function App() {
  const { theme, toggle } = useDarkMode();

  const [input, setInput] = useState("");
  const [chat, setChat] = useState([{ who: "bot", msg: "Hola 👋 ¿qué quieres analizar hoy?" }]);

  // Datos reales desde /api/data
  const { ventas, clientes, serieBar, kpis, loading, err } = useSheetData();

  // Meses disponibles (YYYY-MM) con fallback a serieBar.ym
  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    // 1) Meses a partir de las filas (ventas/clientes)
    ventas.forEach((v) => v.fecha && set.add(ymKey(v.fecha)));
    clientes.forEach((c) => c.fecha && set.add(ymKey(c.fecha)));
    // 2) Fallback: si aún no hay filas, usa la serie del backend
    if (set.size === 0 && Array.isArray(serieBar) && serieBar.length) {
      serieBar.forEach((p) => {
        if (p.ym) set.add(p.ym);         // backend actualizado
      });
    }
    return Array.from(set).sort();       // ["2025-05","2025-06",...]
  }, [ventas, clientes, serieBar]);

  // Mes seleccionado (controlado)
  const [mesSel, setMesSel] = useState(null);

  // Inicializa al último mes disponible cuando llegan datos
  useEffect(() => {
    if (!mesSel && mesesDisponibles.length) {
      setMesSel(mesesDisponibles.at(-1)); // último (más reciente)
    }
  }, [mesesDisponibles, mesSel]);

  const mesActivo = mesSel || (mesesDisponibles.length ? mesesDisponibles.at(-1) : null);

  // Distribución por canal del mes activo (suma de VENTAS por canal)
  const pieData = useMemo(() => {
    if (!mesActivo || !ventas.length) return [];
    const map = {};
    ventas.forEach((r) => {
      if (r.fecha && ymKey(r.fecha) === mesActivo) {
        const canal = r.canal || "N/D";
        const v = Number(r.ventas) || 0;  // suma ventas
        map[canal] = (map[canal] || 0) + v;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ventas, mesActivo]);

  const enviar = () => {
    if (!input.trim()) return;
    setChat((p) => [
      ...p,
      { who: "user", msg: input.trim() },
      { who: "bot", msg: "Actualizado con datos reales ✅" },
    ]);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Topbar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl h-14 px-4 flex items-center justify-between">
          <h1 className="text-sm tracking-tight text-zinc-600 dark:text-zinc-400">MiKPI</h1>
          <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <button
              onClick={toggle}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Cambiar tema"
            >
              {theme === "dark" ? "☀️ Claro" : "🌙 Oscuro"}
            </button>
            <span>Pere · Cerrar sesión</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[30%_1fr]">
        {/* Sidebar/chat */}
        <aside className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 lg:min-h-[calc(100vh-56px)] flex flex-col">
          <div className="p-4">
            <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-200">Chat de análisis</h2>

            {/* Input + botón */}
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900
                           px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                           outline-none"
                placeholder="Escribe tu petición…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviar()}
              />
              <button
                onClick={enviar}
                className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900
                           px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200"
              >
                Enviar
              </button>
            </div>

            {/* Filtro de mes */}
            <div className="mt-4">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">Mes de análisis</label>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800
                           bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2"
                value={mesActivo || ""}
                onChange={(e) => setMesSel(e.target.value)}
                disabled={!mesesDisponibles.length}
              >
                {mesesDisponibles.length === 0 ? (
                  <option value="">Cargando meses…</option>
                ) : (
                  mesesDisponibles.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                )}
              </select>
            </div>

            {/* Mensajes del chat */}
            <div className="mt-4 px-1 space-y-2 overflow-y-auto">
              {chat.map((c, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-2xl border px-3 py-2 text-sm
                             ${
                               c.who === "user"
                                 ? "ml-auto border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                 : "mr-auto border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                             }`}
                >
                  {c.msg}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Panel principal */}
        <main className="overflow-y-auto">
          <div className="p-4 lg:p-6 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                label="Ventas (mes)"
                value={kpis ? euro(kpis.ventasMes) : "—"}
                delta={kpis ? pct(kpis.deltaVentas) : "—"}
                positive={(kpis?.deltaVentas ?? 0) >= 0}
                loading={loading}
              />
              <KpiCard
                label="Nuevos clientes"
                value={kpis?.nuevosMes ?? "—"}
                delta={kpis ? pct(kpis.deltaNuevos) : "—"}
                positive={(kpis?.deltaNuevos ?? 0) >= 0}
                loading={loading}
              />
              <KpiCard
                label="Ticket medio"
                value={kpis ? euro(kpis.ticketMedio) : "—"}
                delta={kpis ? pct(kpis.deltaTicket) : "—"}
                positive={(kpis?.deltaTicket ?? 0) >= 0}
                loading={loading}
              />
            </div>

            {/* Gráfico barras */}
            <ChartCard title="Ventas vs Gastos (últimos 8 meses)">
              {loading ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">Cargando…</div>
              ) : err ? (
                <div className="h-full grid place-items-center text-sm text-rose-600">
                  Error: {String(err.message || err)}
                </div>
              ) : !serieBar.length ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">Sin datos.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieBar} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="gastos" name="gastos" radius={[6, 6, 0, 0]} fill="#22c55e" />
                    <Bar dataKey="ventas" name="ventas" radius={[6, 6, 0, 0]} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico pie por canal (mes activo) */}
            <ChartCard
              title={`Distribución por canal — ${mesActivo || "—"}`}
              footer="Cuenta de operaciones por canal en el mes seleccionado."
            >
              <ChannelPie key={mesActivo || "none"} data={pieData} loading={loading} error={err} />
            </ChartCard>

            {/* Interpretación */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <div className="font-medium text-zinc-800 dark:text-zinc-200">📌 Interpretación</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {kpis
                  ? `Las ventas del mes son ${euro(kpis.ventasMes)} (${pct(
                      kpis.deltaVentas
                    )} vs mes anterior). El ticket medio es ${euro(kpis.ticketMedio)}.`
                  : "Carga tus datos para ver insights."}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
