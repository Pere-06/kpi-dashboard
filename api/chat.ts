// /api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

/* =============== Tipos/Esquemas =============== */
const ChartType = z.enum(["line", "bar", "area", "pie", "scatter"]);

const ChartSpecSchema = z.object({
  id: z.string(),
  type: ChartType,
  title: z.string(),
  intent: z.string(), // ya no restringido
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
    return new Response(JSON.stringify({ reply: "⚠️ Falta OPENAI_API_KEY", specs: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { messages, mesActivo, mesesDisponibles, lang, maxCharts } = PayloadSchema.parse(body);

    const sys = `
You are an **analytics assistant** for a KPI dashboard. Your job is to:
1. Interpret user requests flexibly.
2. If the request is clear, generate one or more ChartSpec objects.
3. If the request is ambiguous or missing details (e.g. chart type, period), ask the user a clarifying question and return specs: [].
4. Adapt parameters like number of months (3, 6, 12...), top N channels, specific dates, etc. Do NOT reject unless truly impossible.
5. Always localize replies (English/Spanish).
6. Return ONLY JSON: { "assistant": string, "specs": ChartSpec[] }

ChartSpec = {
  "id": string,
  "type": "line|bar|area|pie|scatter",
  "title": string,
  "intent": string,   // describe the goal, flexible (e.g. "evolucion_ventas", "comparativa_canales", "custom")
  "params": object,   // flexible (e.g. { "months": 3, "topN": 5, "channel": "email" })
  "notes": string?    // optional note to user
}

Context:
- Active month: ${mesActivo ?? "null"}
- Available months: ${JSON.stringify(mesesDisponibles ?? [])}
- Max charts allowed: ${maxCharts}
- UI language: ${lang}
`;

    const user = `
Conversation:
${messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
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
        temperature: 0.3,
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
          title: s.title || "Chart",
          intent: s.intent || "custom",
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
