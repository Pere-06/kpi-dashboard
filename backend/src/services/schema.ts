// backend/src/services/schema.ts
import { PrismaClient } from "@prisma/client";

type Column = { table: string; column: string; dataType: string };
export type TableSchema = Record<string, { columns: string[] }>;

const prisma = new PrismaClient();

let cache: { at: number; schema: TableSchema } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Devuelve un esquema de tablas/columnas (Postgres) cacheado 5 min */
export async function getSchema(): Promise<TableSchema> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.schema;

  // Lee INFORMATION_SCHEMA y filtra system tables
  const rows = await prisma.$queryRawUnsafe<Column[]>(`
    SELECT c.table_name as "table", c.column_name as "column", c.data_type as "dataType"
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name NOT LIKE '_prisma_%'
      AND c.table_name NOT LIKE 'pg_%'
      AND c.table_name NOT LIKE 'sql_%'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const schema: TableSchema = {};
  for (const r of rows) {
    if (!schema[r.table]) schema[r.table] = { columns: [] };
    schema[r.table].columns.push(r.column);
  }

  cache = { at: now, schema };
  return schema;
}

/** Lista compacta en texto para meter al prompt */
export function schemaToPrompt(schema: TableSchema): string {
  const lines: string[] = [];
  for (const [table, def] of Object.entries(schema)) {
    lines.push(`${table}(${def.columns.join(", ")})`);
  }
  return lines.join("\n");
}

/** Valida que el SQL solo use tablas/columnas existentes (check básico) */
export function validateSQL(sql: string, schema: TableSchema): { ok: boolean; reason?: string } {
  const lowered = sql.toLowerCase();
  if (!lowered.startsWith("select")) return { ok: false, reason: "Only SELECT is allowed" };
  if (lowered.includes(";")) return { ok: false, reason: "Multiple statements are not allowed" };
  if (/(drop|truncate|delete|update|insert|alter)\s/i.test(lowered)) return { ok: false, reason: "Mutation not allowed" };

  // Chequeo muy básico de tablas presentes en FROM/JOIN
  const tableNames = Object.keys(schema);
  const mentionedTables = new Set<string>();
  const fromJoins = lowered.match(/\b(from|join)\s+([a-z0-9_\.]+)/g) || [];
  for (const fj of fromJoins) {
    const m = fj.match(/\b(from|join)\s+([a-z0-9_\.]+)/);
    const table = m?.[2]?.replace(/["']/g, "");
    if (table) mentionedTables.add(table.includes(".") ? table.split(".").pop()! : table);
  }

  for (const t of mentionedTables) {
    if (!tableNames.includes(t)) return { ok: false, reason: `Unknown table "${t}"` };
  }

  return { ok: true };
}
