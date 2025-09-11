import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSheetData } from "./hooks/useSheetData";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import ChannelPie from "./components/ChannelPie";
import { useDarkMode } from "./hooks/useDarkMode";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import DynamicChart from "./components/DynamicChart";
import { parsePromptToSpec } from "./ai/parsePrompt";
// import { describeSpec } from "./ai/promptHelper"; // ya no lo usamos para forzar idioma
import type { ChartSpec } from "./types/chart";
import { t, type Lang } from "./i18n";
import { useLang } from "./hooks/useLang";
import SettingsDrawer from "./components/SettingsDrawer";

/* ✅ API base (Render) */
import { API_BASE } from "./config";

/* ===== Tipos locales ===== */
type VentasRow = { fecha?: Date | null; canal?: string | null; ventas?: number | null; gastos?: number | null; mes?: string | null; };
type ClientesRow = { fecha?: Date | null };
type SerieBarPoint = { mes: string; ventas: number; gastos: number };
type Kpis = { ventasMes: number; deltaVentas: number; nuevosMes: number; deltaNuevos: number; ticketMedio: number; deltaTicket: number; };
type UseSheetDataReturn = { ventas: VentasRow[]; clientes: ClientesRow[]; serieBar: SerieBarPoint[]; kpis: Kpis | null; loading: boolean; err: Error | string | null; };
type ChatMessage = { role: "user" | "assistant"; content: string };

/* ===== Utils ===== */
const euro = (n: number = 0) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n: number = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isGreeting = (s: string) => /^(hola|buenas|hey|holi|que tal|qué tal|hi|hello|hey there)\b/i.test(s.trim());

/* ===== Persistencia ===== */
const LS_MESSAGES = "mikpi:messages";
const LS_CHARTS = "mikpi:generated";

/* ===== Cliente a /api/chat con cancelación + timeout ===== */
async function chatWithAI(
  history: ChatMessage[],
  mesActivo: string | null,
  mesesDisponibles: string[],
  lang: Lang,
  maxCharts: number,
  signal?: AbortSignal
): Promise<{ assistant: string; specs: ChartSpec[] } | null> {
  const endpoint = `${API_BASE ? API_BASE : ""}/api/chat`;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ messages: history, mesActivo, mesesDisponibles, lang, maxCharts }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return {
      assistant: typeof data.reply === "string" ? data.reply : (data.assistant || (lang === "en" ? "Ok." : "Vale.")),
      specs: Array.isArray(data.specs) ? (data.specs as ChartSpec[]) : [],
    };
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export default function App() {
  /* Tema e idioma */
  const dm = (useDarkMode() as { theme?: "dark" | "light"; toggle?: () => void }) || {};
  const theme = dm.theme === "dark" ? "dark" : "light";
  const toggle = dm.toggle || (() => {});
  const langHook = useLang("en");
  const lang = (langHook?.lang as Lang) || ("en" as Lang);
  const setLang = langHook?.setLang || (() => {});

  /* Drawer lateral (ajustes + conexiones) */
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* Chat */
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: t(lang, "chat.greeting") },
  ]);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const lastUserRef = useRef<string>("");

  /* Cancelación */
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  /* Gráficos generados */
  const [generated, setGenerated] = useState<ChartSpec[]>([]);

  /* Auto-scroll */
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    queueMicrotask(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, isTyping, lang]);

  /* Hidratar/guardar */
  useEffect(() => {
    try {
      const m = localStorage.getItem(LS_MESSAGES);
      if (m) {
        const parsed = JSON.parse(m);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
      const g = localStorage.getItem(LS_CHARTS);
      if (g) {
        const parsed = JSON.parse(g);
        if (Array.isArray(parsed)) setGenerated(parsed);
      }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(LS_MESSAGES, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { localStorage.setItem(LS_CHARTS, JSON.stringify(generated)); } catch {} }, [generated]);

  /* Datos */
  const { ventas, clientes, serieBar, kpis, loading, err } =
    (useSheetData() as UseSheetDataReturn) || ({} as UseSheetDataReturn);

  /* Meses */
  const mesesDisponibles = useMemo<string[]>(() => {
    const set = new Set<string>();
    ventas?.forEach((v) => v?.fecha && set.add(ymKey(v.fecha)));
    clientes?.forEach((c) => c?.fecha && set.add(ymKey(c.fecha)));
    if (set.size === 0 && Array.isArray(serieBar) && serieBar.length) {
      serieBar.forEach((p) => p?.mes && set.add(p.mes));
    }
    return Array.from(set).sort();
  }, [ventas, clientes, serieBar]);

  const [mesSel, setMesSel] = useState<string | null>(null);
  useEffect(() => {
    if (!mesSel && mesesDisponibles.length) setMesSel(mesesDisponibles.at(-1) ?? null);
  }, [mesesDisponibles, mesSel]);
  const mesActivo = mesSel || (mesesDisponibles.length ? (mesesDisponibles.at(-1) as string) : null);

  /* Pie por canal (mes activo) */
  const pieData = useMemo<{ name: string; value: number }[]>(() => {
    if (!mesActivo || !ventas?.length) return [];
    const map: Record<string, number> = {};
    ventas.forEach((r) => {
      if (r?.fecha && ymKey(r.fecha) === mesActivo) {
        const canal = (r.canal ?? "N/D") as string;
        const v = Number(r.ventas ?? 0);
        if (!Number.isFinite(v)) return;
        map[canal] = (map[canal] || 0) + v;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ventas, mesActivo]);

  /* Enviar */
  const enviar = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    lastUserRef.current = text;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");

    if (isGreeting(text) || text.length < 2) {
      setMessages((p) => [...p, { role: "assistant", content: t(lang, "chat.helper") }]);
      return;
    }

    // Cancelar petición previa, si la hubiera
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsTyping(true);
    const ai = await chatWithAI(next, mesActivo, mesesDisponibles, lang, 4, abortRef.current.signal);
    setIsTyping(false);

    if (ai) {
      setMessages((p) => [...p, { role: "assistant" as const, content: ai.assistant || (lang === "en" ? "Got it." : "Entendido.") }]);
      if (ai.specs?.length) {
        setGenerated((prev) => [...ai.specs, ...prev].slice(0, 8));
      } else {
        // Fallback local si no hubo specs
        const localSpec = parsePromptToSpec(text);
        if (localSpec) {
          setGenerated((prev) => [localSpec, ...prev].slice(0, 8));
          setMessages((p) => [
            ...p,
            { role: "assistant", content: lang === "en" ? "Generated a chart based on your request." : "He generado un gráfico según tu petición." },
          ]);
        }
      }
      return;
    }

    // IA falló o cancelado → fallback
    const localSpec = parsePromptToSpec(text);
    if (localSpec) {
      setGenerated((prev) => [localSpec, ...prev].slice(0, 8));
      setMessages((p) => [
        ...p,
        { role: "assistant", content: lang === "en" ? "Generated a chart based on your request." : "He generado un gráfico según tu petición." },
      ]);
    } else {
      setMessages((p) => [...p, { role: "assistant", content: t(lang, "chat.helper") }]);
    }
  };

  /* Regenerar y Detener */
  const onRegenerar = () => { const last = lastUserRef.current; if (last) enviar(last); };
  const onDetener = () => { abortRef.current?.abort(); setIsTyping(false); };

  /* Tooltip Recharts */
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
    borderRadius: 12,
    border: "1px solid rgba(63,63,70,.4)",
    color: theme === "dark" ? "#e5e7eb" : "#18181b",
    fontSize: "0.875rem",
  };

  /* Sugerencias */
  const SUGGESTIONS = [
    t(lang, "chat.example.1"),
    t(lang, "chat.example.2"),
    t(lang, "chat.example.3"),
    t(lang, "chat.example.4"),
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Clerk hardening */}
      <style>{`
        :where(.cl-modalBackdrop){background:rgba(0,0,0,.6)!important;backdrop-filter:blur(3px)!important}
        :where(.cl-card,.cl-userButtonPopoverCard){background:#0b0b0e!important;border:1px solid #27272a!important;box-shadow:0 10px 40px rgba(0,0,0,.55)!important}
        :where(.cl-headerTitle,.cl-headerSubtitle,.cl-text,.cl-formFieldLabel,.cl-userButtonPopoverActionButton){color:#e5e7eb!important}
        :where(.cl-input){background:#0f0f14!important;border-color:#3f3f46!important;color:#e5e7eb!important}
        :where(.cl-buttonPrimary){background:#111827!important;border-color:#1f2937!important;color:#f9fafb!important}
        :where(.cl-socialButtonsIconButton,.cl-button){background:#0f172a!important;border-color:#334155!important;color:#e5e7eb!important}
        :where(.cl-dividerLine){background:#27272a!important}
        :where(.cl-link){color:#93c5fd!important}
        :root:not(.dark) :where(.cl-card,.cl-userButtonPopoverCard){background:#ffffff!important;border:1px solid #e5e7eb!important}
        :root:not(.dark) :where(.cl-input){background:#ffffff!important;border-color:#d4d4d8!important;color:#111827!important}
        :root:not(.dark) :where(.cl-buttonPrimary){background:#111827!important;color:#f9fafb!important}
        :root:not(.dark) :where(.cl-text,.cl-headerTitle,.cl-headerSubtitle,.cl-formFieldLabel){color:#111827!important}
      `}</style>

      {/* Topbar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="mx-auto max-w-7xl h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Botón hamburguesa para abrir el drawer */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="mr-2 rounded-lg p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Open settings"
              title={lang === "en" ? "Open settings" : "Abrir ajustes"}
            >
              ☰
            </button>

            <img src="/vite.svg" alt="Logo" className="h-6 w-6" />
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
              {t(lang, "app.title")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="lang">{t(lang, "lang.label")}</label>
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

            <button
              onClick={toggle}
              className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={theme === "dark" ? t(lang, "theme.toggle.light") : t(lang, "theme.toggle.dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌞" : "🌙"}
            </button>

            <SignedIn><UserButton afterSignOutUrl="/" /></SignedIn>
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

      {/* Layout principal */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[30%_1fr]">
        {/* Sidebar / Chat */}
        <aside className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 lg:min-h-[calc(100vh-56px)] flex flex-col">
          <div className="p-4">
            <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-200">{t(lang, "chat.title")}</h2>

            {/* Input + acciones */}
            <div className="mt-3 flex gap-2">
              <textarea
                className="flex-1 min-h-[40px] max-h-[120px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none resize-y"
                placeholder={t(lang, "chat.placeholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                aria-label={t(lang, "chat.title")}
              />
              <button
                onClick={() => enviar()}
                disabled={!input.trim() || isTyping}
                className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t(lang, "send")}
              </button>
            </div>

            {/* Acciones: Regenerar / Detener */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={onRegenerar}
                disabled={!lastUserRef.current || isTyping}
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300/40 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                title={lang === "en" ? "Regenerate last request" : "Regenerar última petición"}
              >
                🔁 {lang === "en" ? "Regenerate" : "Regenerar"}
              </button>
              <button
                onClick={onDetener}
                disabled={!isTyping}
                className="text-xs px-2 py-1 rounded-lg border border-zinc-300/40 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                title={lang === "en" ? "Stop response" : "Detener respuesta"}
              >
                ⏹ {lang === "en" ? "Stop" : "Detener"}
              </button>
            </div>

            {/* Ejemplos — ENVIAN directamente */}
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => enviar(q)}
                  className="text-xs px-2 py-1 rounded-full border border-zinc-300/40 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {q}
                </button>
              ))}
            </div>

            {/* Mes */}
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
                  mesesDisponibles.map((m) => <option key={m} value={m}>{m}</option>)
                )}
              </select>
            </div>

            {/* Mensajes */}
            <div ref={chatRef} className="mt-4 px-1 space-y-2 overflow-y-auto max-h-[48vh]">
              {messages.map((m, i) => (
                <div key={`${i}-${m.role}`}
                  className={`max-w-[92%] rounded-2xl border px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-auto border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      : "mr-auto border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  }`}>
                  {m.content}
                </div>
              ))}
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

        {/* Panel principal (dashboard) */}
        <main className="overflow-y-auto">
          <div className="p-4 lg:p-6 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard label={t(lang, "kpi.salesMonth")} value={kpis ? euro(kpis.ventasMes) : "—"}
                        delta={kpis ? pct(kpis.deltaVentas) : "—"} positive={(kpis?.deltaVentas ?? 0) >= 0} loading={loading} />
              <KpiCard label={t(lang, "kpi.newCustomers")} value={kpis?.nuevosMes ?? "—"}
                        delta={kpis ? pct(kpis.deltaNuevos) : "—"} positive={(kpis?.deltaNuevos ?? 0) >= 0} loading={loading} />
              <KpiCard label={t(lang, "kpi.avgTicket")} value={kpis ? euro(kpis.ticketMedio) : "—"}
                        delta={kpis ? pct(kpis.deltaTicket) : "—"} positive={(kpis?.deltaTicket ?? 0) >= 0} loading={loading} />
            </div>

            {/* Gráfico de barras por defecto */}
            <ChartCard title={t(lang, "chart.bar.title")}>
              {loading ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">{t(lang, "loading")}</div>
              ) : err ? (
                <div className="h-full grid place-items-center text-sm text-rose-600">
                  {t(lang, "error")}: {typeof err === "string" ? err : String((err as any)?.message ?? err)}
                </div>
              ) : !serieBar?.length ? (
                <div className="h-full grid place-items-center text-sm text-zinc-500">{t(lang, "nodata")}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieBar} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="mes" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="gastos" name={lang === "en" ? "Expenses" : "Gastos"} radius={[6, 6, 0, 0]}
                          fill={theme === "dark" ? "#22c55e" : "#16a34a"} isAnimationActive animationDuration={800} />
                    <Bar dataKey="ventas" name={lang === "en" ? "Sales" : "Ventas"} radius={[6, 6, 0, 0]}
                          fill={theme === "dark" ? "#3b82f6" : "#2563eb"} isAnimationActive animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Pie por canal */}
            <ChartCard title={`${t(lang, "pie.title.prefix")}${mesActivo || "—"}`}
                       footer={lang === "en" ? "Count of operations per channel in the selected month." : "Cuenta de operaciones por canal en el mes seleccionado."}>
              <ChannelPie key={mesActivo || "none"} data={pieData} loading={loading} error={err} />
            </ChartCard>

            {/* Insights */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <div className="font-medium text-zinc-800 dark:text-zinc-200">{t(lang, "insights.title")}</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {kpis
                  ? t(lang, "insights.text", { sales: euro(kpis.ventasMes), delta: pct(kpis.deltaVentas), ticket: euro(kpis.ticketMedio) })
                  : lang === "en" ? "Load your data to see insights." : "Carga tus datos para ver insights."}
              </p>
            </div>

            {/* Gráficos de IA */}
            {generated.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">{t(lang, "ai.title")}</div>
                  <button onClick={() => setGenerated([])}
                          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          title={t(lang, "ai.clear")}>
                    {t(lang, "ai.clear")}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generated.map((spec) => (
                    <div key={spec.id || Math.random().toString(36).slice(2)} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                      <div className="text-sm font-medium mb-2">{spec.title}</div>
                      <DynamicChart spec={spec} ventas={ventas} serieBar={serieBar} mesActivo={mesActivo} />
                      {spec.notes && <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{spec.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Drawer lateral */}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggle}
      />
    </div>
  );
}
