// backend/src/server.ts

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";

import { ENV } from "./env.js";
import { connectionsRoutes } from "./routes/connections.js";
import { chatRoutes } from "./routes/chat.js";

const app = Fastify({ logger: true });

// ── Plugins básicos
await app.register(sensible);
await app.register(helmet, { global: true });
await app.register(cors, {
  origin: ENV.CORS_ORIGIN,
  credentials: true,
});
await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
});

// ── Healthchecks
app.get("/health", async () => ({ ok: true }));

// Endpoint raíz: útil para diagnóstico rápido
app.get("/", async () => ({
  service: "mikpi-backend",
  ok: true,
  node: process.versions.node,
  openaiKeyLen: (ENV.OPENAI_API_KEY || "").length, // 0 = no llega la clave
  hasDB: Boolean(ENV.DATABASE_URL),
}));

// ── Rutas de negocio
await app.register(connectionsRoutes);
await app.register(chatRoutes);

// ── Arranque con log de saneo de entorno
const keyLen = (ENV.OPENAI_API_KEY || "").length;
app.log.info({ msg: "ENV sanity", openaiKeyLen: keyLen, corsOrigin: ENV.CORS_ORIGIN });

await app
  .listen({ port: ENV.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`API listening on :${ENV.PORT}`));
