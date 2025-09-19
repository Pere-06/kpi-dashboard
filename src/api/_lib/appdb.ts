import { Pool } from "pg";
export const appPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
export async function appQuery<T=any>(sql: string, params: any[]=[]): Promise<T[]> {
  const { rows } = await appPool.query(sql, params);
  return rows as T[];
}
