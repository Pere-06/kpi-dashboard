// backend/src/services/nql.ts
import { schemaToPrompt, validateSQL, getSchema } from "./schema.js";
import { enforceLimit } from "./sql.js";
import { ENV } from "../env.js";

/** Estructura que debe devolver el modelo */
export type NqlPlan = {
  summary: string; // resumen conciso y humano (menciona si faltan datos)
  caveats?: string; // aclaraciones (“solo 4 de 6 meses disponibles…”)
  sql: string;     // SELECT seguro
  chartSpec: {
    type?: "bar" | "line" | "area" | "pie";
    x: string;     // columna x en el resultset
    y: string[];   // columnas y en el resultset
    title?: string;
    stack?: boolean;
    labels?: Record<string, string>;
  };
};

const SYS = (lang: "es" | "en") =>
  lang === "en"
    ? `You are a data analyst. Be brief, precise, and safe. Produce JSON only.`
    : `Eres un analista de datos. Sé breve, preciso y seguro. Devuelve SOLO JSON.`;

/** Construye el prompt con esquema + disponibilidad de meses para que el modelo razone límites */
function buildUserPrompt(opts: {
  question: string;
  lang: "es" | "en";
  ventasMonths?: string[];
  clientesMonths?: string[];
  schemaText: string;
}) {
  const { question, lang, ventasMonths = [], clientesMonths = [], schemaText } = opts;

  const availability =
    lang === "en"
      ? `Months availability:
- sales/expenses months: ${ventasMonths.length ? ventasMonths.join(", ") : "N/A"}
- customers months: ${clientesMonths.length ? clientesMonths.join(", ") : "N/A"}`
      : `Disponibilidad de meses:
- meses ventas/gastos: ${ventasMonths.length ? ventasMonths.join(", ") : "N/D"}
- meses clientes: ${clientesMonths.length ? clientesMonths.join(", ") : "N/D"}`;

  const instr =
    lang === "en"
      ? `Rules:
- Use ONLY the provided schema (tables/columns). If impossible, say so in "summary".
- Return a single SELECT statement. No mutations, no DDL.
- If the user asks for more months than available, reduce the window and mention it in "caveats".
- If the question is about "new customers", infer from a "customers" table grouping by month (e.g., COUNT distinct customers created in the period).
- Align chartSpec.x and chartSpec.y with the SQL result columns (exact names).`
      : `Reglas:
- Usa SOLO el esquema dado (tablas/columnas). Si no se puede, indícalo en "summary".
- Devuelve UNA sola consulta SELECT. Sin mutaciones ni DDL.
- Si el usuario pide más meses que los disponibles, reduce la ventana y menciónalo en "caveats".
- Para "nuevos clientes", infiere desde una tabla "customers" agrupando por mes (p.ej., COUNT distintos creados en el periodo).
- Alinea chartSpec.x y chartSpec.y con las columnas del resultado SQL (nombres exactos).`;

  const outFormat =
    lang === "en"
      ? `Output JSON with keys: summary, caveats, sql, chartSpec({type,x,y,title,stack,labels}).`
      : `Salida en JSON con: summary, caveats, sql, chartSpec({type,x,y,title,stack,labels}).`;

  return [
    `Schema:\n${schemaText}`,
    availability,
    instr,
    outFormat,
    `Question: ${question}`,
  ].join("\n\n");
}

export async function planNQL(params: {
  question: string;
  lang: "es" | "en";
  ventasMonths?: string[];
  clientesMonths?: string[];
}): Promise<NqlPlan> {
  if (!ENV.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const schema = await getSchema();
  const schemaText = schemaToPrompt(schema);

  const userPrompt = buildUserPrompt({
    question: params.question,
    lang: params.lang,
    ventasMonths: params.ventasMonths,
    clientesMonths: params.clientesMonths,
    schemaText,
  });

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ENV.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYS(params.lang) },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`openai_http_${r.status}:${text}`);
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  let parsed: NqlPlan;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("llm_json_parse_error");
  }

  // Guardarraíles mínimos
  const sqlRaw = enforceLimit(parsed.sql);
  const val = validateSQL(sqlRaw, schema);
  if (!val.ok) throw new Error(`unsafe_sql: ${val.reason}`);

  return {
    summary: parsed.summary || "",
    caveats: parsed.caveats || "",
    sql: sqlRaw,
    chartSpec: parsed.chartSpec,
  };
}
