// backend/src/auth.ts
import { verifyToken } from "@clerk/clerk-sdk-node";
import type { FastifyRequest, FastifyReply } from "fastify";
import { ENV } from "./env";
import { prisma } from "./prisma";

declare module "fastify" {
  interface FastifyRequest { auth?: { userId: string }; orgId?: string; role?: string; }
}

export async function requireOrg(req: FastifyRequest, reply: FastifyReply) {
  if (ENV.DEV_BYPASS_AUTH) {
    if (!ENV.DEV_ORG_ID) return reply.code(500).send({ error: "DEV_ORG_ID not set" });
    req.auth = { userId: "dev-user" };
    req.orgId = ENV.DEV_ORG_ID;
    req.role = "admin";
    return;
  }

  const authHeader = req.headers.authorization;
  const orgIdHeader = req.headers["x-org-id"];
  if (!authHeader) return reply.code(401).send({ error: "Missing Authorization" });
  if (!orgIdHeader || typeof orgIdHeader !== "string") return reply.code(400).send({ error: "Missing x-org-id" });

  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const verified = await verifyToken(token, {
      jwtKey: ENV.CLERK_PEM_PUBLIC_KEY_NORMALIZED,
      authorizedParties: undefined,
    });
    const userId = verified.sub;
    if (!userId) return reply.code(401).send({ error: "Invalid token" });

    const membership = await prisma.membership.findFirst({
      where: { orgId: orgIdHeader, user: { clerkUserId: userId } },
      select: { role: true, orgId: true },
    });
    if (!membership) return reply.code(403).send({ error: "No access to organization" });

    req.auth = { userId };
    req.orgId = membership.orgId;
    req.role = membership.role;
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}
