// src/App.tsx
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSheetData } from "./hooks/useSheetData";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import { useDarkMode } from "./hooks/useDarkMode";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import DynamicChart from "./components/DynamicChart";
import { parsePromptToSpec } from "./ai/parsePrompt";
import type { ChartSpec } from "./types/chart";
import { t, type Lang } from "./i18n";
import { useLang } from "./hooks/useLang";
import SettingsDrawer from "./components/SettingsDrawer";
import { API_BASE } from "./config";

// 🔹 NUEVO: Ask (SQL/NQL)
import { askLLM, type AskResponse } from "./ai/askClient";
import GenericResultChart from "./components/GenericResultChart";

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
const LS_SIDEBAR = "mikpi:sidebar-collapsed";

/* ===== API chat (helper local) ===== */
async function chatWithAI(
  history: ChatMessage[],
  mesActivo: string | null,
  ventasMonths: string[],
  clientesMonths: string[],
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
      body: JSON.stringify({
        messages: history,
        mesActivo,
        ventasMonths,
        clientesMonths,
        lang,
        maxCharts,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return {
      assistant: typeof data.reply === "string" ? data.reply : (lang === "en" ? "Ok." : "Vale."),
      specs: Array.isArray(data.specs) ? (data.specs as ChartSpec[]) : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ===== Localización de títulos ===== */
const MONTH_LABELS = {
  es: { "01":"Enero","02":"Febrero","03":"Marzo","04":"Abril","05":"Mayo","06":"Junio","07":"Julio","08":"Agosto","09":"Septiembre","10":"Octubre","11":"Noviembre","12":"Diciembre" },
  en: { "01":"January","02":"February","03":"March","04":"April","05":"May","06":"June","07":"July","08":"August","09":"September","10":"October","11":"November","12":"December" },
};
function monthFromYM(ym?: string) {
  if (!ym) return null;
  const m = ym.split("-")[1];
  return m && m.padStart(2, "0");
}
function localizeTitle(spec: ChartSpec, lang: "es" | "en"): string {
  const p = spec.params || {};
  switch (spec.intent) {
    case "ventas_vs_gastos_mes":
      return lang === "en"
        ? `Sales vs Expenses (last ${p.months ?? 8} months)`
        : `Ventas vs Gastos (últimos ${p.months ?? 8} meses)`;
    case "evolucion_ventas_n_meses":
      return lang === "en"
        ? `Sales evolution (last ${p.months ?? 6} months)`
        : `Evolución de ventas (últimos ${p.months ?? 6} meses)`;
    case "ventas_por_canal_mes":
      return lang === "en" ? "Sales by channel (active month)" : "Ventas por canal (mes activo)";
    case "top_canales":
      return lang === "en"
        ? `Top ${p.topN ?? 5} channels (active month)`
        : `Top ${p.topN ?? 5} canales (mes activo)`;
    case "ventas_vs_gastos_dos_meses": {
      const [a, b] = Array.isArray(p.months) ? p.months : [];
      const A = MONTH_LABELS[lang][monthFromYM(a) ?? ""] ?? a ?? "?";
      const B = MONTH_LABELS[lang][monthFromYM(b) ?? ""] ?? b ?? "?";
      return lang === "en" ? `Sales vs Expenses (${A} vs ${B})` : `Ventas vs Gastos (${A} vs ${B})`;
    }
    case "nuevos_clientes_n_meses":
      return lang === "en"
        ? `New customers (last ${p.months ?? 6} months)`
        : `Nuevos clientes (últimos ${p.months ?? 6} meses)`;
    default:
      return spec.title;
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

  /* Drawer & sidebar colapsable */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_SIDEBAR) === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(LS_SIDEBAR, collapsed ? "1" : "0"); } catch {} }, [collapsed]);

  /* Chat */
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: t(lang, "chat.greeting") },
  ]);
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const lastUserRef = useRef<string>("");

  /* NUEVO: Ask (SQL/NQL) */
  const [askText, setAskText] = useState<string>("");
  const [askLoading, setAskLoading] = useState<boolean>(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);

  /* Cancelación chat */
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  /* Gráficos generados por /api/chat */
  const [generated, setGenerated] = useState<ChartSpec[]>([]);

  /* Auto-scroll chat */
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    queueMicrotask(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, isTyping, lang]);

  /* Hidratar/guardar chat y charts */
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

  /* ===== Disponibilidad real de meses ===== */
  const ventasMonths = useMemo<string[]>(() => {
    if (Array.isArray(serieBar) && serieBar.length) {
      return Array.from(new Set(serieBar.map(p => p.mes))).sort();
    }
    const s = new Set<string>();
    ventas?.forEach(v => v?.fecha && s.add(ymKey(v.fecha)));
    return Array.from(s).sort();
  }, [serieBar, ventas]);

  const clientesMonths = useMemo<string[]>(() => {
    const s = new Set<string>();
    clientes?.forEach(c => c?.fecha && s.add(ymKey(c.fecha)));
    return Array.from(s).sort();
  }, [clientes]);

  /* Meses “globales” (para selector) */
  const mesesDisponibles = useMemo<string[]>(() => {
    const s = new Set<string>([...ventasMonths, ...clientesMonths]);
    return Array.from(s).sort();
  }, [ventasMonths, clientesMonths]);

  const [mesSel, setMesSel] = useState<string | null>(null);
  useEffect(() => {
    if (!mesSel && mesesDisponibles.length) setMesSel(mesesDisponibles.at(-1) ?? null);
  }, [mesesDisponibles, mesSel]);
  const mesActivo = mesSel || (mesesDisponibles.length ? (mesesDisponibles.at(-1) as string) : null);

  /* Enviar Chat */
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

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsTyping(true);
    const ai = await chatWithAI(next, mesActivo, ventasMonths, clientesMonths, lang, 4, abortRef.current.signal);
    setIsTyping(false);

    if (ai) {
      setMessages((p) => [...p, { role: "assistant" as const, content: ai.assistant || (lang === "en" ? "Got it." : "Entendido.") }]);
      if (ai.specs?.length) {
        setGenerated((prev) => [...ai.specs, ...prev].slice(0, 8));
      } else {
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

    // Fallback total
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

  /* Acciones chat */
  const onRegenerar = () => { const last = lastUserRef.current; if (last) enviar(last); };
  const onDetener = () => { abortRef.current?.abort(); setIsTyping(false); };
  const onClearChat = () => { setMessages([{ role: "assistant", content: t(lang, "chat.greeting") }]); setGenerated([]); };

  /* Ejecutar ASK */
  async function runAsk() {
    if (!askText.trim()) return;
    setAskLoading(true); setAskError(null);
    try {
      const res = await askLLM(askText.trim(), lang, { ventasMonths, clientesMonths });
      setAskResult(res);
    } catch (e: any) {
      setAskError(e.message || String(e));
    } finally {
      setAskLoading(false);
    }
  }
  function clearAsk() { setAskResult(null); setAskText(""); setAskError(null); }

  /* Tooltip Recharts */
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
    borderRadius: 12,
    border: "1px solid rgba(63,63,70,.4)",
    color: theme === "dark" ? "#e5e7eb" : "#18181b",
    fontSize: "0.875rem",
  };

  /* Sugerencias quick */
  const SUGGESTIONS = [
    t(lang, "chat.example.1"),
    t(lang, "chat.example.2"),
    t(lang, "chat.example.3"),
    t(lang, "chat.example.4"),
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Clerk tweaks */}
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
      <div className="mx-auto max-w-7xl">
        <div className="flex">
          {/* Sidebar / Chat + Ask */}
          <aside
            className={`
              relative shrink-0 transition-all duration-300 ease-out
              bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800
              shadow-sm dark:shadow-none
            `}
            style={{ width: collapsed ? 56 : 360, minHeight: "calc(100vh - 56px)", willChange: "width" }}
          >
            {collapsed ? (
              <div className="h-full flex flex-col items-center justify-start pt-4 gap-3">
                <button
                  onClick={() => setCollapsed(false)}
                  className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={lang === "en" ? "Open chat" : "Abrir chat"}
                >
                  💬
                </button>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={lang === "en" ? "Settings" : "Ajustes"}
                >
                  ☰
                </button>
              </div>
            ) : (
              <div className="p-4 h-full overflow-y-auto no-scrollbar">
                <h2 className="text-base font-medium text-zinc-700 dark:text-zinc-200">{t(lang, "chat.title")}</h2>

                {/* Input + acciones (Chat) */}
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

                {/* Acciones Chat */}
                <div className="mt-2 flex flex-wrap gap-2">
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
                  <button
                    onClick={onClearChat}
                    className="text-xs px-2 py-1 rounded-lg border border-zinc-300/40 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title={lang === "en" ? "Clear chat" : "Limpiar chat"}
                  >
                    🧹 {lang === "en" ? "Clear chat" : "Limpiar chat"}
                  </button>
                </div>

                {/* Mensajes del Chat */}
                <div ref={chatRef} className="mt-3 px-1 space-y-2 overflow-y-auto no-scrollbar max-h-[36vh]">
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

                {/* ─────────────────────────────
                    ASK (pregunta libre con SQL)
                   ───────────────────────────── */}
                <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <div className="text-sm font-medium mb-2">
                    {lang==="en" ? "Ask (any data question)" : "Ask (pregunta libre)"}
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-900"
                      placeholder={lang==="en" ? "e.g., most profitable customers" : "ej., clientes más rentables"}
                      value={askText}
                      onChange={(e)=>setAskText(e.target.value)}
                      onKeyDown={(e)=>{ if(e.key==="Enter") runAsk(); }}
                    />
                    <button
                      onClick={runAsk}
                      disabled={askLoading}
                      className="rounded-lg px-3 py-2 text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
                    >
                      {askLoading ? (lang==="en"?"Running...":"Ejecutando...") : "Ask"}
                    </button>
                    {askResult && (
                      <button
                        onClick={clearAsk}
                        className="rounded-lg px-3 py-2 text-sm border border-zinc-300/40 dark:border-zinc-700"
                      >
                        {lang==="en" ? "Clear" : "Limpiar"}
                      </button>
                    )}
                  </div>
                  {askError && <div className="mt-2 text-xs text-rose-600">{askError}</div>}
                  {askResult?.askBack && (
                    <div className="mt-2 text-xs text-zinc-500">
                      <strong>{lang==="en"?"Clarify:":"Aclarar:"}</strong> {askResult.askBack}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pestañita */}
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="absolute top-1/2 -right-3 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm hover:scale-105 transition"
              title={collapsed ? (lang === "en" ? "Open chat" : "Abrir chat") : (lang === "en" ? "Collapse chat" : "Colapsar chat")}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-hidden">
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

              {/* Gráfico por defecto */}
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

              {/* ⇩ RESULTADOS DE ASK (gráfico + tabla + SQL) */}
              {askResult && (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200">
                      {askResult.chartSpec?.title || (lang==="en"?"Generated chart":"Gráfico generado")}
                    </div>
                    <div className="text-xs text-zinc-500">{askResult.explanation}</div>
                  </div>

                  <div className="mt-3">
                    <GenericResultChart
                      fields={askResult.fields}
                      rows={askResult.rows}
                      spec={askResult.chartSpec}
                      height={320}
                    />
                  </div>

                  <details className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <summary className="text-sm cursor-pointer">{lang==="en"?"Show details":"Ver detalles"}</summary>
                    <div className="mt-2">
                      <div className="text-xs font-mono whitespace-pre-wrap break-words">{askResult.sql}</div>
                      <div className="mt-3 overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr>{askResult.fields.map(f => <th key={f} className="text-left pr-4 py-1">{f}</th>)}</tr>
                          </thead>
                          <tbody>
                            {askResult.rows.slice(0,100).map((r,i)=>(
                              <tr key={i}>
                                {askResult.fields.map(f => <td key={f} className="pr-4 py-1">{String(r[f])}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* Insights */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <div className="font-medium text-zinc-800 dark:text-zinc-200">{t(lang, "insights.title")}</div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {kpis
                    ? t(lang, "insights.text", { sales: euro(kpis.ventasMes), delta: pct(kpis.deltaVentas), ticket: euro(kpis.ticketMedio) })
                    : lang === "en" ? "Load your data to see insights." : "Carga tus datos para ver insights."}
                </p>
              </div>

              {/* Gráficos IA (del chat) */}
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
                        <div className="text-sm font-medium mb-2">{localizeTitle(spec, lang)}</div>
                        <DynamicChart
                          spec={spec}
                          ventas={ventas}
                          clientes={clientes}
                          serieBar={serieBar}
                          mesActivo={mesActivo}
                          lang={lang}
                        />
                        {spec.notes && <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{spec.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
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
