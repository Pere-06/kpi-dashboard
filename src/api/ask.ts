// src/api/ask.ts
import { API_BASE } from "../config";
import type { Lang } from "../i18n";
import type { ChartSpec } from "../types/chart";

export type AskResponse = {
  explanation: string;
  askBack: string | null;
  sql: string;
  fields: string[];
  rows: Array<Record<string, any>>;
  chartSpec: ChartSpec & { x?: string; y?: string[] };
};

export async function ask(question: string, lang: Lang = "en", tableHints?: string[], signal?: AbortSignal): Promise<AskResponse> {
  const r = await fetch(`${API_BASE || ""}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ question, lang, tableHints }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.message || `HTTP ${r.status}`);
  }
  return r.json();
}
