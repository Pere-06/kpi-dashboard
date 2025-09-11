// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";

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

/* --------- Parser bilingüe (ES/EN) --------- */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  // Sales by channel / Ventas por canal
  if (
    (/(\bventas\b|\bingresos\b).*(\bcanal(es)?\b)/.test(p)) ||
    (/(\bsales\b).*(\bchannel(s)?\b)/.test(p))
  ) {
    const isEN = /\bsales\b|\bchannel(s)?\b/i.test(text);
    return [{
      id: uid(),
      type: "pie",
      title: isEN ? "Sales by channel (active month)" : "Ventas por canal (mes activo)",
      intent: "ventas_por_canal_mes",
      params: {},
    }];
  }

  // Sales vs expenses / Ventas vs gastos (last N months)
  if (/(ventas.*gastos|gastos.*ventas)/.test(p) || /(sales.*expenses|expenses.*sales)/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|month|months)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    const isEN = /\bsales\b|\bexpenses\b|\bmonth(s)?\b/i.test(text);
    return [{
      id: uid(),
      type: "bar",
      title: isEN ? `Sales vs Expenses (last ${months} months)` : `Ventas vs Gastos (últimos ${months} meses)`,
      intent: "ventas_vs_gastos_mes",
      params: { months },
    }];
  }

  // Sales evolution / Evolución ventas (last N months)
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
    return [{
      id: uid(),
      type: wantsArea ? "area" : "line",
      title: isEN ? `Sales evolution (last ${months} months)` : `Evolución de ventas (últimos ${months} meses)`,
      intent: "evolucion_ventas_n_meses",
      params: { months },
    }];
  }

  // Top N channels / Top N canales
  if (/top\s*\d+.*(canales?|channels?)/.test(p)) {
    const m = p.match(/top\s*(\d+)/);
    const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
    const isEN = /channel/i.test(text);
    return [{
      id: uid(),
      type: "bar",
      title: isEN ? `Top ${topN} channels (active month)` : `Top ${topN} canales (mes activo)`,
      intent: "top_canales",
      params: { topN },
      notes: isEN ? "Sorted by sales descending." : "Ordenado por ventas descendentes.",
    }];
  }
  return [];
}

/* --------- Generador de respuesta natural (forzado al lang seleccionado) --------- */
function prettyReply(specs: ChartSpec[], lang: "es" | "en", mesActivo?: string | null): string {
  if (!specs.length) {
    return lang === "en"
      ? "What do you want to see? Try: “sales by channel”, “sales vs expenses last 8 months”, “sales evolution last 6 months”, or “top 3 channels”."
      : "¿Qué quieres ver? Prueba: «ventas por canal», «ventas vs gastos últimos 8 meses», «evolución de ventas últimos 6 meses» o «top 3 canales».";
  }

  const parts = specs.map((s) => {
    switch (s.intent) {
      case "ventas_por_canal_mes":
        return lang === "en"
          ? `I've added a pie chart with sales by channel${mesActivo ? ` for ${mesActivo}` : ""}.`
          : `He añadido un gráfico de pastel con ventas por canal${mesActivo ? ` para ${mesActivo}` : ""}.`;
      case "ventas_vs_gastos_mes":
        return lang === "en"
          ? `Here's a bar chart comparing sales and expenses for the last ${s.params?.months ?? 8} months.`
          : `Aquí tienes un gráfico de barras comparando ventas y gastos de los últimos ${s.params?.months ?? 8} meses.`;
      case "evolucion_ventas_n_meses":
        return lang === "en"
          ? `This line chart shows sales evolution for the last ${s.params?.months ?? 6} months.`
          : `Este gráfico de líneas muestra la evolución de ventas de los últimos ${s.params?.months ?? 6} meses.`;
      case "top_canales":
        return lang === "en"
          ? `Top ${s.params?.topN ?? 5} channels by sales${mesActivo ? ` in ${mesActivo}` : ""}.`
          : `Top ${s.params?.topN ?? 5} canales por ventas${mesActivo ? ` en ${mesActivo}` : ""}.`;
      default:
        return lang === "en" ? "Added a chart." : "He añadido un gráfico.";
    }
  });

  const tip = lang === "en"
    ? "You can ask: “make it 12 months”, “show only sales”, or “compare by channel”."
    : "Puedes pedir: «hazlo de 12 meses», «muestra solo ventas» o «compara por canal».";

  return parts.join(" ") + " " + tip;
}

/* --------- Fastify plugin --------- */
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
    const lang: "es" | "en" = body.lang === "en" ? "en" : "es"; // ⬅️ fuerza idioma seleccionado
    const mesActivo: string | null = body.mesActivo ?? null;
    const mesesDisponibles = Array.isArray(body.mesesDisponibles) ? body.mesesDisponibles : [];
    const maxCharts = Math.max(1, Math.min(4, Number(body.maxCharts) || 4));

    const lastUser = [...messages].reverse().find(m => m?.role === "user")?.content || "";
    const specs = inferSpecsFromText(lastUser);
    const replyText = prettyReply(specs, lang, mesActivo);

    return reply.send({
      reply: replyText,
      specs: specs.slice(0, maxCharts),
    });
  });
};
