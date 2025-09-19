import type { VercelRequest } from "@vercel/node";
import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function getUserIdFromReq(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  if (!token) throw new Error("Missing auth token");
  const verified = await clerk.verifyToken(token);
  return verified.sub; // Clerk user id
}
