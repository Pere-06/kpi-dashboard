// backend/src/routes/ask.ts
import type { FastifyPluginAsync } from "fastify";
import { ENV } from "../env.js";
import { guardSQL, forceLimit, isSelectOnly } from "../sqlGuard";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// -------- Helpers para introspección de esquema --------
async function getSchemaSnapshot() {
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type='BASE TABLE'
    ORDER BY table_name;
  `);
  const detail: Record<string, Array<{ column: string; type: string }>> = {};
  for (const t of tables) {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${t.table_name}'
      ORDER BY ordinal_position;
    `);
    detail[t.table_name] = cols.map(c => ({ column: c.column_name, type: c.data_type }));
  }
  return detail;
}

// -------- Prompting --------
function systemPrompt(params: {
  schemaJson: string;
  lang: "es" | "en";
  availability?: {
    ventasMonths?: string[];
    clientesMonths?: string[];
    notes?: string;
  };
}) {
  const { schemaJson, lang, availability } = params;

  const base = lang === "en"
    ? `You are a data analyst who writes safe SQL for the given Postgres schema.
Always:
- ONLY output a single JSON object with fields: sql, rationale, chart, ask_back (optional).
- SQL MUST be a single SELECT (NO DDL/DML), safe, minimal, with LIMIT <= 1000 if missing.
- Use explicit casts when needed.
- Pick a chart spec that matches the SQL result.
- If the user asks for data outside of availability (e.g., "last 6 months" but only 4 months exist), explain the limitation and adapt.`
    : `Eres un analista que escribe SQL seguro para el esquema Postgres dado.
Siempre:
- Devuelve SOLO un objeto JSON con: sql, rationale, chart, ask_back (opcional).
- El SQL DEBE ser un único SELECT (SIN DDL/DML), seguro, mínimo, con LIMIT <= 1000 si falta.
- Usa casts explícitos si hacen falta.
- Elige un chart spec acorde al resultado.
- Si el usuario pide más datos de los disponibles (ej. últimos 6 meses pero solo hay 4), explica la limitación y adapta.`;

  const schema = lang === "en" ? "Database schema (tables → columns & types):" : "Esquema de base de datos (tablas → columnas y tipos):";
  const availabilityText = availability
    ? `\n\nAvailability info:\n${JSON.stringify(availability, null, 2)}`
    : "";

  const format = `
JSON shape example:
{
  "sql": "SELECT date, new_customers FROM customers_monthly WHERE date >= '2025-01-01' ORDER BY date LIMIT 500",
  "rationale": "Why this answers the user's question briefly",
  "chart": {
    "type": "line" | "bar" | "area" | "pie",
    "x": "columnName for x axis (or name)",
    "y": ["oneOrMoreNumericColumns"],
    "title": "Short, human title",
    "notes": "Optional footnote",
    "intent": "freeform label for frontend (optional)"
  },
  "ask_back": "If the question lacks specifics, ask one short clarifying question."
}
`;
  return `${base}

${schema}
${schemaJson}

${availabilityText}

${format}
Respond ONLY with that JSON.`;
}

// -------- Types returned to frontend --------
type ChartSpec = {
  id: string;
  type: "line" | "bar" | "area" | "pie";
  title: string;
  intent?: string;
  params?: Record<string, any>;
  notes?: string;
  x?: string;
  y?: string[];
};

type AskBody = {
  question?: string;
  lang?: "es" | "en";
  tableHints?: string[];
  availability?: {
    ventasMonths?: string[];
    clientesMonths?: string[];
    notes?: string;
  };
};

export const askRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/ask", async (req, reply) => {
    const body = (req.body ?? {}) as AskBody;
    const lang: "es" | "en" = body.lang === "es" ? "es" : "en";
    const question = (body.question || "").trim();

    if (!question) {
      const msg = lang === "en" ? "Missing question" : "Falta la pregunta";
      return reply.code(400).send({ error: "bad_request", message: msg });
    }
    if (!ENV.OPENAI_API_KEY) {
      const msg = lang === "en" ? "OpenAI key not configured" : "Falta configurar la clave de OpenAI";
      return reply.code(500).send({ error: "llm_disabled", message: msg });
    }

    // 1) Introspección de esquema
    const schema = await getSchemaSnapshot();
    const filtered = Array.isArray(body.tableHints) && body.tableHints.length
      ? Object.fromEntries(Object.entries(schema).filter(([t]) => body.tableHints!.includes(t)))
      : schema;

    // 2) Pedimos al LLM un JSON con el SQL y el chart
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    let llmJson: any = null;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ENV.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: systemPrompt({
                schemaJson: JSON.stringify(filtered, null, 2),
                lang,
                availability: body.availability || {},
              }),
            },
            { role: "user", content: question },
          ],
        }),
      });
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content?.trim() || "{}";
      const m = raw.match(/```json\s*([\s\S]*?)\s*```/i);
      const jsonStr = m ? m[1] : raw;
      llmJson = JSON.parse(jsonStr);
    } catch (e: any) {
      clearTimeout(t);
      const msg = lang === "en" ? "The assistant could not parse a valid JSON." : "El asistente no devolvió JSON válido.";
      return reply.code(500).send({ error: "llm_parse_error", message: msg, detail: String(e) });
    } finally {
      clearTimeout(t);
    }

    const proposedSQL = String(llmJson?.sql || "").trim();
    if (!proposedSQL) {
      const msg = lang === "en" ? "No SQL returned by the assistant." : "El asistente no devolvió SQL.";
      return reply.code(400).send({ error: "no_sql", message: msg, llm: llmJson });
    }

    // 3) Guardias de SQL
    if (!isSelectOnly(proposedSQL)) {
      const msg = lang === "en" ? "Only SELECT statements are allowed." : "Solo se permiten consultas SELECT.";
      return reply.code(400).send({ error: "sql_not_allowed", message: msg });
    }
    const safeSQL = forceLimit(guardSQL(proposedSQL), 1000);

    // 4) Ejecutar SQL
    let rows: any[] = [];
    try {
      rows = await prisma.$queryRawUnsafe<any[]>(safeSQL);
    } catch (e: any) {
      const msg = lang === "en" ? "Failed to execute SQL" : "Error al ejecutar el SQL";
      return reply.code(400).send({ error: "sql_exec_error", message: msg, detail: String(e), sql: safeSQL });
    }

    // 5) Preparar “fields” y un ChartSpec utilizable
    const fields = rows.length ? Object.keys(rows[0]) : [];
    const chartFromLLM = llmJson?.chart || {};
    const id = Math.random().toString(36).slice(2, 9);

    const spec: ChartSpec = {
      id,
      type: (["line", "bar", "area", "pie"] as const).includes(chartFromLLM.type) ? chartFromLLM.type : "bar",
      title: String(chartFromLLM.title || (lang === "en" ? "Generated chart" : "Gráfico generado")),
      intent: String(chartFromLLM.intent || ""),
      notes: String(chartFromLLM.notes || ""),
      x: chartFromLLM.x && fields.includes(chartFromLLM.x) ? chartFromLLM.x : fields[0],
      y: Array.isArray(chartFromLLM.y) ? chartFromLLM.y.filter((c: string) => fields.includes(c)) : fields.slice(1, 3),
      params: {},
    };

    // 6) Mensaje humano corto
    const explanation = String(llmJson?.rationale || (lang === "en"
      ? "I ran a safe SQL based on your question."
      : "He ejecutado un SQL seguro en base a tu pregunta."));

    // 7) Devolver resultado
    return reply.send({
      explanation,
      askBack: llmJson?.ask_back || null,
      sql: safeSQL,
      fields,
      rows,
      chartSpec: spec,
    });
  });
};
