// src/ai/askClient.ts
import { API_BASE } from "@/config";

export type AskResponse = {
  explanation: string;
  askBack?: string | null;
  sql: string;
  fields: string[];
  rows: any[];
  chartSpec: {
    id: string;
    type: "line" | "bar" | "area" | "pie";
    title: string;
    x?: string;
    y?: string[];
    notes?: string;
  };
};

export async function askLLM(question: string, lang: "es" | "en", availability?: {
  ventasMonths?: string[]; clientesMonths?: string[]; notes?: string;
}) : Promise<AskResponse> {
  const endpoint = `${API_BASE ? API_BASE : ""}/api/ask`;
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, lang, availability }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ASK_HTTP_${r.status}: ${txt}`);
  }
  return r.json();
}
