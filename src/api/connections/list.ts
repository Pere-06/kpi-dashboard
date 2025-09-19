import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserIdFromReq } from "../_lib/auth";
import { appQuery } from "../_lib/appdb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));
  try {
    const userId = await getUserIdFromReq(req);
    const [u] = await appQuery<{tenant_id:string}>("select tenant_id from users where clerk_user_id=$1",[userId]);
    if (!u) return res.status(200).send(JSON.stringify({ items: [] }));
    const items = await appQuery<{id:string; name:string; kind:string; is_active:boolean}>(
      "select id, name, kind, is_active from connections where tenant_id=$1 order by created_at desc",
      [u.tenant_id]
    );
    res.status(200).send(JSON.stringify({ items }));
  } catch (e:any) {
    res.status(200).send(JSON.stringify({ items: [], error: e?.message || String(e) }));
  }
}
