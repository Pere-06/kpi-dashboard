// api/ai-intent.ts
export const config = { runtime: "edge" };

import { z } from "zod";

/* ───────── Schemas / Tipos ───────── */
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
  params: z.record(z.any()).optional(),
});

const PayloadSchema = z.object({
  prompt: z.string(),
  mesActivo: z.string().nullable().optional(),
  mesesDisponibles: z.array(z.string()).optional(),
});

type ChartSpec = z.infer<typeof ChartSpecSchema>;

/* ───────── Config OpenAI ───────── */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* ───────── Utils ───────── */
const uid = () => Math.random().toString(36).slice(2, 9);

function specsToJSON(specs: ChartSpec[]) {
  return new Response(JSON.stringify({ specs }), {
    headers: { "Content-Type": "application/json" },
  });
}

/* ───────── Handler ───────── */
export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!OPENAI_API_KEY) {
    // Fallback seguro si no hay clave (no revienta el frontend)
    return specsToJSON([]);
  }

  try {
    const body = await req.json();
    const { prompt, mesActivo, mesesDisponibles } = PayloadSchema.parse(body);

    const system = `
Eres un generador de especificaciones de gráficos para un dashboard.
Devuelves JSON con: { "specs": ChartSpec[] }.

ChartSpec:
- id: string
- type: "line" | "bar" | "area" | "pie"
- title: string
- intent: "ventas_por_canal_mes" | "ventas_vs_gastos_mes" | "evolucion_ventas_n_meses" | "top_canales"
- params?: object (por ejemplo { months: number } o { topN: number })
- notes?: string

Reglas:
- Si no hay meses, usa 6 para "evolucion_ventas_n_meses" y 8 para "ventas_vs_gastos_mes".
- Para "top_canales", por defecto topN = 5.
- Para "ventas_por_canal_mes", usa el mesActivo (el backend lo resolverá).
- No inventes campos de datos: el backend ya sabe cómo resolver cada intent.
- IDs únicos y títulos claros en español.
- Si no procede, devuelve specs = [].
`.trim();

    const user = `
Usuario: ${prompt}
mesActivo: ${mesActivo ?? "null"}
mesesDisponibles: ${JSON.stringify(mesesDisponibles ?? [])}

Devuelve únicamente JSON válido con la forma:
{ "specs": ChartSpec[] }
`.trim();

    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }, // fuerza JSON
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(`Upstream error: ${txt}`, { status: 502 });
    }

    const json = await r.json();
    const raw = json.choices?.[0]?.message?.content || "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { specs: [] };
    }

    const specsIn = Array.isArray(parsed.specs) ? parsed.specs : [];
    const sanitized: ChartSpec[] = specsIn
      .slice(0, 4) // limita nº de gráficos por petición
      .map((s: any) =>
        ChartSpecSchema.parse({
          id: s.id || uid(),
          type: s.type,
          title: s.title || "Gráfico",
          intent: s.intent,
          notes: s.notes,
          params: s.params ?? {},
        })
      );

    return specsToJSON(sanitized);
  } catch (e: any) {
    return new Response(`Bad Request: ${e?.message ?? e}`, { status: 400 });
  }
}
