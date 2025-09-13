// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";
import { ENV } from "../env.js";

/* ===== Tipos ===== */
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

/* ===== Helpers ===== */
const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const MONTH_ALIASES: Record<string, number> = {
  // EN
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
  // ES
  ene: 1, enero: 1,
  febr: 2, feb: 2, febrero: 2,
  marz: 3, mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

function monthTokenToIndex(tokenRaw: string): number | null {
  const token = norm(tokenRaw).replace(/\.$/, ""); // quita punto final de "jun."
  return MONTH_ALIASES[token] ?? null;
}

/** Escoge el YYYY-MM más reciente de mesesDisponibles para un número de mes (1..12) */
function pickLatestForMonth(mesesDisponibles: string[], monthNum: number, yearHint?: number | null): string | null {
  const filtered = mesesDisponibles.filter((ym) => {
    const [y, m] = ym.split("-");
    const mm = Number(m);
    if (mm !== monthNum) return false;
    if (yearHint && Number(y) !== yearHint) return false;
    return true;
  });
  if (!filtered.length) return null;
  return filtered.sort().at(-1) || null; // lexicográfico sirve para YYYY-MM
}

/** Intenta extraer dos YYYY-MM explícitos (p.ej. "2024-03 vs 2025-06") */
function extractTwoExplicitYM(text: string): string[] {
  const ys = Array.from(text.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)).map((m) => m[0]);
  const uniq: string[] = [];
  for (const ym of ys) if (!uniq.includes(ym)) uniq.push(ym);
  return uniq.slice(0, 2);
}

/** Intenta extraer (mes[, año]) x2 desde nombres/abreviaturas en ES/EN */
function extractTwoNamedMonths(text: string, mesesDisponibles: string[]): { ym1: string | null; ym2: string | null } {
  const tokens = norm(text).split(/[^a-z0-9\-]+/).filter(Boolean);

  // Busca posibles pares: (month [year]?), dos ocurrencias
  type Hit = { monthNum: number, year?: number | null };
  const hits: Hit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const mNum = monthTokenToIndex(tokens[i]);
    if (!mNum) continue;

    // Mira si el token siguiente es un año (ej. 2024)
    let y: number | null = null;
    const nxt = tokens[i + 1];
    if (nxt && /^\d{4}$/.test(nxt)) {
      const yn = Number(nxt);
      if (yn >= 2000 && yn <= 2100) y = yn;
    }
    hits.push({ monthNum: mNum, year: y });
    if (hits.length >= 2) break;
  }

  if (hits.length < 2) return { ym1: null, ym2: null };

  const ym1 = pickLatestForMonth(mesesDisponibles, hits[0].monthNum, hits[0].year ?? undefined);
  const ym2 = pickLatestForMonth(mesesDisponibles, hits[1].monthNum, hits[1].year ?? undefined);
  return { ym1, ym2 };
}

/* ===== Parser básico (coincide con el front) ===== */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  // Ventas por canal (pie)
  if (/(ventas|ingresos).*(canal)/.test(p) || /(sales).*(channel)/.test(p)) {
    return [{
      id: uid(),
      type: "pie",
      title: "Ventas por canal (mes activo)",
      intent: "ventas_por_canal_mes",
      params: {},
    }];
  }

  // Ventas vs gastos últimos N meses (bar)
  if (/ventas.*gastos|gastos.*ventas|sales.*expenses|expenses.*sales/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return [{
      id: uid(),
      type: "bar",
      title: `Ventas vs Gastos (últimos ${months} meses)`,
      intent: "ventas_vs_gastos_mes",
      params: { months },
    }];
  }

  // Evolución de ventas N meses (line)
  if (/evolucion|tendencia|historico|evolution|trend|history/.test(p) ||
      /ultimos?\s+\d+\s+mes|last\s+\d+\s+month/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    return [{
      id: uid(),
      type: "line",
      title: `Evolución de ventas (últimos ${months} meses)`,
      intent: "evolucion_ventas_n_meses",
      params: { months },
    }];
  }

  // Top N canales (bar)
  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    return [{
      id: uid(),
      type: "bar",
      title: `Top ${topN} canales (mes activo)`,
      intent: "top_canales",
      params: { topN },
      notes: "Ordenado por ventas descendentes.",
    }];
  }

  return [];
}

/* ===== Detección robusta de “dos meses” ===== */
function tryTwoMonthComparison(text: string, mesesDisponibles: string[], lang: "es" | "en"): ChartSpec[] {
  const p = norm(text);
  const mentionsVs =
    /(ventas.*gastos|gastos.*ventas)/.test(p) ||
    /(sales.*expenses|expenses.*sales)/.test(p) ||
    /\bvs\b|\bversus\b/.test(p);

  if (!mentionsVs) return [];

  // 1) Intento explícito `YYYY-MM`
  const ym = extractTwoExplicitYM(text);
  if (ym.length === 2) {
    return [{
      id: uid(),
      type: "bar",
      title: lang === "en" ? `Sales vs Expenses (${ym[0]} vs ${ym[1]})` : `Ventas vs Gastos (${ym[0]} vs ${ym[1]})`,
      intent: "ventas_vs_gastos_dos_meses",
      params: { months: ym },
      notes: lang === "en" ? "Direct comparison between two months." : "Comparativa directa entre dos meses.",
    }];
  }

  // 2) Nombres/abreviaturas con o sin año
  const { ym1, ym2 } = extractTwoNamedMonths(text, mesesDisponibles);
  if (ym1 && ym2) {
    return [{
      id: uid(),
      type: "bar",
      title: lang === "en" ? `Sales vs Expenses (${ym1} vs ${ym2})` : `Ventas vs Gastos (${ym1} vs ${ym2})`,
      intent: "ventas_vs_gastos_dos_meses",
      params: { months: [ym1, ym2] },
      notes: lang === "en" ? "Direct comparison between two months." : "Comparativa directa entre dos meses.",
    }];
  }

  return [];
}

/* ===== Prompt del asistente ===== */
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

/* ===== Llamada a OpenAI (tono humano) ===== */
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
      throw new Error(`openai_http_${r.status}:${errText}`);
    }
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(t);
  }
}

/* ===== Ruta POST /api/chat ===== */
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

    // 1) Intent específico: dos meses (YYYY-MM o nombres/abreviaturas)
    let specs: ChartSpec[] = tryTwoMonthComparison(lastUser, mesesDisponibles, lang);

    // 2) Si no, probar parser básico
    if (!specs.length) specs = inferSpecsFromText(lastUser);

    // 3) Asistente “humano”
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

    // 4) Si habló de meses pero no pudimos deducir dos válidos → pedir precisión
    const mentionsMonthNames = /\b(20\d{2}-[01]\d)\b|january|february|march|april|may|june|july|august|september|october|november|december|ene|enero|feb|febr|febrero|mar|marz|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|sept|septiembre|oct|octubre|nov|noviembre|dic|diciembre/i.test(lastUser);
    if (!specs.length && mentionsMonthNames) {
      const q = lang === "en"
        ? "Which exact months should I compare? You can write them as '2025-03 vs 2025-06' or with month names."
        : "¿Qué meses exactos debo comparar? Puedes escribirlos como «2025-03 vs 2025-06» o con nombres de mes.";
      assistant = assistant ? `${assistant}\n\n${q}` : q;
    }

    // 5) Si aún sin specs, añade ayuda estándar
    if (!specs.length) {
      const helper = lang === "en"
        ? `I can create charts like: “sales by channel”, “sales vs expenses last 8 months”, “sales evolution last 6 months”, “top 3 channels”.`
        : `Puedo crear gráficos como: «ventas por canal», «ventas vs gastos últimos 8 meses», «evolución de ventas últimos 6 meses», «top 3 canales».`;
      assistant = assistant ? `${assistant}\n\n${helper}` : helper;
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
