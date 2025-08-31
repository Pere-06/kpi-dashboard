// backend/src/routes/connections.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../prisma";
import { requireOrg } from "../auth";
import { CreateConnectionSchema, UpdateConnectionSchema } from "../schemas/connections";
import { seal } from "../crypto";

export async function connectionsRoutes(app: FastifyInstance) {
  app.get("/api/connections", { preHandler: requireOrg }, async (req, reply) => {
    const orgId = req.orgId!;
    const rows = await prisma.connection.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, type: true, name: true, status: true, lastSyncAt: true, createdAt: true }
    });
    reply.send(rows);
  });

  app.post("/api/connections", { preHandler: requireOrg }, async (req, reply) => {
    const orgId = req.orgId!;
    const parsed = CreateConnectionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { provider, type, name, config, secret } = parsed.data;
    const secretEnc = secret ? seal(secret) : null;

    const created = await prisma.connection.create({
      data: { orgId, provider, type, name, config, secretEnc, status: "active" },
      select: { id: true }
    });

    reply.code(201).send(created);
  });

  app.patch("/api/connections/:id", { preHandler: requireOrg }, async (req, reply) => {
    const orgId = req.orgId!;
    const id = (req.params as any).id as string;

    const parsed = UpdateConnectionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.connection.findFirst({ where: { id, orgId } });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const data: any = { ...parsed.data };
    if (data.secret) {
      data.secretEnc = seal(data.secret);
      delete data.secret;
    }
    const updated = await prisma.connection.update({ where: { id }, data });
    reply.send({ id: updated.id });
  });

  app.delete("/api/connections/:id", { preHandler: requireOrg }, async (req, reply) => {
    const orgId = req.orgId!;
    const id = (req.params as any).id as string;

    const existing = await prisma.connection.findFirst({ where: { id, orgId } });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await prisma.connection.delete({ where: { id } });
    reply.code(204).send();
  });
}
