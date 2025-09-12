// Frontend: src/config.ts
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export const ENABLE_ORGS = (import.meta.env.VITE_ENABLE_ORGS ?? "0") === "1";

