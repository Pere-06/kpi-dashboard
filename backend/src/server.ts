// backend/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { env } from './env.js';
import connectionsRoutes from './routes/connections.js';

const app = Fastify({ logger: true });

await app.register(sensible);
await app.register(helmet, { global: true });
await app.register(cors, { origin: ENV.CORS_ORIGIN, credentials: true });
await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
  allowList: [],
});

app.get("/health", async () => ({ ok: true }));

await app.register(connectionsRoutes);

app.listen({ port: ENV.PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`API on :${ENV.PORT}`);
});
