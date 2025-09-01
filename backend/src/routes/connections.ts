// backend/src/routes/connections.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../prisma.js";
import { requireOrg } from "../auth.js";
import { CreateConnectionSchema, UpdateConnectionSchema } from "../schemas/connections.js";
import { seal } from "../crypto.js";

// Tipos auxiliares para params
type IdParam = { id: string };

export async function connectionsRoutes(app: FastifyInstance) {
  // Listar conexiones de la organización actual
  app.get(
    "/api/connections",
    { preHandler: requireOrg },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const orgId = (req as any).orgId as string;

      const rows = await prisma.connection.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          provider: true,
          type: true,
          name: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
        },
      });

      reply.send(rows);
    }
  );

  // Crear conexión
  app.post(
    "/api/connections",
    { preHandler: requireOrg },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const orgId = (req as any).orgId as string;

      const parsed = CreateConnectionSchema.safeParse((req as any).body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const { provider, type, name, config, secret } = parsed.data;
      const secretEnc = secret ? seal(secret) : null;

      const created = await prisma.connection.create({
        data: {
          orgId,
          provider,
          type,
          name,
          // en tu schema `config` es Json obligatorio → asegurar objeto
          config: config ?? {},
          secretEnc,
          status: "active",
        },
        select: { id: true },
      });

      reply.code(201).send(created);
    }
  );

  // Actualizar conexión
  app.patch(
    "/api/connections/:id",
    { preHandler: requireOrg },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const orgId = (req as any).orgId as string;
      const { id } = (req.params as IdParam) ?? { id: "" };

      const parsed = UpdateConnectionSchema.safeParse((req as any).body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const existing = await prisma.connection.findFirst({ where: { id, orgId } });
      if (!existing) return reply.code(404).send({ error: "Not found" });

      const data: any = { ...parsed.data };
      if (data.secret) {
        data.secretEnc = seal(data.secret);
        delete data.secret;
      }
      if (data.config === undefined) {
        // evita enviar undefined a un campo Json no-null
        delete data.config;
      }

      const updated = await prisma.connection.update({ where: { id }, data });
      reply.send({ id: updated.id });
    }
  );

  // Eliminar conexión
  app.delete(
    "/api/connections/:id",
    { preHandler: requireOrg },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const orgId = (req as any).orgId as string;
      const { id } = (req.params as IdParam) ?? { id: "" };

      const existing = await prisma.connection.findFirst({ where: { id, orgId } });
      if (!existing) return reply.code(404).send({ error: "Not found" });

      await prisma.connection.delete({ where: { id } });
      reply.code(204).send();
    }
  );
}
