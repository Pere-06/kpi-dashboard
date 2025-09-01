// backend/src/schemas/connections.ts
import { z } from "zod";

export const CreateConnectionSchema = z.object({
  provider: z
    .enum([
      "csv",
      "excel",
      "airtable",
      "gsheets",
      "hubspot",
      "shopify",
      "stripe",
      "notion",
    ])
    .or(z.string().min(2)),
  type: z.enum(["oauth", "api_key", "file"]),
  name: z.string().min(2).max(80),
  config: z.record(z.any()).default({}),
  secret: z.record(z.any()).optional(),
});

export const UpdateConnectionSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  config: z.record(z.any()).optional(),
  secret: z.record(z.any()).optional(),
  status: z.enum(["active", "error", "paused"]).optional(),
});

// Export agrupado para usar en rutas
export const connectionsSchema = {
  create: { body: CreateConnectionSchema },
  update: { body: UpdateConnectionSchema },
};
