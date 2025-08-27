// src/api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

/** === Tipos de salida esperados por el front === */
const ChartType = z.enum(["line", "bar", "area", "pie"]);
const Intent = z.enum([
  "ventas_por_canal_mes",       // pie (usa mesActivo)
  "ventas_vs_gastos_mes",       // bar (usa params.months, default 8)
  "evolucion_ventas_n_meses",   // line/area (usa params.months, default 6)
  "top_canales",                 // bar (usa params.topN, default 5)
]);

const ChartSpecSchema = z.object({
  id: z.string().optional(), // el backend añadirá uno si falta
  type: ChartType,
  title: z.string(),
  intent: Intent,
  params: z.record(z.any()).optional(), // {months?: number, topN?: number, ...}
  notes: z.string().optional(),
});
const PayloadSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
  ),
  mesActivo: z.string().nullable().optional(),              // "YYYY-MM" | null
  mesesDisponibles: z.array(z.string()).optional(),         // ["2025-03", ...]
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Util: id corto si el modelo no lo trae */
const uid = () => Math.random().toString(36).slice(2, 9);

/** ========= PROMPT (SYSTEM) =========
  * Reglas claras + catálogo de intents + ejemplos
  * El modelo SIEMPRE debe responder JSON con { reply, specs }
  */
const SYSTEM_PROMPT = `
Eres un asistente de analítica para un dashboard de KPIs. 
Tu misión: 
1) Responder de forma breve, clara y humana al usuario en español (campo "reply").
2) Si la petición implica visualizaciones, proponer de 1 a 4 gráficos en "specs" con la estructura marcada.

Catálogo de intents soportados:
- "ventas_por_canal_mes": Gráfico por canal del mes activo (tipo sugerido: "pie").
- "ventas_vs_gastos_mes": Comparativa ventas vs gastos últimos N meses (default N=8) (tipo sugerido: "bar").
- "evolucion_ventas_n_meses": Evolución de ventas últimos N meses (default N=6) (tipo sugerido: "line" o "area").
- "top_canales": Ranking de canales por ventas (default topN=5) (tipo sugerido: "bar").

Reglas estrictas:
- Si la petición no requiere gráficos (saludo, small talk, preguntas generales), devuelve "specs": [].
- Si no hay suficientes detalles, usa los defaults (months=8 para vs, months=6 para evolución, topN=5).
- Los títulos deben ser claros, en español y específicos.
- No inventes dimensiones/métricas fuera del catálogo; no definas series extrañas.
- "params" solo cuando aporte valor ({"months": 6}, {"topN": 5}…).
- No más de 4 gráficos por respuesta. 
- Si dudas entre varios charts, prioriza el más útil y simple.

Salida SIEMPRE en JSON con:
{
  "reply": string,
  "specs": ChartSpec[]
}
donde ChartSpec = {
  "id"?: string,               // opcional; si falta el backend añadirá uno
  "type": "line"|"bar"|"area"|"pie",
  "title": string,
  "intent": "ventas_por_canal_mes"|"ventas_vs_gastos_mes"|"evolucion_ventas_n_meses"|"top_canales",
  "params"?: object,           // p.ej. {"months": 6} o {"topN": 5}
  "notes"?: string
}

Contexto disponible (no lo muestres tal cual):
- mesActivo: YYYY-MM o null.
- mesesDisponibles: lista de meses (YYYY-MM). Si necesitas "months", no menciones explícitamente la lista; solo úsala para elegir defaults razonables.

Estilo del "reply":
- 1–3 frases máximo.
- Tono profesional y cercano.
- Si generas gráficos, menciona cuáles (breve).
- Si no generas gráficos, sugiere qué pedir para poder crear alguno (1–2 ejemplos).
`;

/** ========= FEW-SHOTS (ayudan mucho) ========= */
const FEWSHOTS = [
  {
    role: "user",
    content: "hola!",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "¡Hola! Puedo crear gráficos si me pides algo como: ventas por canal, evolución de ventas últimos 6 meses, o ventas vs gastos últimos 8 meses.",
      specs: [],
    }),
  },
  {
    role: "user",
    content: "Quiero ver ventas por canal del mes actual.",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply: "Perfecto. Te muestro la distribución de ventas por canal del mes activo.",
      specs: [
        {
          type: "pie",
          title: "Ventas por canal (mes activo)",
          intent: "ventas_por_canal_mes",
        },
      ],
    }),
  },
  {
    role: "user",
    content: "compárame ventas vs gastos de los últimos meses",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "He añadido una comparativa de ventas vs gastos para los últimos 8 meses.",
      specs: [
        {
          type: "bar",
          title: "Ventas vs Gastos (últimos 8 meses)",
          intent: "ventas_vs_gastos_mes",
          params: { months: 8 },
        },
      ],
    }),
  },
  {
    role: "user",
    content: "muéstrame la evolución de ventas y el top 3 canales",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      reply:
        "Te presento la evolución de ventas de los últimos 6 meses y el top 3 de canales.",
      specs: [
        {
          type: "line",
          title: "Evolución de ventas (últimos 6 meses)",
          intent: "evolucion_ventas_n_meses",
          params: { months: 6 },
        },
        {
          type: "bar",
          title: "Top 3 canales por ventas",
          intent: "top_canales",
          params: { topN: 3 },
        },
      ],
    }),
  },
];

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const body = await req.json();
    const { messages, mesActivo, mesesDisponibles } = PayloadSchema.parse(body);

    const userContext = `
mesActivo: ${mesActivo ?? "null"}
mesesDisponibles: ${JSON.stringify(mesesDisponibles ?? [])}
Conversation (JSON):
${JSON.stringify(messages.slice(-8))} 
Devuelve SOLO un objeto JSON válido: { "reply": string, "specs": ChartSpec[] }.
`;

    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...FEWSHOTS,
          { role: "user", content: userContext },
        ],
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(`Upstream error: ${txt}`, { status: 502 });
    }

    const json = await r.json();
    const raw = json.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: "No he podido procesar la petición.", specs: [] };
    }

    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const specsRaw = Array.isArray(parsed.specs) ? parsed.specs : [];

    // Sanea y limita el output
    const specs = specsRaw
      .slice(0, 4)
      .map((s: any) => {
        const candidate = ChartSpecSchema.parse({
          id: s.id || uid(),
          type: s.type,
          title: s.title,
          intent: s.intent,
          params: s.params ?? {},
          notes: s.notes,
        });
        return candidate;
      });

    return new Response(JSON.stringify({ reply, specs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ reply: "Ha fallado la generación.", specs: [] }),
      { headers: { "Content-Type": "application/json" }, status: 400 }
    );
  }
}
