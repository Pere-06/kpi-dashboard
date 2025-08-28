// api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

/** Tipos compartidos con el cliente */
const ChartType = z.enum(["line", "bar", "area", "pie"]);
const Intent = z.enum([
  "ventas_por_canal_mes",
  "ventas_vs_gastos_mes",
  "evolucion_ventas_n_meses",
  "top_canales",
]);

const ChartSpecSchema = z.object({
  id: z.string(),
  type: ChartType,
  title: z.string(),
  notes: z.string().optional(),
  intent: Intent,
  params: z
    .object({
      months: z.number().optional(), // para 'vs' o 'evolución'
      topN: z.number().optional(),   // para 'top_canales'
      month: z.string().optional(),  // override si el user pide otro mes (YYYY-MM)
    })
    .partial()
    .optional(),
});

const Payload = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  mesActivo: z.string().nullable(),
  mesesDisponibles: z.array(z.string()),
  lang: z.enum(["en", "es"]),
  maxCharts: z.number().default(4),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const uid = () => Math.random().toString(36).slice(2, 9);

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { messages, mesActivo, mesesDisponibles, lang, maxCharts } = Payload.parse(body);

    const system = `
You are a helpful data-visualization copilot for a KPI dashboard.
You must (1) reply naturally to the user and (2) optionally propose chart specs that match the available data.

Return a JSON object shaped like:
{
  "reply": string,
  "specs": ChartSpec[]
}

ChartSpec = {
  "id": string,
  "type": "line" | "bar" | "area" | "pie",
  "title": string,
  "notes"?: string,
  "intent": "ventas_por_canal_mes" | "ventas_vs_gastos_mes" | "evolucion_ventas_n_meses" | "top_canales",
  "params"?: { "months"?: number, "topN"?: number, "month"?: "YYYY-MM" }
}

DATA YOU CAN ASSUME EXISTS (server will resolve it):
- ventas_por_canal_mes: Pie for mesActivo (or params.month) using sales by channel in that month.
- ventas_vs_gastos_mes: Bar with last N months (default 8). Data series: ventas & gastos.
- evolucion_ventas_n_meses: Line/Area with ventas across last N months (default 6).
- top_canales: Bar with top N channels by ventas in mesActivo (default topN=5).

Rules:
- If the user greeting or the intent is unclear, specs can be [].
- NEVER invent fields; use only the intents above.
- Titles must be concise and human-friendly; use ${lang === "en" ? "English" : "Spanish"}.
- If user asks multiple related charts, you may return several (up to ${Math.min(4, Math.max(1, maxCharts))}).
- If user mentions "month" or "mes", you may set params.month = "YYYY-MM" if it matches mesesDisponibles.
- For evolution/vs, if months not specified, default months= ${lang === "en" ? "6 or 8 depending on the intent" : "6 o 8 según el intent"}.
    `;

    const user = `
LANG: ${lang}
mesActivo: ${mesActivo ?? "null"}
mesesDisponibles: ${JSON.stringify(mesesDisponibles)}
User says: ${messages[messages.length - 1]?.content}

Return only a JSON object:
{
  "reply": string,
  "specs": ChartSpec[]
}
    `;

    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(`Upstream error: ${txt}`, { status: 502 });
    }

    const json = await r.json();
    const raw = json.choices?.[0]?.message?.content || `{"reply":"","specs":[]}`;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: "", specs: [] };
    }

    // Sanitiza y limita
    let specs = Array.isArray(parsed.specs) ? parsed.specs : [];
    specs = specs.slice(0, Math.min(4, Math.max(1, maxCharts))).map((s: any) => {
      const base = {
        id: s.id || uid(),
        type: s.type,
        title: String(s.title || (lang === "en" ? "Chart" : "Gráfico")),
        intent: s.intent,
        notes: s.notes,
        params: s.params ?? {},
      };
      return ChartSpecSchema.parse(base);
    });

    const reply: string =
      typeof parsed.reply === "string" && parsed.reply.trim().length
        ? parsed.reply
        : lang === "en"
        ? "Done ✅"
        : "Listo ✅";

    return new Response(JSON.stringify({ reply, specs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(`Bad Request: ${e?.message ?? e}`, { status: 400 });
  }
}
