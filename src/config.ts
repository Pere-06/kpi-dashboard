// Frontend: src/config.ts
// src/config.ts
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? ""; // deja "" para usar /api -> vercel.json reescribe a Render


export const ENABLE_ORGS = (import.meta.env.VITE_ENABLE_ORGS ?? "0") === "1";

