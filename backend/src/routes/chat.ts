// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";

/** ===== Tipos (alineados con el front) ===== */
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

/** ===== Utils ===== */
const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const isGreeting = (s: string) =>
  /^(hola|buenas|hey|holi|que tal|qué tal|hi|hello|hey there)\b/i.test(
    (s || "").trim()
  );

/** ===== Parser de intención (espejo del front) ===== */
function inferSpecsFromText(text: string): ChartSpec[] {
  const p = norm(text);

  // Ventas por canal (mes activo) → pie
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

  // Ventas vs gastos últimos N meses → bar
  if (/ventas.*gastos|gastos.*ventas/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses)/);
    const months = m ? Math.max(1, Math.min(24, Number(m[1]))) : 8;
    return [
      {
        id: uid(),
        type: "bar",
        title:
          p.includes("last") || p.includes("ultimos") || p.includes("últimos")
            ? `Ventas vs Gastos (últimos ${months} meses)`
            : `Ventas vs Gastos (últimos ${months} meses)`,
        intent: "ventas_vs_gastos_mes",
        params: { months },
      },
    ];
  }

  // Evolución de ventas últimos N meses → line
  if (/evolucion|tendencia|historico/.test(p) || /ultimos?\s+\d+\s+mes/.test(p) || /evolution|trend|history/.test(p)) {
    const m = p.match(/(\d+)\s*(mes|meses|months?)/);
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

  // Top N canales → bar
  if (/top\s*\d+.*canales?/.test(p) || /top\s*\d+.*channels?/.test(p)) {
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

/** ===== Respuestas humanas (sin LLM) ===== */
function humanReply(opts: {
  lang: "es" | "en";
  specs: ChartSpec[];
  lastUser: string;
  mesActivo: string | null;
  mesesDisponibles: string[];
}) {
  const { lang, specs, lastUser, mesActivo, mesesDisponibles } = opts;

  // small talk / saludo
  if (!specs.length && isGreeting(lastUser)) {
    return lang === "en"
      ? "Hi! 👋 I can build charts and quick insights from your data. Try: “sales by channel”, “sales vs expenses last 8 months”, “sales evolution last 6 months”, or “top 3 channels”."
      : "¡Hola! 👋 Puedo crear gráficos e insights con tus datos. Prueba: «ventas por canal», «ventas vs gastos últimos 8 meses», «evolución de ventas últimos 6 meses» o «top 3 canales».";
  }

  // sin intención clara → pregunta amable
  if (!specs.length) {
    return lang === "en"
      ? "I can do that. Which metric and time range should I use (e.g., sales last 6 months, or YTD)?"
      : "Puedo hacerlo. ¿Qué métrica y rango temporal uso (por ejemplo, ventas de los últimos 6 meses o YTD)?";
  }

  // tenemos al menos una spec → explica qué harás, en tono natural
  const s = specs[0];

  const monthHint = mesActivo
    ? lang === "en"
      ? `using the active month **${mesActivo}** when relevant`
      : `usando el mes activo **${mesActivo}** cuando aplique`
    : mesesDisponibles.length
    ? lang === "en"
      ? `available months: ${mesesDisponibles.join(", ")}`
      : `meses disponibles: ${mesesDisponibles.join(", ")}`
    : "";

  const followUps_en = [
    "Filter by a specific channel?",
    "Compare with the previous period?",
    "Break it down by week?",
  ];
  const followUps_es = [
    "¿Lo filtramos por un canal concreto?",
    "¿Comparamos con el periodo anterior?",
    "¿Lo desglosamos por semana?",
  ];

  if (s.intent === "ventas_por_canal_mes") {
    return lang === "en"
      ? `Done. I’ll show the **sales distribution by channel** for the active month. ${monthHint ? `(${monthHint})` : ""}\n\nWant me to highlight the top channel or show the share in %?`
      : `Listo. Te muestro la **distribución de ventas por canal** del mes activo. ${monthHint ? `(${monthHint})` : ""}\n\n¿Quieres que resalte el canal top o que muestre el % de participación?`;
  }

  if (s.intent === "ventas_vs_gastos_mes") {
    const m = Number(s.params?.months ?? 8);
    return lang === "en"
      ? `Great. I’m comparing **sales vs expenses** for the **last ${m} months**. ${monthHint ? `(${monthHint})` : ""}\n\nNext, I can add a profit line or mark the best month. ${followUps_en.join(" · ")}`
      : `Perfecto. Comparo **ventas vs gastos** de los **últimos ${m} meses**. ${monthHint ? `(${monthHint})` : ""}\n\nLuego puedo añadir la línea de beneficio o marcar el mejor mes. ${followUps_es.join(" · ")}`;
  }

  if (s.intent === "evolucion_ventas_n_meses") {
    const m = Number(s.params?.months ?? 6);
    return lang === "en"
      ? `On it. I’ll plot the **sales trend** for the **last ${m} months**. ${monthHint ? `(${monthHint})` : ""}\n\nShall I compare it with expenses or highlight the trend slope?`
      : `Vamos allá. Trazo la **tendencia de ventas** de los **últimos ${m} meses**. ${monthHint ? `(${monthHint})` : ""}\n\n¿La comparo con gastos o resalto la pendiente de la tendencia?`;
  }

  if (s.intent === "top_canales") {
    const topN = Number(s.params?.topN ?? 5);
    return lang === "en"
      ? `Done. I’ll show the **top ${topN} channels** for the active month. ${monthHint ? `(${monthHint})` : ""}\n\nWant to expand to top ${Math.min(topN + 2, 12)} or see the bottom channels too?`
      : `Hecho. Muestro el **top ${topN} canales** del mes activo. ${monthHint ? `(${monthHint})` : ""}\n\n¿Quieres ampliar a top ${Math.min(topN + 2, 12)} o ver también los canales inferiores?`;
  }

  // fallback
  return lang === "en" ? "Got it." : "Entendido.";
}

/** ===== Ruta POST /api/chat ===== */
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

    const replyText = humanReply({
      lang,
      specs,
      lastUser,
      mesActivo,
      mesesDisponibles,
    });

    return reply.send({
      reply: replyText,
      specs: specs.slice(0, maxCharts),
    });
  });
};
