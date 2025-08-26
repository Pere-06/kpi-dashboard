// api/chat.ts
export const config = { runtime: "edge" };

import { z } from "zod";

type Msg = { role: "user" | "assistant" | "system"; content: string };

// === Esquema de ChartSpec compatible con tu DynamicChart ===
const ChartType = z.enum(["line", "bar", "area", "pie"]);
const Intent = z.enum([
  "ventas_por_canal_mes",
  "ventas_vs_gastos_mes",
  "evolucion_ventas_n_meses",
  "top_canales",
]);
const ChartSpec = z.object({
  id: z.string(),
  type: ChartType,
  title: z.string(),
  intent: Intent,
  notes: z.string().optional(),
  params: z.record(z.any()).optional(),
});
const SpecsPayload = z.object({ specs: z.array(ChartSpec).max(4) });

// === Entrada del request ===
const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  mesActivo: z.string().nullable().optional(),
  mesesDisponibles: z.array(z.string()).optional(),
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const uid = () => Math.random().toString(36).slice(2, 9);

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!OPENAI_API_KEY) {
    return new Response("Missing OPENAI_API_KEY", { status: 500 });
  }

  try {
    const { messages, mesActivo, mesesDisponibles } = BodySchema.parse(
      await req.json()
    );

    const system: Msg = {
      role: "system",
      content: `
Eres un analista de datos para un dashboard. Hablas en español, educado y claro.
Tu objetivo: responder al usuario y, cuando lo pida (o sea útil), proponer visualizaciones.
Dispones de una herramienta "make_charts" para devolver hasta 4 gráficos en JSON.
No inventes columnas que no existan: el backend sabrá resolver los intents.
Si no procede crear gráficos, responde solo con texto.
Contexto:
- mesActivo: ${mesActivo ?? "null"}
- mesesDisponibles: ${(mesesDisponibles ?? []).join(", ") || "[]"}
`.trim(),
    };

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "make_charts",
          description:
            "Devuelve un conjunto de visualizaciones (0..4) coherentes con la petición.",
          parameters: {
            type: "object",
            properties: {
              specs: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  required: ["id", "type", "title", "intent"],
                  properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["line", "bar", "area", "pie"] },
                    title: { type: "string" },
                    intent: {
                      type: "string",
                      enum: [
                        "ventas_por_canal_mes",
                        "ventas_vs_gastos_mes",
                        "evolucion_ventas_n_meses",
                        "top_canales",
                      ],
                    },
                    notes: { type: "string" },
                    params: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
            required: ["specs"],
            additionalProperties: false,
          },
        },
      },
    ];

    // Llamada a OpenAI con herramientas
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [system, ...messages],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!r.ok) {
      return new Response(`Upstream error: ${await r.text()}`, { status: 502 });
    }
    const json = await r.json();
    const choice = json.choices?.[0];
    const msg = choice?.message;

    let reply = (msg?.content as string) || ""; // texto normal
    let specs: z.infer<typeof ChartSpec>[] = [];

    // ¿La IA llamó a la herramienta?
    const toolCalls = msg?.tool_calls ?? [];
    const call = toolCalls.find((t: any) => t?.function?.name === "make_charts");
    if (call?.function?.arguments) {
      try {
        const parsed = SpecsPayload.safeParse(
          JSON.parse(call.function.arguments)
        );
        if (parsed.success) {
          specs = parsed.data.specs.map((s) => ({
            ...s,
            id: s.id || uid(),
            params: s.params ?? {},
          }));
        }
      } catch {
        // si falla el parseo, devolvemos solo reply
      }
    }

    return new Response(JSON.stringify({ reply, specs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(`Bad Request: ${e?.message ?? e}`, { status: 400 });
  }
}
