// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";

/** Tipos alineados con el frontend */
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

/** Utils */
const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Parser ES/EN que refleja el del frontend */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  // ===== Ventas por canal / Sales by channel → pie (mes activo)
  if (
    (/(\bventas\b|\bingresos\b).*(\bcanal(es)?\b)/.test(p)) ||
    (/(\bsales\b).*(\bchannel(s)?\b)/.test(p))
  ) {
    const isEN = /\bsales\b|\bchannel(s)?\b/i.test(text);
    return [
      {
        id: uid(),
        type: "pie",
        title: isEN
          ? "Sales by channel (active month)"
          : "Ventas por canal (mes activo)",
        intent: "ventas_por_canal_mes",
        params: {},
      },
    ];
  }

  // ===== Ventas vs gastos / Sales vs expenses últimos N meses → bar
  if (
    /(ventas.*gastos|gastos.*ventas)/.test(p) ||
    /(sales.*expenses|expenses.*sales)/.test(p)
  ) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    const isEN = /\bsales\b|\bexpenses\b|\bmonth(s)?\b/i.test(text);
    return [
      {
        id: uid(),
        type: "bar",
        title: isEN
          ? `Sales vs Expenses (last ${months} months)`
          : `Ventas vs Gastos (últimos ${months} meses)`,
        intent: "ventas_vs_gastos_mes",
        params: { months },
      },
    ];
  }

  // ===== Evolución de ventas / Sales evolution últimos N meses → line/area
  if (
    /(evolucion|tendencia|historico)/.test(p) ||
    /(evolution|trend|history)/.test(p) ||
    /ultimos?\s+\d+\s+mes(es)?/.test(p) ||
    /last\s+\d+\s+month(s)?/.test(p)
  ) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(36, Number(m[1]))) : 6;
    const wantsArea = /(area|relleno|suavizad|smooth|filled)/.test(p);
    const isEN = /\bsales\b|\bmonth(s)?\b|\bevolution\b|\btrend\b/i.test(text);
    return [
      {
        id: uid(),
        type: wantsArea ? "area" : "line",
        title: isEN
          ? `Sales evolution (last ${months} months)`
          : `Evolución de ventas (últimos ${months} meses)`,
        intent: "evolucion_ventas_n_meses",
        params: { months },
      },
    ];
  }

  // ===== Top N canales / Top N channels → bar
  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    const isEN = /channel/i.test(text);
    return [
      {
        id: uid(),
        type: "bar",
        title: isEN
          ? `Top ${topN} channels (active month)`
          : `Top ${topN} canales (mes activo)`,
        intent: "top_canales",
        params: { topN },
        notes: isEN
          ? "Sorted by sales descending."
          : "Ordenado por ventas descendentes.",
      },
    ];
  }

  // Nada claro → sin specs (el front hará fallback)
  return [];
}

/** Plugin Fastify: POST /api/chat */
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

    const specs = inferSpecsFromText(lastUser);

    let replyText =
      lang === "en"
        ? "Got it. Preparing the analysis."
        : "Entendido. Preparando el análisis.";

    if (!specs.length) {
      replyText =
        lang === "en"
          ? "What time range (e.g., last 3 months or YTD) and which metric (sales, expenses) do you want?"
          : "¿Qué rango temporal necesitas (p. ej., últimos 3 meses o YTD) y qué métrica exacta (ventas, gastos)?";
    } else {
      if (mesActivo) {
        replyText +=
          lang === "en"
            ? ` Using active month: ${mesActivo}.`
            : ` Usando el mes activo: ${mesActivo}.`;
      } else if (mesesDisponibles.length) {
        replyText +=
          lang === "en"
            ? ` Available months: ${mesesDisponibles.join(", ")}.`
            : ` Meses disponibles: ${mesesDisponibles.join(", ")}.`;
      }
    }

    return reply.send({
      reply: replyText,
      specs: specs.slice(0, maxCharts),
    });
  });
};
