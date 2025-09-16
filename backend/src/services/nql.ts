// backend/src/services/nql.ts
import { schemaToPrompt, validateSQL, getSchema } from "./schema.js";
import { isSelectOnly, guardSQL, forceLimit } from "../sqlGuard.js";
import { ENV } from "../env.js";

/** Estructura que debe devolver el planificador NQL */
export type NqlPlan = {
  summary: string; // resumen conciso y humano (menciona si faltan datos)
  caveats?: string; // aclaraciones (“solo 4 de 6 meses disponibles…”)
  sql: string;     // SELECT seguro (ya normalizado y con LIMIT aplicado)
  chartSpec: {
    type?: "bar" | "line" | "area" | "pie";
    x: string;     // columna x en el resultset
    y: string[];   // columnas y en el resultset
    title?: string;
    stack?: boolean;
    labels?: Record<string, string>;
  };
};

/** Mensaje de sistema (breve, directo) */
const SYS = (lang: "es" | "en") =>
  lang === "en"
    ? `You are a senior data analyst. Be brief, precise, and safe. Output JSON only.`
    : `Eres un analista de datos sénior. Sé breve, preciso y seguro. Devuelve SOLO JSON.`;

/** Construye el prompt con: esquema + disponibilidad de meses */
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

  const rules =
    lang === "en"
      ? `Rules:
- Use ONLY the provided schema (tables/columns). If impossible, say so in "summary".
- Return a single SELECT statement. No mutations, no DDL.
- If user asks for more months than available, reduce the window and mention it in "caveats".
- If the question is about "new customers", infer from a "customers" table grouped by month (e.g., COUNT distinct created in the period).
- Align chartSpec.x and chartSpec.y with the SQL result columns (exact names).
- Prefer short, information-dense "summary".`
      : `Reglas:
- Usa SOLO el esquema dado (tablas/columnas). Si no se puede, indícalo en "summary".
- Devuelve UNA sola consulta SELECT. Sin mutaciones ni DDL.
- Si piden más meses que los disponibles, reduce la ventana y menciónalo en "caveats".
- Para "nuevos clientes", infiere desde una tabla "customers" agrupando por mes (p.ej., COUNT distintos creados en el periodo).
- Alinea chartSpec.x y chartSpec.y con las columnas del resultado SQL (nombres exactos).
- La "summary" debe ser breve y densa en información.`;

  const outFormat =
    lang === "en"
      ? `Return ONLY a JSON object with keys:
- "summary": short human explanation
- "caveats": optional short note
- "sql": a single safe SELECT (LIMIT <= 1000 if missing)
- "chartSpec": { "type"?: "bar"|"line"|"area"|"pie", "x": string, "y": string[], "title"?: string, "stack"?: boolean, "labels"?: Record<string,string> }`
      : `Devuelve SOLO un objeto JSON con claves:
- "summary": explicación humana corta
- "caveats": nota opcional breve
- "sql": un único SELECT seguro (LIMIT <= 1000 si falta)
- "chartSpec": { "type"?: "bar"|"line"|"area"|"pie", "x": string, "y": string[], "title"?: string, "stack"?: boolean, "labels"?: Record<string,string> }`;

  return [
    `Schema:\n${schemaText}`,
    availability,
    rules,
    outFormat,
    `${lang === "en" ? "Question" : "Pregunta"}: ${question}`,
  ].join("\n\n");
}

/** Intenta extraer JSON si el modelo lo envolvió en ```json ... ``` */
function extractJsonBlock(s: string): string {
  if (!s) return "{}";
  const m = s.match(/```json\s*([\s\S]*?)\s*```/i);
  return m ? m[1] : s.trim();
}

/** Normaliza el chartSpec básico devuelto por el LLM */
function normalizeChartSpec(input: any): NqlPlan["chartSpec"] {
  const allowed = new Set(["bar", "line", "area", "pie"]);
  const type = typeof input?.type === "string" && allowed.has(input.type) ? input.type : undefined;
  const x = typeof input?.x === "string" ? input.x : "";
  const y = Array.isArray(input?.y) ? input.y.filter((v: any) => typeof v === "string") : [];
  const title = typeof input?.title === "string" ? input.title : undefined;
  const stack = typeof input?.stack === "boolean" ? input.stack : undefined;
  const labels = typeof input?.labels === "object" && input?.labels ? input.labels : undefined;
  return { type, x, y, title, stack, labels };
}

/** Planificador NQL principal */
export async function planNQL(params: {
  question: string;
  lang: "es" | "en";
  ventasMonths?: string[];
  clientesMonths?: string[];
}): Promise<NqlPlan> {
  if (!ENV.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  // 1) Esquema actual
  const schema = await getSchema();                   // <- tu función existente
  const schemaText = schemaToPrompt(schema);          // <- lo convierte a texto compactado

  // 2) Prompt con disponibilidad real
  const userPrompt = buildUserPrompt({
    question: params.question,
    lang: params.lang,
    ventasMonths: params.ventasMonths,
    clientesMonths: params.clientesMonths,
    schemaText,
  });

  // 3) Llamada al LLM (JSON estricto)
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
  const raw = data?.choices?.[0]?.message?.content || "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonBlock(raw));
  } catch {
    throw new Error("llm_json_parse_error");
  }

  // 4) Guardarraíles SQL mínimos
  const proposedSQL = String(parsed?.sql || "").trim();
  if (!proposedSQL) throw new Error("no_sql_from_llm");

  if (!isSelectOnly(proposedSQL)) {
    throw new Error("unsafe_sql_non_select");
  }

  const normalizedSQL = forceLimit(guardSQL(proposedSQL), 1000);

  // 5) Validación semántica contra el esquema (tu helper)
  const val = validateSQL(normalizedSQL, schema);
  if (!val?.ok) {
    throw new Error(`unsafe_sql: ${val?.reason || "unknown_reason"}`);
  }

  // 6) Normaliza chartSpec (debe referenciar columnas que saldrán del SQL)
  const chartSpec = normalizeChartSpec(parsed?.chartSpec);

  // 7) Mensajes humanos compactos
  const summary =
    typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : params.lang === "en"
      ? "I prepared a safe SQL answer based on your data."
      : "He preparado una respuesta con SQL seguro en base a tus datos.";

  const caveats =
    typeof parsed?.caveats === "string" && parsed.caveats.trim()
      ? parsed.caveats.trim()
      : undefined;

  // 8) Devolver plan final (aquí NO ejecutamos SQL; lo haces en /api/ask)
  return {
    summary,
    caveats,
    sql: normalizedSQL,
    chartSpec,
  };
}
