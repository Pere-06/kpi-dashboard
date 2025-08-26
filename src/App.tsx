import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSheetData } from "./hooks/useSheetData";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import ChannelPie from "./components/ChannelPie";
import { useDarkMode } from "./hooks/useDarkMode";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import DynamicChart from "./components/DynamicChart";
import { parsePromptToSpec } from "./ai/parsePrompt";
import { describeSpec } from "./ai/promptHelper";
import type { ChartSpec } from "./types/chart";

/* =========================
   Tipos locales
   ========================= */
type VentasRow = {
  fecha?: Date | null;
  canal?: string | null;
  ventas?: number | null;
  gastos?: number | null;
  mes?: string | null;
};
type ClientesRow = { fecha?: Date | null };
type SerieBarPoint = { mes: string; ventas: number; gastos: number };
type Kpis = {
  ventasMes: number;
  deltaVentas: number;
  nuevosMes: number;
  deltaNuevos: number;
  ticketMedio: number;
  deltaTicket: number;
};
type UseSheetDataReturn = {
  ventas: VentasRow[];
  clientes: ClientesRow[];
  serieBar: SerieBarPoint[];
  kpis: Kpis | null;
  loading: boolean;
  err: Error | string | null;
};

// Conversación estilo ChatGPT (para /api/chat)
type ChatMessage = { role: "user" | "assistant"; content: string };

/* =========================
   Utils
   ========================= */
const euro = (n: number = 0) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n: number = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Heurística simple de saludo para respuestas amables
const isGreeting = (s: string) => /^(hola|buenas|hey|holi|que tal|qué tal)\b/i.test(s.trim());

// Sugerencias rápidas
const SUGGESTIONS = [
  "ventas por canal",
  "ventas vs gastos últimos 8 meses",
  "evolución de ventas últimos 6 meses",
  "top 3 canales",
];

/* ========= Cliente a /api/chat (conversacional + specs) ========= */
async function chatWithAI(
  messages: ChatMessage[],
  mesActivo: string | null,
  mesesDisponibles: string[]
): Promise<{ reply: string; specs: ChartSpec[] } | null> {
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, mesActivo, mesesDisponibles }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      specs: Array.isArray(data.specs) ? (data.specs as ChartSpec[]) : [],
    };
  } catch {
    return null;
  }
}

export default function App() {
  // Dark mode
  const { theme, toggle } = useDarkMode() as { theme: "dark" | "light"; toggle: () => void };

  // Conversación (inicia con saludo)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hola 👋 ¿qué quieres analizar hoy?" },
  ]);

  // Entrada de usuario
  const [input, setInput] = useState<string>("");

  // Gráficos generados por IA (máx. 6)
  const [generated, setGenerated] = useState<ChartSpec[]>([]);

  // Auto-scroll del chat
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Datos reales desde /api/data
  const { ventas, clientes, serieBar, kpis, loading, err } =
    (useSheetData() as UseSheetDataReturn) || {};

  // Meses disponibles (YYYY-MM) con fallback a serieBar.mes
  const mesesDisponibles = useMemo<string[]>(() => {
    const set = new Set<string>();
    ventas?.forEach((v) => v.fecha && set.add(ymKey(v.fecha)));
    clientes?.forEach((c) => c.fecha && set.add(ymKey(c.fecha)));
    if (set.size === 0 && Array.isArray(serieBar) && serieBar.length) {
      serieBar.forEach((p) => p.mes && set.add(p.mes));
    }
    return Array.from(set).sort();
  }, [ventas, clientes, serieBar]);

  // Mes seleccionado (controlado)
  const [mesSel, setMesSel] = useState<string | null>(null);

  // Inicializa al último mes disponible cuando llegan datos
  useEffect(() => {
    if (!mesSel && mesesDisponibles.length) setMesSel(mesesDisponibles.at(-1) ?? null);
  }, [mesesDisponibles, mesSel]);

  const mesActivo =
    mesSel || (mesesDisponibles.length ? (mesesDisponibles.at(-1) as string) : null);

  // Distribución por canal del mes activo (suma de VENTAS por canal)
  const pieData = useMemo<{ name: string; value: number }[]>(() => {
    if (!mesActivo || !ventas?.length) return [];
    const map: Record<string, number> = {};
    ventas.forEach((r) => {
      if (r.fecha && ymKey(r.fecha) === mesActivo) {
        const canal = (r.canal ?? "N/D") as string;
        const v = Number(r.ventas ?? 0);
        map[canal] = (map[canal] || 0) + v;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ventas, mesActivo]);

  /* ========= Enviar mensaje: conversación + generación de gráficos ========= */
  const enviar = async () => {
    const text = input.trim();
    if (!text) return;

    // Añade el mensaje del usuario
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");

    // Si es un saludo, responde amable y sugiere ejemplos (sin llamar a la IA)
    if (isGreeting(text) || text.length < 2) {
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content:
            "¡Hola! 👋 Puedo crear gráficos si me pides algo como:\n" +
            "• «ventas por canal»\n" +
            "• «ventas vs gastos últimos 8 meses»\n" +
            "• «evolución de ventas últimos 6 meses»\n" +
            "• «top 3 canales»",
        },
      ]);
      return;
    }

    // Pinta “pensando…”
    setMessages((p) => [
      ...p,
      { role: "assistant", content: "Entendido ✅ generando ideas de visualización…" },
    ]);

    // Llama a la IA conversacional
    const ai = await chatWithAI(next, mesActivo, mesesDisponibles);

    if (ai) {
      // Reemplaza el “pensando…” con la respuesta real
      setMessages((p) => {
        const trimmed = p.filter(
          (m) => m.content !== "Entendido ✅ generando ideas de visualización…"
        );
        return [...trimmed, { role: "assistant" as const, content: ai.reply || "Listo ✅" }];
      });

      if (ai.specs?.length) {
        setGenerated((prev) => [...ai.specs, ...prev].slice(0, 6));
      }
      return;
    }

    // Fallback local por si /api/chat falla
    const localSpec = parsePromptToSpec(text);
    if (localSpec) {
      setGenerated((prev) => [localSpec, ...prev].slice(0, 6));
      setMessages((p) => [
        ...p.filter(
          (m) => m.content !== "Entendido ✅ generando ideas de visualización…"
        ),
        { role: "assistant", content: describeSpec(localSpec) },
      ]);
    } else {
      setMessages((p) => [
        ...p.filter(
          (m) => m.content !== "Entendido ✅ generando ideas de visualización…"
        ),
        {
          role: "assistant",
          content:
            "No he podido conectar con la IA ahora mismo. Prueba con:\n" +
            "• «ventas por canal»\n" +
            "• «ventas vs gastos últimos 8 meses»\n" +
            "• «evolución de ventas últimos 6 meses»\n" +
            "• «top 3 canales»",
        },
      ]);
    }
  };

  // Tooltip estilizado para el bar chart
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
    borderRadius: 12,
    border: "1px solid rgba(63,63,70,.4)",
    color: theme === "dark" ? "#e5e7eb" : "#18181b",
    fontSize: "0.875rem",
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Topbar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="mx-auto max-w-7xl h-14 px-4 flex items-center justify-between">
          {/* Branding */}
          <div className="flex items-center gap-2">
            <img src="/vite.svg" alt="Logo" className="h-6 w-6" />
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
              MiKPI Dashboard
            </span>
          </div>

          {/* Actions: theme + auth */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Cambiar tema"
              aria-label="Cambiar tema"
            >
              {theme === "dark" ? "🌞" : "🌙"}
            </button>

            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    userButtonPopoverCard:
                      "bg-zinc-900/95 border border-zinc-800 shadow-xl rounded-2xl",
                    userPreview: "text-zinc-100",
                    userButtonPopoverActionButton: "hover:bg-zinc-800 text-zinc-100",
                    userButtonPopoverFooter: "border-t border-zinc-800",
                  },
                }}
              />
            </SignedIn>

            <SignedOut>
              <SignInButton mode="modal">
                <button className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                  Iniciar sesión
                </button>
              </SignInButton>
            </SignedOut>
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
              <textarea
                className="flex-1 min-h-[40px] max-h-[120px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900
                           px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                           outline-none resize-y"
                placeholder="Pide un gráfico o un insight… (Enter envía, Shift+Enter = salto)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                aria-label="Mensaje para el chat de análisis"
              />
              <button
                onClick={enviar}
                disabled={!input.trim()}
                className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900
                           px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </div>

            {/* Chips de ejemplos */}
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-2 py-1 rounded-full border border-zinc-300/40 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {q}
                </button>
              ))}
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
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Mensajes del chat */}
            <div ref={chatRef} className="mt-4 px-1 space-y-2 overflow-y-auto max-h-[48vh]">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-2xl border px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-auto border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      : "mr-auto border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {m.content}
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

            {/* Gráfico barras (predeterminado) */}
            <ChartCard title="Ventas vs Gastos (últimos 8 meses)">
              {loading ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">Cargando…</div>
              ) : err ? (
                <div className="h-full grid place-items-center text-sm text-rose-600">
                  Error: {typeof err === "string" ? err : String(err?.message ?? err)}
                </div>
              ) : !serieBar?.length ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">Sin datos.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieBar} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="mes" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar
                      dataKey="gastos"
                      name="Gastos"
                      radius={[6, 6, 0, 0]}
                      fill={theme === "dark" ? "#22c55e" : "#16a34a"}
                      isAnimationActive
                      animationDuration={800}
                    />
                    <Bar
                      dataKey="ventas"
                      name="Ventas"
                      radius={[6, 6, 0, 0]}
                      fill={theme === "dark" ? "#3b82f6" : "#2563eb"}
                      isAnimationActive
                      animationDuration={800}
                    />
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

            {/* 🧠 Gráficos generados por IA */}
            {generated.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    🧠 Gráficos generados por IA
                  </div>
                  <button
                    onClick={() => setGenerated([])}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    title="Limpiar"
                  >
                    Limpiar
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generated.map((spec) => (
                    <div
                      key={spec.id}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3"
                    >
                      <div className="text-sm font-medium mb-2">{spec.title}</div>
                      <DynamicChart
                        spec={spec}
                        ventas={ventas}
                        serieBar={serieBar}
                        mesActivo={mesActivo}
                      />
                      {spec.notes && (
                        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {spec.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
