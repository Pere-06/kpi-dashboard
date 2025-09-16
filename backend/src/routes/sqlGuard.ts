// backend/src/sqlGuard.ts

// Quita comentarios y normaliza espacios
function strip(sql: string) {
  return sql
    .replace(/--.*?$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function isSelectOnly(sql: string): boolean {
  const s = strip(sql).toLowerCase();
  if (s.includes(";")) return false; // una única sentencia
  // Prohibimos palabras peligrosas
  const bad = /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|vacuum|analyze)\b/;
  if (bad.test(s)) return false;
  // Debe empezar por select
  return /^\s*select\b/.test(s);
}

export function guardSQL(sql: string): string {
  // Podrías añadir listas blancas de tablas, columnas, etc.
  return strip(sql);
}

export function forceLimit(sql: string, max: number): string {
  const s = strip(sql);
  // Si ya trae LIMIT <= max, dejamos; si no, añadimos al final.
  const m = s.match(/\blimit\s+(\d+)\b/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n <= max) return s;
    return s.replace(/\blimit\s+\d+\b/i, `LIMIT ${max}`);
  }
  return `${s} LIMIT ${max}`;
}
