// /api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

/* =============== Tipos/Esquemas =============== */
const ChartType = z.enum(["line", "bar", "area", "pie", "scatter"]);
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
  intent: Intent,
  notes: z.string().optional(),
  params: z.record(z.any()).optional(),
});

const PayloadSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  mesActivo: z.string().nullable().optional(),
  mesesDisponibles: z.array(z.string()).optional(),
  lang: z.enum(["en", "es"]).default("en"),
  maxCharts: z.number().min(1).max(6).default(4),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const uid = () => Math.random().toString(36).slice(2, 10);

/* =============== Handler =============== */
export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        reply:
          "⚠️ Falta la clave de OpenAI en el servidor. Añade OPENAI_API_KEY en Vercel → Project → Settings → Environment Variables.",
        specs: [],
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { messages, mesActivo, mesesDisponibles, lang, maxCharts } = PayloadSchema.parse(body);

    const sys = `
You are an analytics assistant for a startup dashboard. Be concise, friendly, and helpful.
You ALWAYS return a JSON object like:
{
  "assistant": "<short helpful reply in the same language as user>",
  "specs": [ ChartSpec... ]
}
Where ChartSpec is:
{ "id":string, "type":"line|bar|area|pie|scatter", "title":string, "intent": one of
  ["ventas_por_canal_mes","ventas_vs_gastos_mes","evolucion_ventas_n_meses","top_canales"],
  "params":object?, "notes":string? }

Rules:
- If the user asks for multiple charts, return several specs (up to ${maxCharts}).
- If months are not specified:
  - "evolucion_ventas_n_meses": use params.months=6
  - "ventas_vs_gastos_mes": use params.months=8 (series)
  - "top_canales": use params.topN=5
- For "ventas_por_canal_mes", use the active month if available; otherwise the most recent.
- Titles must be short, clear, and localized (ES or EN).
- NEVER invent unknown data fields. The frontend knows how to render by intent.
- If the request isn't about data/graphs, return specs: [] but still answer politely.
- IDs must be unique.

Context:
- mesActivo: ${mesActivo ?? "null"}
- mesesDisponibles: ${JSON.stringify(mesesDisponibles ?? [])}
- language (ui): ${lang}
`;

    const user = `
Conversation (last messages):
${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Return ONLY a JSON object with keys "assistant" and "specs".
`;

    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ reply: `Upstream error: ${txt}`, specs: [] }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const json = await r.json();
    const raw = json.choices?.[0]?.message?.content || "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const rawSpecs = Array.isArray(parsed.specs) ? parsed.specs : [];
    const sanitized = rawSpecs
      .slice(0, maxCharts)
      .map((s: any) =>
        ChartSpecSchema.parse({
          id: s.id || uid(),
          type: s.type,
          title: s.title || "Gráfico",
          intent: s.intent,
          params: s.params ?? {},
          notes: s.notes,
        })
      );

    const reply = typeof parsed.assistant === "string" ? parsed.assistant : "Ok";
    return new Response(JSON.stringify({ reply, specs: sanitized }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ reply: `Bad Request: ${e?.message ?? e}`, specs: [] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
