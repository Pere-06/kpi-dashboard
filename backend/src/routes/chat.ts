import type { FastifyPluginAsync } from "fastify";

import { ENV } from "../env.js";

/** Tipos alineados con tu frontend */
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

/** Parser básico (espejo del front) */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  if (/(ventas|ingresos).*(canal)/.test(p)) {
    return [
      {
        id: uid(),
        type: "pie",
        title: "Ventas por canal (mes activo)",
        intent: "ventas_por_canal_mes",
        params: {},
      },
    ];
  }

  if (/ventas.*gastos|gastos.*ventas/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return [
      {
        id: uid(),
        type: "bar",
        title: `Ventas vs Gastos (últimos ${months} meses)`,
        intent: "ventas_vs_gastos_mes",
        params: { months },
      },
    ];
  }

  if (/evolucion|tendencia|historico/.test(p) || /ultimos?\s+\d+\s+mes/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return [
      {
        id: uid(),
        type: "line",
        title: `Evolución de ventas (últimos ${months} meses)`,
        intent: "evolucion_ventas_n_meses",
        params: { months },
      },
    ];
  }

  if (/top\s*\d+.*canales?/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return [
      {
        id: uid(),
        type: "bar",
        title: `Top ${topN} canales (mes activo)`,
        intent: "top_canales",
        params: { topN },
        notes: "Ordenado por ventas descendentes.",
      },
    ];
  }

  return [];
}

/** Prompt del asistente (tono humano + idioma) */
function systemPrompt(lang: "es" | "en", mesActivo: string | null) {
  const base =
    lang === "en"
      ? `You are MiKPI's analytics copilot. Be concise, friendly, and helpful. Always answer in **English**. When the user asks for charts, you may return a short explanation plus chart intents. Current active month: ${mesActivo ?? "N/A"}.`
      : `Eres el copiloto de analítica de MiKPI. Sé cercano, claro y útil. Responde SIEMPRE en **español**. Si el usuario pide gráficos, puedes devolver una breve explicación y sugerir intents. Mes activo actual: ${mesActivo ?? "N/D"}.`;
  const style =
    lang === "en"
      ? `Tone: practical, warm, one or two short sentences unless the user asks for detail.`
      : `Tono: práctico y cercano; responde en una o dos frases salvo que pidan detalle.`;
  return `${base}\n${style}`;
}

/** Llamada a OpenAI */
async function askOpenAI({
  messages,
  lang,
  mesActivo,
  timeoutMs = 18000,
}: {
  messages: ChatMsg[];
  lang: "es" | "en";
  mesActivo: string | null;
  timeoutMs?: number;
}): Promise<string> {
  if (!ENV.OPENAI_API_KEY) throw new Error("no_api_key");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ENV.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 280,
        messages: [
          { role: "system", content: systemPrompt(lang, mesActivo) },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      const msg = `openai_http_${r.status}`;
      throw new Error(`${msg}:${errText}`);
    }
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(t);
  }
}

/** Plugin Fastify que registra POST /api/chat */
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
    const mesesDisponibles = Array.isArray(body.mesesDisponibles)
      ? body.mesesDisponibles
      : [];
    const maxCharts = Math.max(1, Math.min(4, Number(body.maxCharts) || 4));

    const lastUser =
      [...messages].reverse().find((m) => m?.role === "user")?.content || "";

    // 1) Intentar inferir specs por patrones
    const specs = inferSpecsFromText(lastUser);

    // 2) Intentar respuesta LLM “humana”
    let assistant = "";
    let usedLLM = false;
    let reason = "ok";

    try {
      assistant = await askOpenAI({ messages, lang, mesActivo });
      usedLLM = Boolean(assistant);
    } catch (e: any) {
      usedLLM = false;
      reason = e?.message || "openai_fetch_error";
      // Si falla, devolvemos una respuesta cortita local
      assistant =
        lang === "en"
          ? "I prepared something based on your request."
          : "He preparado algo según tu petición.";
    }

    // 3) Si no hubo specs, pero el usuario pidió algo de gráfico, ofrece sugerencias
    if (!specs.length) {
      const helper =
        lang === "en"
          ? `I can create charts like: “sales by channel”, “sales vs expenses last 8 months”, “sales evolution last 6 months”, “top 3 channels”.`
          : `Puedo crear gráficos como: «ventas por canal», «ventas vs gastos últimos 8 meses», «evolución de ventas últimos 6 meses», «top 3 canales».`;

      // Si assistant quedó muy corto, añade helper
      if (!assistant || assistant.length < 8) assistant = helper;
      else assistant += `\n\n${helper}`;
    }

    return reply.send({
      reply: assistant,
      specs: specs.slice(0, maxCharts),
      usedLLM,
      reason,
      debug: {
        mesActivo,
        mesesDisponibles,
      },
    });
  });
};
