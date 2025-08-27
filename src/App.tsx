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
import { t, type Lang } from "./i18n";
import { useLang } from "./hooks/useLang";

/* ===== Tipos locales (idénticos a tu versión) ===== */
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
type ChatMessage = { role: "user" | "assistant"; content: string };

/* ===== Utils ===== */
const euro = (n: number = 0) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n: number = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isGreeting = (s: string) =>
  /^(hola|buenas|hey|holi|que tal|qué tal|hi|hello|hey there)\b/i.test(s.trim());

/* ===== Cliente a /api/chat (conversacional + specs) ===== */
async function chatWithAI(
  history: ChatMessage[],
  mesActivo: string | null,
  mesesDisponibles: string[],
  lang: Lang,
  maxCharts = 4
): Promise<{ assistant: string; specs: ChartSpec[] } | null> {
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, mesActivo, mesesDisponibles, lang, maxCharts }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return {
      assistant: typeof data.reply === "string" ? data.reply : (data.assistant || "Ok"),
      specs: Array.isArray(data.specs) ? (data.specs as ChartSpec[]) : [],
    };
  } catch {
    return null;
  }
}

export default function App() {
  /* Tema y lenguaje */
  const { theme, toggle } = useDarkMode() as { theme: "dark" | "light"; toggle: () => void };
  const { lang, setLang } = useLang("en");

  /* Estado del chat */
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: t(lang, "chat.greeting") },
  ]);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [generated, setGenerated] = useState<ChartSpec[]>([]);
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, lang]);

  /* Datos */
  const { ventas, clientes, serieBar, kpis, loading, err } =
    (useSheetData() as UseSheetDataReturn) || {};

  /* Meses disponibles */
  const mesesDisponibles = useMemo<string[]>(() => {
    const set = new Set<string>();
    ventas?.forEach((v) => v.fecha && set.add(ymKey(v.fecha)));
    clientes?.forEach((c) => c.fecha && set.add(ymKey(c.fecha)));
    if (set.size === 0 && Array.isArray(serieBar) && serieBar.length) {
      serieBar.forEach((p) => p.mes && set.add(p.mes));
    }
    return Array.from(set).sort();
  }, [ventas, clientes, serieBar]);

  const [mesSel, setMesSel] = useState<string | null>(null);
  useEffect(() => {
    if (!mesSel && mesesDisponibles.length) setMesSel(mesesDisponibles.at(-1) ?? null);
  }, [mesesDisponibles, mesSel]);
  const mesActivo =
    mesSel || (mesesDisponibles.length ? (mesesDisponibles.at(-1) as string) : null);

  /* Pie por canal del mes activo */
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

  /* Enviar mensaje */
  const enviar = async () => {
    const text = input.trim();
    if (!text) return;

    const nextHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(nextHistory);
    setInput("");

    if (isGreeting(text) || text.length < 2) {
      setMessages((p) => [...p, { role: "assistant", content: t(lang, "chat.helper") }]);
      return;
    }

    setIsTyping(true);
    try {
      const ai = await chatWithAI(nextHistory, mesActivo, mesesDisponibles, lang, 4);
      setIsTyping(false);

      if (ai) {
        setMessages((p) => [...p, { role: "assistant" as const, content: ai.assistant || "Ok" }]);
        if (ai.specs?.length) {
          setGenerated((prev) => [...ai.specs, ...prev].slice(0, 6));
        } else {
          const localSpec = parsePromptToSpec(text);
          if (localSpec) {
            setGenerated((prev) => [localSpec, ...prev].slice(0, 6));
            setMessages((p) => [...p, { role: "assistant", content: describeSpec(localSpec) }]);
          }
        }
        return;
      }

      const localSpec = parsePromptToSpec(text);
      if (localSpec) {
        setGenerated((prev) => [localSpec, ...prev].slice(0, 6));
        setMessages((p) => [...p, { role: "assistant", content: describeSpec(localSpec) }]);
      } else {
        setMessages((p) => [...p, { role: "assistant", content: t(lang, "chat.helper") }]);
      }
    } catch {
      setIsTyping(false);
      setMessages((p) => [...p, { role: "assistant", content: "Error processing your request." }]);
    }
  };

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
    borderRadius: 12,
    border: "1px solid rgba(63,63,70,.4)",
    color: theme === "dark" ? "#e5e7eb" : "#18181b",
    fontSize: "0.875rem",
  };

  /* Sugerencias localizadas */
  const SUGGESTIONS = [
    t(lang, "chat.example.1"),
    t(lang, "chat.example.2"),
    t(lang, "chat.example.3"),
    t(lang, "chat.example.4"),
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Topbar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="mx-auto max-w-7xl h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/vite.svg" alt="Logo" className="h-6 w-6" />
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
              {t(lang, "app.title")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Language selector */}
            <label className="sr-only" htmlFor="lang">
              {t(lang, "lang.label")}
            </label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
              title={t(lang, "lang.label")}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={theme === "dark" ? t(lang, "theme.toggle.light") : t(lang, "theme.toggle.dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌞" : "🌙"}
            </button>

            {/* Auth */}
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
                  {t(lang, "auth.signin")}
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[30%_1fr]">
        {/* Sidebar / Chat */}
        <aside className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 lg:min-h-[calc(100vh-56px)] flex flex-col">
          <div className="p-4">
            <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-200">
              {t(lang, "chat.title")}
            </h2>

            {/* Input + button */}
            <div className="mt-3 flex gap-2">
              <textarea
                className="flex-1 min-h-[40px] max-h-[120px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none resize-y"
                placeholder={t(lang, "chat.placeholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                aria-label={t(lang, "chat.title")}
              />
              <button
                onClick={enviar}
                disabled={!input.trim()}
                className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t(lang, "send")}
              </button>
            </div>

            {/* Examples / chips */}
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

            {/* Month filter */}
            <div className="mt-4">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">{t(lang, "month.filter")}</label>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2"
                value={mesActivo || ""}
                onChange={(e) => setMesSel(e.target.value)}
                disabled={!mesesDisponibles.length}
              >
                {mesesDisponibles.length === 0 ? (
                  <option value="">{t(lang, "loading")}</option>
                ) : (
                  mesesDisponibles.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Messages */}
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

              {/* Typing indicator */}
              {isTyping && (
                <div className="mr-auto border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-sm rounded-2xl px-3 py-2 flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce [animation-delay:150ms]">●</span>
                  <span className="animate-bounce [animation-delay:300ms]">●</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main panel */}
        <main className="overflow-y-auto">
          <div className="p-4 lg:p-6 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                label={t(lang, "kpi.salesMonth")}
                value={kpis ? euro(kpis.ventasMes) : "—"}
                delta={kpis ? pct(kpis.deltaVentas) : "—"}
                positive={(kpis?.deltaVentas ?? 0) >= 0}
                loading={loading}
              />
              <KpiCard
                label={t(lang, "kpi.newCustomers")}
                value={kpis?.nuevosMes ?? "—"}
                delta={kpis ? pct(kpis.deltaNuevos) : "—"}
                positive={(kpis?.deltaNuevos ?? 0) >= 0}
                loading={loading}
              />
              <KpiCard
                label={t(lang, "kpi.avgTicket")}
                value={kpis ? euro(kpis.ticketMedio) : "—"}
                delta={kpis ? pct(kpis.deltaTicket) : "—"}
                positive={(kpis?.deltaTicket ?? 0) >= 0}
                loading={loading}
              />
            </div>

            {/* Default bar chart */}
            <ChartCard title={t(lang, "chart.bar.title")}>
              {loading ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">
                  {t(lang, "loading")}
                </div>
              ) : err ? (
                <div className="h-full grid place-items-center text-sm text-rose-600">
                  {t(lang, "error")}: {typeof err === "string" ? err : String(err?.message ?? err)}
                </div>
              ) : !serieBar?.length ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">
                  {t(lang, "nodata")}
                </div>
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
                      name={lang === "en" ? "Expenses" : "Gastos"}
                      radius={[6, 6, 0, 0]}
                      fill={theme === "dark" ? "#22c55e" : "#16a34a"}
                      isAnimationActive
                      animationDuration={800}
                    />
                    <Bar
                      dataKey="ventas"
                      name={lang === "en" ? "Sales" : "Ventas"}
                      radius={[6, 6, 0, 0]}
                      fill={theme === "dark" ? "#3b82f6" : "#2563eb"}
                      isAnimationActive
                      animationDuration={800}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Pie by channel */}
            <ChartCard
              title={`${t(lang, "pie.title.prefix")}${mesActivo || "—"}`}
              footer={
                lang === "en"
                  ? "Count of operations per channel in the selected month."
                  : "Cuenta de operaciones por canal en el mes seleccionado."
              }
            >
              <ChannelPie key={mesActivo || "none"} data={pieData} loading={loading} error={err} />
            </ChartCard>

            {/* Insights */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <div className="font-medium text-zinc-800 dark:text-zinc-200">{t(lang, "insights.title")}</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {kpis
                  ? t(lang, "insights.text", {
                      sales: euro(kpis.ventasMes),
                      delta: pct(kpis.deltaVentas),
                      ticket: euro(kpis.ticketMedio),
                    })
                  : lang === "en"
                  ? "Load your data to see insights."
                  : "Carga tus datos para ver insights."}
              </p>
            </div>

            {/* AI charts */}
            {generated.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">{t(lang, "ai.title")}</div>
                  <button
                    onClick={() => setGenerated([])}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    title={t(lang, "ai.clear")}
                  >
                    {t(lang, "ai.clear")}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generated.map((spec) => (
                    <div key={spec.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                      <div className="text-sm font-medium mb-2">{spec.title}</div>
                      <DynamicChart spec={spec} ventas={ventas} serieBar={serieBar} mesActivo={mesActivo} />
                      {spec.notes && (
                        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{spec.notes}</div>
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
