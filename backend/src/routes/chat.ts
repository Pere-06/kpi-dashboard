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
    | "top_canales"
    | "ventas_vs_gastos_dos_meses";
  params?: Record<string, any>;
  notes?: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** ===== Parser básico (igual que en el front) ===== */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  if (/(ventas|ingresos).*(canal)/.test(p) || /(sales).*(channel)/.test(p)) {
    return [{ id: uid(), type: "pie", title: "Ventas por canal (mes activo)", intent: "ventas_por_canal_mes", params: {} }];
  }

  if (/ventas.*gastos|gastos.*ventas|sales.*expenses|expenses.*sales/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return [{ id: uid(), type: "bar", title: `Ventas vs Gastos (últimos ${months} meses)`, intent: "ventas_vs_gastos_mes", params: { months } }];
  }

  if (/evolucion|tendencia|historico|evolution|trend|history/.test(p) || /ultimos?\s+\d+\s+mes|last\s+\d+\s+month/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return [{ id: uid(), type: "line", title: `Evolución de ventas (últimos ${months} meses)`, intent: "evolucion_ventas_n_meses", params: { months } }];
  }

  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return [{ id: uid(), type: "bar", title: `Top ${topN} canales (mes activo)`, intent: "top_canales", params: { topN }, notes: "Ordenado por ventas descendentes." }];
  }

  return [];
}

/** ===== Utilidades de meses ES/EN -> número (1..12) ===== */
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function monthNameToIndex(s: string): number | null {
  const p = norm(s);
  const idxEn = MONTHS_EN.indexOf(p);
  if (idxEn >= 0) return idxEn + 1;
  const idxEs = MONTHS_ES.indexOf(p);
  if (idxEs >= 0) return idxEs + 1;
  return null;
}

/** Dado un número de mes (1..12), escoge el YYYY-MM más reciente de mesesDisponibles que tenga ese mes */
function pickLatestForMonth(mesesDisponibles: string[], monthNum: number): string | null {
  const filtered = mesesDisponibles.filter((ym) => {
    const [, mm] = ym.split("-");
    return Number(mm) === monthNum;
  });
  if (!filtered.length) return null;
  // más reciente (lexicográfico por YYYY-MM vale)
  return filtered.sort().at(-1) || null;
}

/** Detecta “marzo vs junio” o “march vs june” en el texto y lo mapea a dos YYYY-MM */
function tryTwoMonthComparison(text: string, mesesDisponibles: string[], lang: "es" | "en"): ChartSpec[] {
  const p = norm(text);
  const wantsVs =
    /(ventas.*gastos|gastos.*ventas)/.test(p) ||
    /(sales.*expenses|expenses.*sales)/.test(p);

  if (!wantsVs) return [];

  // extraer nombres de meses
  const names: string[] = [];
  for (const name of [...MONTHS_EN, ...MONTHS_ES]) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (re.test(text)) names.push(name);
  }

  if (names.length < 2) return [];

  // Nos quedamos con los 2 primeros distintos
  const [m1Name, m2Name] = Array.from(new Set(names)).slice(0, 2);
  const m1 = monthNameToIndex(m1Name);
  const m2 = monthNameToIndex(m2Name);
  if (!m1 || !m2) return [];

  const ym1 = pickLatestForMonth(mesesDisponibles, m1);
  const ym2 = pickLatestForMonth(mesesDisponibles, m2);
  if (!ym1 || !ym2) return [];

  const title = lang === "en"
    ? `Sales vs Expenses (${ym1} vs ${ym2})`
    : `Ventas vs Gastos (${ym1} vs ${ym2})`;

  return [{
    id: uid(),
    type: "bar",
    title,
    intent: "ventas_vs_gastos_dos_meses",
    params: { months: [ym1, ym2] },
    notes: lang === "en" ? "Direct comparison between two months." : "Comparativa directa entre dos meses.",
  }];
}

/** Prompt del asistente (tono humano + idioma) */
function systemPrompt(lang: "es" | "en", mesActivo: string | null) {
  const base =
    lang === "en"
      ? `You are MiKPI's analytics copilot. Be concise, friendly, and helpful. Always answer in English. When the user asks for charts, you may return a short explanation plus chart intents. Current active month: ${mesActivo ?? "N/A"}.`
      : `Eres el copiloto de analítica de MiKPI. Sé cercano, claro y útil. Responde SIEMPRE en español. Si el usuario pide gráficos, puedes devolver una breve explicación y sugerir intents. Mes activo actual: ${mesActivo ?? "N/D"}.`;
  const style =
    lang === "en"
      ? `Tone: practical, warm, one or two short sentences unless the user asks for detail.`
      : `Tono: práctico y cercano; responde en una o dos frases salvo que pidan detalle.`;
  return `${base}\n${style}`;
}

/** Llamada a OpenAI (opcional, para tono humano) */
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
        temperature: 0.5,
        max_tokens: 280,
        messages: [
          { role: "system", content: systemPrompt(lang, mesActivo) },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      throw new Error(`openai_http_${r.status}:${errText}`);
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
    const mesesDisponibles = Array.isArray(body.mesesDisponibles) ? body.mesesDisponibles : [];
    const maxCharts = Math.max(1, Math.min(4, Number(body.maxCharts) || 4));

    const lastUser = [...messages].reverse().find((m) => m?.role === "user")?.content || "";

    // 1) Intent específico: dos meses con nombres → mapea a YYYY-MM si es posible
    let specs: ChartSpec[] = tryTwoMonthComparison(lastUser, mesesDisponibles, lang);

    // 2) Si no, probar parser básico
    if (!specs.length) specs = inferSpecsFromText(lastUser);

    // 3) Asistente LLM “humano”
    let assistant = "";
    let usedLLM = false;
    let reason = "ok";

    try {
      assistant = await askOpenAI({ messages, lang, mesActivo });
      usedLLM = Boolean(assistant);
    } catch (e: any) {
      usedLLM = false;
      reason = e?.message || "openai_fetch_error";
      assistant =
        lang === "en"
          ? "I prepared something based on your request."
          : "He preparado algo según tu petición.";
    }

    // 4) Si no pudimos generar specs y el usuario mencionó meses → pedir aclaración
    if (!specs.length && /january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i.test(lastUser)) {
      const q = lang === "en"
        ? "Which exact months should I compare? For example: 2025-03 vs 2025-06."
        : "¿Qué meses exactos debo comparar? Por ejemplo: 2025-03 vs 2025-06.";
      assistant = `${assistant}\n\n${q}`;
    }

    // 5) Si aún sin specs, añade ayuda estándar
    if (!specs.length) {
      const helper = lang === "en"
        ? `I can create charts like: “sales by channel”, “sales vs expenses last 8 months”, “sales evolution last 6 months”, “top 3 channels”.`
        : `Puedo crear gráficos como: «ventas por canal», «ventas vs gastos últimos 8 meses», «evolución de ventas últimos 6 meses», «top 3 canales».`;
      if (!assistant || assistant.length < 8) assistant = helper;
      else assistant += `\n\n${helper}`;
    }

    return reply.send({
      reply: assistant,
      specs: specs.slice(0, maxCharts),
      usedLLM,
      reason,
      debug: { mesActivo, mesesDisponibles },
    });
  });
};
