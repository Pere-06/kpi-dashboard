// backend/src/env.ts
import "dotenv/config";

function req(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "true";

export const ENV = {
  PORT: Number(process.env.PORT || 4000),

  DATABASE_URL: req("DATABASE_URL"),

  // Solo exigimos la PEM si NO hay bypass
  CLERK_PEM_PUBLIC_KEY: DEV_BYPASS_AUTH
    ? (process.env.CLERK_PEM_PUBLIC_KEY || "")
    : req("CLERK_PEM_PUBLIC_KEY"),

  // Si usaste \n escapados, lo normalizamos aquí
  get CLERK_PEM_PUBLIC_KEY_NORMALIZED(): string {
    return (this.CLERK_PEM_PUBLIC_KEY || "").replace(/\\n/g, "\n");
  },

  DATA_KEY_BASE64: process.env.DATA_KEY_BASE64 || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",

  DEV_BYPASS_AUTH,
  DEV_ORG_ID: process.env.DEV_ORG_ID || "",

  // ✅ OpenAI (seguro para build y runtime)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
} as const;

export type Env = typeof ENV;
