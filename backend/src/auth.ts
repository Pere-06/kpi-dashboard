// backend/src/auth.ts
import { verifyToken } from "@clerk/clerk-sdk-node";
import type { FastifyRequest, FastifyReply } from "fastify";
import { ENV } from "./env.js";
import { prisma } from "./prisma.js";

// Extiende el tipo de Fastify para guardar auth/org/role en la request
declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string };
    orgId?: string;
    role?: string;
  }
}

/**
 * Middleware que exige:
 * - Authorization: Bearer <JWT de Clerk>
 * - x-org-id: <UUID de Organization>
 *
 * En modo DEV_BYPASS_AUTH usa ENV.DEV_ORG_ID y usuario simulado.
 */
export async function requireOrg(req: FastifyRequest, reply: FastifyReply) {
  // ---- MODO DEV: bypass de auth para desarrollo local / Render de pruebas
  if (ENV.DEV_BYPASS_AUTH) {
    if (!ENV.DEV_ORG_ID) {
      return reply.code(500).send({ error: "DEV_ORG_ID not set" });
    }
    req.auth = { userId: "dev-user" };
    req.orgId = ENV.DEV_ORG_ID;
    req.role = "admin";
    return;
  }

  // ---- MODO NORMAL: validamos token y membership
  const authHeader = req.headers.authorization;
  const orgIdHeader = req.headers["x-org-id"];

  if (!authHeader) {
    return reply.code(401).send({ error: "Missing Authorization" });
  }
  if (!orgIdHeader || typeof orgIdHeader !== "string") {
    return reply.code(400).send({ error: "Missing x-org-id" });
  }

  try {
    // 1) Verificar JWT de Clerk con la clave pública PEM
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const verified = await verifyToken(token, {
      jwtKey: ENV.CLERK_PEM_PUBLIC_KEY_NORMALIZED,
      authorizedParties: undefined,
    });

    const clerkUserId = verified.sub;
    if (!clerkUserId) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    // 2) Encontrar nuestro User (tabla) por clerkUserId (UNIQUE)
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });
    if (!user) {
      return reply.code(403).send({ error: "User not found" });
    }

    // 3) Comprobar membership en esa organización
    const membership = await prisma.membership.findFirst({
      where: { orgId: orgIdHeader, userId: user.id },
      select: { role: true, orgId: true },
    });
    if (!membership) {
      return reply.code(403).send({ error: "No access to organization" });
    }

    // 4) Adjuntar datos a la request para uso posterior
    req.auth = { userId: user.id };
    req.orgId = membership.orgId;
    req.role = membership.role;
  } catch (e) {
    req.log?.error({ err: e }, "Auth error");
    return reply.code(401).send({ error: "Unauthorized" });
  }
}
