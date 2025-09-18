// api/chat.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

type ChartSpec = {
  id?: string;
  intent: string;          // p.ej. 'ventas_vs_gastos_mes' | 'evolucion_ventas_n_meses' | 'ventas_por_canal_mes'
  title?: string;
  params?: Record<string, any>;
  notes?: string;
};

// Parseo seguro por si Vercel te pasa el body como string
function safeParse<T = any>(x: any): T {
  if (x && typeof x === "object") return x as T;
  try { return JSON.parse(String(x || "{}")) as T; } catch { return {} as T; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));
  }

  const body = safeParse<{
    message?: string;
    messages?: { role: "user" | "assistant"; content: string }[];
    mesActivo?: string | null;
    mesesDisponibles?: string[];
    lang?: "es" | "en";
    maxCharts?: number;
  }>(req.body);

  const lang = body.lang || "en";

  // Tomamos el último texto del usuario
  let text = "";
  if (Array.isArray(body.messages) && body.messages.length) {
    text = String(body.messages[body.messages.length - 1]?.content || "");
  } else if (typeof body.message === "string") {
    text = body.message;
  }
  const low = text.toLowerCase();

  // Heurísticas MVP (el front sabe dibujar estos intents)
  const specs: ChartSpec[] = [];
  const monthsMatch = low.match(/last\s+(\d+)\s+months|últimos?\s+(\d+)\s+meses/);
  const months = monthsMatch ? Number(monthsMatch[1] || monthsMatch[2]) : undefined;

  if ((low.includes("sales") && low.includes("expenses")) || (low.includes("ventas") && low.includes("gastos"))) {
    specs.push({ intent: "ventas_vs_gastos_mes", params: { months: months ?? 8 } });
  } else if (low.includes("evolution") || low.includes("evolución") || low.includes("evolucion")) {
    specs.push({ intent: "evolucion_ventas_n_meses", params: { months: months ?? 6 } });
  } else if (low.includes("channel") || low.includes("canal") || low.includes("channels") || low.includes("canales")) {
    specs.push({ intent: "ventas_por_canal_mes" });
  }

  const reply = (lang === "en") ? "Got it." : "Entendido.";
  return res.status(200).send(JSON.stringify({ reply, specs }));
}
