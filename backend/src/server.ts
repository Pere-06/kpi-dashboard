// backend/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";

import { ENV } from "./env.js";
import { connectionsRoutes } from "./routes/connections.js";
import { chatRoutes } from "./routes/chat.js";
import { askRoutes } from "./routes/ask.js"; // <— NUEVO

const app = Fastify({ logger: true });

// Plugins
await app.register(sensible);
await app.register(helmet, { global: true });
await app.register(cors, { origin: ENV.CORS_ORIGIN, credentials: true });
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

// Health
app.get("/health", async () => ({ ok: true }));
app.get("/", async () => ({
  service: "mikpi-backend",
  ok: true,
  node: process.versions.node,
  openaiKeyLen: (ENV.OPENAI_API_KEY || "").length,
  hasDB: Boolean(ENV.DATABASE_URL),
}));

// Rutas
await app.register(connectionsRoutes);
await app.register(chatRoutes);
await app.register(askRoutes); // <— NUEVO

const keyLen = (ENV.OPENAI_API_KEY || "").length;
app.log.info({ msg: "ENV sanity", openaiKeyLen: keyLen, corsOrigin: ENV.CORS_ORIGIN });

await app.listen({ port: ENV.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`API listening on :${ENV.PORT}`));
