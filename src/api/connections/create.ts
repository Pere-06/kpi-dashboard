import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { getUserIdFromReq } from "../_lib/auth";
import { appQuery } from "../_lib/appdb";
import { encryptJSON } from "../_lib/crypto";

type Body = { name: string; kind: "postgres"; connectionString: string };
const json = <T=any>(x:any):T => (x && typeof x==="object") ? x as T : JSON.parse(String(x||"{}"));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));
  try {
    const userId = await getUserIdFromReq(req);
    const body = json<Body>(req.body);
    if (!body.name || !body.kind || !body.connectionString) {
      return res.status(400).send(JSON.stringify({ error: "invalid_body" }));
    }

    // 1) Tenant del usuario (autocreación si no existe)
    const [u] = await appQuery<{tenant_id: string}>("select tenant_id from users where clerk_user_id=$1",[userId]);
    let tenantId = u?.tenant_id;
    if (!tenantId) {
      const [t] = await appQuery<{id:string}>("insert into tenants (name) values ($1) returning id", [`Tenant ${userId.slice(0,6)}`]);
      tenantId = t.id;
      await appQuery("insert into users (clerk_user_id, tenant_id) values ($1,$2)", [userId, tenantId]);
    }

    // 2) Probar la conexión externa
    const test = new Pool({ connectionString: body.connectionString, ssl: { rejectUnauthorized: false } });
    await test.query("select 1");
    await test.end();

    // 3) Guardar cifrado
    const enc = encryptJSON({ connectionString: body.connectionString });
    await appQuery(
      `insert into connections (tenant_id, kind, name, config_json_encrypted, is_active)
       values ($1,$2,$3,$4,true)`,
      [tenantId, body.kind, body.name, enc]
    );

    res.status(200).send(JSON.stringify({ ok: true }));
  } catch (e:any) {
    res.status(200).send(JSON.stringify({ ok:false, error: e?.message || String(e) }));
  }
}
