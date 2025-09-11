// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";
import { ENV } from "../env.js";

type ChartType = "line" | "bar" | "area" | "pie";
type ChartSpec = {
  id: string;
  type: ChartType;
  title: string;
  intent:
    | "ventas_por_canal_mes"
    | "ventas_vs_gastos_mes"
    | "evolucion_ventas_n_meses"
    | "top_canales";
  params?: Record<string, any>;
  notes?: string;
};
type ChatMsg = { role: "user" | "assistant"; content: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const isGreeting = (s: string) =>
  /^(hola|buenas|hey|holi|que tal|qué tal|hi|hello|hey there)\b/i.test((s || "").trim());

function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);
  if (/(ventas|ingresos).*(canal)/.test(p)) {
    return [{ id: uid(), type: "pie", title: "Ventas por canal (mes activo)", intent: "ventas_por_canal_mes", params: {} }];
  }
  if (/ventas.*gastos|gastos.*ventas/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|months?)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return [{ id: uid(), type: "bar", title: `Ventas vs Gastos (últimos ${months} meses)`, intent: "ventas_vs_gastos_mes", params: { months } }];
  }
  if (/evolucion|tendencia|historico/.test(p) || /evolution|trend|history/.test(p) || /ultimos?\s+\d+\s+mes/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|months?)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return [{ id: uid(), type: "line", title: `Evolución de ventas (últimos ${months} meses)`, intent: "evolucion_ventas_n_meses", params: { months } }];
  }
  if (/top\s*\d+.*canales?/.test(p) || /top\s*\d+.*channels?/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return [{ id: uid(), type: "bar", title: `Top ${topN} canales (mes activo)`, intent: "top_canales", params: { topN }, notes: "Ordenado por ventas descendentes." }];
  }
  return [];
}

function humanFallbackReply(opts: {
  lang: "es" | "en";
  specs: ChartSpec[];
  lastUser: string;
  mesActivo: string | null;
  mesesDisponibles: string[];
  reason?: string;
}) {
  const { lang, specs, lastUser, mesActivo, mesesDisponibles } = opts;
  const reason = opts.reason ? ` [fallback: ${opts.reason}]` : "";
  if (!specs.length && isGreeting(lastUser)) {
    return lang === "en"
      ? `Hi! 👋 What would you like to analyze today? I can plot “sales by channel”, “sales vs expenses last 8 months”, “sales trend last 6 months”, or “top 3 channels”.${reason}`
      : `¡Hola! 👋 ¿Qué te gustaría analizar hoy? Puedo trazar «ventas por canal», «ventas vs gastos últimos 8 meses», «tendencia de ventas últimos 6 meses» o un «top 3 canales».${reason}`;
  }
  if (!specs.length) {
    return lang === "en"
      ? `Got it. Which metric and time range should I use (e.g., sales last 6 months, or YTD)?${reason}`
      : `Entendido. ¿Qué métrica y rango temporal uso (por ejemplo, ventas de los últimos 6 meses o YTD)?${reason}`;
  }
  const s = specs[0];
  const hint = mesActivo
    ? (lang === "en" ? `using active month ${mesActivo}` : `usando el mes activo ${mesActivo}`)
    : (mesesDisponibles.length ? (lang === "en" ? `available months: ${mesesDisponibles.join(", ")}` : `meses disponibles: ${mesesDisponibles.join(", ")}`) : "");
  if (s.intent === "ventas_por_canal_mes") {
    return lang === "en"
      ? `I'll show sales distributed by channel for the active month ${hint ? `(${hint})` : ""}.${reason}`
      : `Te muestro las ventas por canal del mes activo ${hint ? `(${hint})` : ""}.${reason}`;
  }
  if (s.intent === "ventas_vs_gastos_mes") {
    const m = Number(s.params?.months ?? 8);
    return lang === "en"
      ? `Comparing sales vs expenses for the last ${m} months ${hint ? `(${hint})` : ""}.${reason}`
      : `Comparo ventas vs gastos de los últimos ${m} meses ${hint ? `(${hint})` : ""}.${reason}`;
  }
  if (s.intent === "evolucion_ventas_n_meses") {
    const m = Number(s.params?.months ?? 6);
    return lang === "en"
      ? `Plotting the sales trend for the last ${m} months ${hint ? `(${hint})` : ""}.${reason}`
      : `Trazo la tendencia de ventas de los últimos ${m} meses ${hint ? `(${hint})` : ""}.${reason}`;
  }
  if (s.intent === "top_canales") {
    const topN = Number(s.params?.topN ?? 5);
    return lang === "en"
      ? `Showing the top ${topN} channels for the active month ${hint ? `(${hint})` : ""}.${reason}`
      : `Muestro el top ${topN} canales del mes activo ${hint ? `(${hint})` : ""}.${reason}`;
  }
  return lang === "en" ? `Got it.${reason}` : `Entendido.${reason}`;
}

async function llmReply(opts: {
  lang: "es" | "en";
  specs: ChartSpec[];
  history: ChatMsg[];
  mesActivo: string | null;
  mesesDisponibles: string[];
  log: (msg: string, extra?: any) => void;
}): Promise<{ text: string; usedLLM: boolean; reason?: string }> {
  const { lang, specs, history, mesActivo, mesesDisponibles, log } = opts;
  const lastUser = history.slice().reverse().find((m) => m.role === "user")?.content || "";

  if (!ENV.OPENAI_API_KEY) {
    const text = humanFallbackReply({ lang, specs, lastUser, mesActivo, mesesDisponibles, reason: "no_api_key" });
    log("LLM disabled: missing OPENAI_API_KEY");
    return { text, usedLLM: false, reason: "no_api_key" };
  }

  const intentSummary = specs.length
    ? `Intent: ${specs[0].intent} ${JSON.stringify(specs[0].params || {})}.`
    : `No clear chart intent detected.`;

  const monthHint = mesActivo
    ? (lang === "en" ? `Active month: ${mesActivo}.` : `Mes activo: ${mesActivo}.`)
    : (mesesDisponibles.length
      ? (lang === "en" ? `Available months: ${mesesDisponibles.join(", ")}.` : `Meses disponibles: ${mesesDisponibles.join(", ")}.`)
      : "");

  const system = lang === "en"
    ? `You are MiKPI, a friendly analytics copilot. Reply ONLY in English. Be concise (2–3 short sentences), warm and helpful. If a chart intent exists, say what you'll show and ask ONE helpful follow-up.`
    : `Eres MiKPI, un copiloto de analítica. Responde SOLO en español. Sé conciso (2–3 frases), cercano y útil. Si hay intención de gráfico, di qué mostrarás y haz UNA pregunta de seguimiento.`;

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 200,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${lang === "en" ? "Context" : "Contexto"}: ${intentSummary} ${monthHint}` },
      ...history.slice(-6),
      { role: "user", content: lastUser || "" },
    ],
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      log("OpenAI error", { status: r.status, statusText: r.statusText });
      const text = humanFallbackReply({ lang, specs, lastUser, mesActivo, mesesDisponibles, reason: `openai_http_${r.status}` });
      return { text, usedLLM: false, reason: `openai_http_${r.status}` };
    }
    const data = await r.json();
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      (lang === "en" ? "Got it." : "Entendido.");
    return { text, usedLLM: true };
  } catch (e: any) {
    log("OpenAI fetch failed", { error: String(e?.message || e) });
    const text = humanFallbackReply({ lang, specs, lastUser, mesActivo, mesesDisponibles, reason: "openai_fetch_error" });
    return { text, usedLLM: false, reason: "openai_fetch_error" };
  }
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/chat", async (req, reply) => {
    const body = (req.body ?? {}) as {
      messages?: ChatMsg[];
      lang?: "es" | "en";
      mesActivo?: string | null;
      mesesDisponibles?: string[];
      maxCharts?: number;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lang: "es" | "en" = body.lang === "en" ? "en" : "es";
    const mesActivo: string | null = body.mesActivo ?? null;
    const mesesDisponibles = Array.isArray(body.mesesDisponibles) ? body.mesesDisponibles : [];
    const maxCharts = Math.max(1, Math.min(4, Number(body.maxCharts) || 4));

    const lastUser = [...messages].reverse().find((m) => m?.role === "user")?.content || "";
    const specs = inferSpecsFromText(lastUser);

    const { text, usedLLM, reason } = await llmReply({
      lang, specs, history: messages, mesActivo, mesesDisponibles,
      log: (msg, extra) => app.log.info({ msg, extra })
    });

    app.log.info({ route: "POST /api/chat", usedLLM, reason });

    return reply.send({
      reply: text,
      specs: specs.slice(0, maxCharts),
      usedLLM,                // 👈 DEBUG: para que lo veas desde el front / curl
      reason                  // 👈 DEBUG: motivo del fallback si aplica
    });
  });
};
