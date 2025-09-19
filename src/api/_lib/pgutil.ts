import { Pool } from "pg";

const pools = new Map<string, Pool>();

export function getQueryFn(connString: string) {
  if (!connString) throw new Error("Missing connection string");
  let pool = pools.get(connString);
  if (!pool) {
    pool = new Pool({
      connectionString: connString,
      ssl: { rejectUnauthorized: false }, // Neon/Render etc.
    });
    pools.set(connString, pool);
  }
  return async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const { rows } = await pool!.query(sql, params);
    return rows as T[];
  };
}
