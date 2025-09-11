// backend/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";

import { ENV } from "./env.js";
import { connectionsRoutes } from "./routes/connections.js";
import { chatRoutes } from "./routes/chat.js"; // ⬅️ NUEVO

const app = Fastify({ logger: true });

// Plugins
await app.register(sensible);
await app.register(helmet, { global: true });
await app.register(cors, {
  origin: ENV.CORS_ORIGIN, // puede ser "*" o ["https://tu-app.vercel.app", ...]
  credentials: true,
});
await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
});

// Healthcheck
app.get("/health", async () => ({ ok: true }));

// Rutas
await app.register(connectionsRoutes);
await app.register(chatRoutes); // ⬅️ NUEVO (expone POST /api/chat)

// Arrancar servidor
await app
  .listen({ port: ENV.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`API listening on :${ENV.PORT}`));
