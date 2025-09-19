import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClerkClient } from "@clerk/backend";
import { appQuery } from "./_lib/appdb";
import { decryptJSON } from "./_lib/crypto";
import { Pool } from "pg";
import { discoverColumns, chooseTopCustomers, chooseSalesVsExpensesMonthly } from "./_lib/semantics";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
const safe = <T=any>(x:any):T => (x && typeof x === "object") ? x as T : JSON.parse(String(x||"{}"));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));

  try {
    // Auth → user → tenant → conexión activa
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i,"");
    const verified = await clerk.verifyToken(token);
    const userId = verified.sub;

    const [u] = await appQuery<{tenant_id:string}>("select tenant_id from users where clerk_user_id=$1",[userId]);
    if (!u) return res.status(200).send(JSON.stringify({ reply: "No tenant found for this user.", charts: [] }));

    const [conn] = await appQuery<{config_json_encrypted:Buffer}>(
      "select config_json_encrypted from connections where tenant_id=$1 and is_active=true order by created_at desc limit 1",
      [u.tenant_id]
    );
    if (!conn) return res.status(200).send(JSON.stringify({ reply: "Connect a data source first.", charts: [] }));

    const { connectionString } = decryptJSON(conn.config_json_encrypted) as { connectionString: string };
    const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    const q = async (sql:string, params:any[]=[]) => (await pool.query(sql, params)).rows;

    // Mensaje y NLU básico
    const body = safe<{messages?:{role:"user"|"assistant";content:string}[]; lang?:"es"|"en";}>(req.body);
    const lang = body.lang || "en";
    const text = Array.isArray(body.messages) && body.messages.length ? String(body.messages.at(-1)?.content || "") : "";
    const low  = text.toLowerCase();
    const monthsMatch = low.match(/last\s+(\d+)\s+months|últimos?\s+(\d+)\s+meses/);
    const lastN = monthsMatch ? Number(monthsMatch[1] || monthsMatch[2]) : undefined;

    const wantTopCustomers    = low.includes("most profitable") || low.includes("top customers") || low.includes("clientes mas rentables") || low.includes("clientes más rentables");
    const wantSalesVsExpenses = (low.includes("sales") && low.includes("expenses")) || (low.includes("ventas") && low.includes("gastos"));

    // Descubrir esquema
    const cols = await discoverColumns(q, "public");

    const charts: any[] = [];
    let reply = lang==="en" ? "Got it." : "Entendido.";

    if (wantTopCustomers) {
      const pick = chooseTopCustomers(cols);
      if (!pick) reply += lang==="en" ? " I couldn't find (amount + customer) columns." : " No encuentro (importe + cliente).";
      else {
        const since = lastN ? new Date(Date.now() - lastN*30*24*3600*1000) : null;
        const sql = `
          SELECT ${pick.customer} AS label, SUM(${pick.amount}) AS value
          FROM ${pick.table}
          ${since && pick.date ? `WHERE ${pick.date} >= $1` : ""}
          GROUP BY ${pick.customer}
          ORDER BY value DESC
          LIMIT 10
        `;
        const rows = await q(sql, since && pick.date ? [since] : []);
        charts.push({ spec:{ type:"bar", x:"label", y:"value", title: lang==="en"?"Top customers by total spent":"Clientes más rentables" }, fields:["label","value"], rows });
      }
    } else if (wantSalesVsExpenses) {
      const pick = chooseSalesVsExpensesMonthly(cols);
      if (!pick) reply += lang==="en" ? " I couldn't find (sales + expenses + date)." : " No encuentro (ventas + gastos + fecha).";
      else {
        const since = lastN ? new Date(Date.now() - lastN*30*24*3600*1000) : null;
        const sql = `
          SELECT to_char(date_trunc('month', ${pick.date}), 'YYYY-MM') AS label,
                 SUM(${pick.sales})    AS sales,
                 SUM(${pick.expenses}) AS expenses
          FROM ${pick.table}
          ${since ? `WHERE ${pick.date} >= $1` : ""}
          GROUP BY 1
          ORDER BY 1
        `;
        const rows = await q(sql, since ? [since] : []);
        charts.push({ spec:{ type:"line", x:"label", ys:["sales","expenses"], title: lang==="en"?"Sales vs Expenses":"Ventas vs Gastos" }, fields:["label","sales","expenses"], rows });
      }
    } else {
      reply = lang==="en"
        ? "Tell me what to analyze, e.g., “most profitable customers last 3 months”, “sales vs expenses last 6 months”."
        : "Dime qué analizar, p. ej., “clientes más rentables últimos 3 meses”, “ventas vs gastos últimos 6 meses”.";
    }

    await pool.end();
    res.status(200).send(JSON.stringify({ reply, charts }));
  } catch (e:any) {
    res.status(200).send(JSON.stringify({ reply:`Error: ${e?.message || e}`, charts: [] }));
  }
}
