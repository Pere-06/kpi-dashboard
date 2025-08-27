// src/api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

const ChartType = z.enum(["line", "bar", "area", "pie", "scatter"]);
const Intent = z.enum([
  "ventas_por_canal_mes",
  "ventas_vs_gastos_mes",
  "evolucion_ventas_n_meses",
  "top_canales",
]);

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const BodySchema = z.object({
  messages: z.array(ChatMessage),
  mesActivo: z.string().nullable().optional(),
  mesesDisponibles: z.array(z.string()).optional(),
  lang: z.enum(["en", "es"]).default("en"),
  maxCharts: z.number().int().min(1).max(6).default(4),
});

const ChartSpecSchema = z.object({
  id: z.string(),
  type: ChartType,
  title: z.string(),
  notes: z.string().optional(),
  intent: Intent,
  params: z.record(z.any()).optional(),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const uid = () => Math.random().toString(36).slice(2, 9);

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const { messages, mesActivo, mesesDisponibles, lang, maxCharts } = BodySchema.parse(body);

    const system = `
You are an analytics assistant that both chats naturally and proposes chart specs.
Always reply in the user's language: ${lang === "es" ? "Spanish (es-ES)" : "English (en-US)"}.

When asked for charts, return a JSON block (as a fenced code block) with:
{ "specs": ChartSpec[] }

ChartSpec:
- id: string (unique)
- type: "line" | "bar" | "area" | "pie" | "scatter"
- title: localized title in ${lang}
- intent: one of:
  - "ventas_por_canal_mes" (pie, uses mesActivo)
  - "ventas_vs_gastos_mes" (bar, uses params.months, default 8)
  - "evolucion_ventas_n_meses" (line, uses params.months, default 6)
  - "top_canales" (bar, uses params.topN, default 5)
- params: { months?: number; topN?: number }

Rules:
- At most ${maxCharts} charts.
- Title must be concise and localized.
- Do NOT invent field names: the frontend resolves data by 'intent' only.
- If the user message is not requesting data/visuals, you may answer conversationally without specs.
`;

    const user = `
User language: ${lang}
mesActivo: ${mesActivo ?? "null"}
mesesDisponibles: ${JSON.stringify(mesesDisponibles ?? [])}

Conversation so far:
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Respond with:
1) A natural-language reply in ${lang}.
2) If charts are appropriate, include a single \`\`\`json code block\`\`\` with { "specs": ChartSpec[] }.
`;

    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(`Upstream error: ${txt}`, { status: 502 });
    }

    const json = await r.json();
    const text = json.choices?.[0]?.message?.content || "";

    // extraemos el bloque ```json ... ```
    const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
    let specs: any[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed?.specs)) specs = parsed.specs;
      } catch {
        specs = [];
      }
    }

    // saneamos y limitamos
    const sanitized = specs.slice(0, maxCharts).map((s: any) =>
      ChartSpecSchema.parse({
        id: s.id || uid(),
        type: s.type,
        title: s.title || (lang === "es" ? "Gráfico" : "Chart"),
        intent: s.intent,
        notes: s.notes,
        params: s.params ?? {},
      })
    );

    // la respuesta libre: quitamos el bloque JSON si lo hay
    const assistant = match ? text.replace(match[0], "").trim() : text.trim();

    return new Response(JSON.stringify({ reply: assistant, specs: sanitized }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(`Bad Request: ${e?.message ?? e}`, { status: 400 });
  }
}
