// backend/src/sqlGuard.ts
// Guardas mínimas para SELECT-safe + LIMIT

const SELECT_ONLY_RE = /^\s*select\b[\s\S]*$/i;

export function isSelectOnly(sql: string): boolean {
  const s = String(sql || "");
  if (!SELECT_ONLY_RE.test(s)) return false;
  // prohibimos DDL/DML básicos
  const banned = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|comment|merge)\b/i;
  return !banned.test(s);
}

export function guardSQL(sql: string): string {
  // Opcional: quita ; finales y espacios
  let s = String(sql || "").trim().replace(/;+\s*$/g, "");
  // Evita múltiples statements rudimentarios
  if (s.split(";").length > 1) s = s.split(";")[0];
  return s;
}

export function forceLimit(sql: string, max = 1000): string {
  const hasLimit = /\blimit\s+\d+\b/i.test(sql);
  if (hasLimit) return sql;
  return `${sql} LIMIT ${max}`;
}
