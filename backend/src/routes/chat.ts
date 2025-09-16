// backend/src/routes/chat.ts
import type { FastifyPluginAsync } from "fastify";

/** ===== Tipos alineados con el front ===== */
type ChartType = "line" | "bar" | "area" | "pie";
type ChartSpec = {
  id: string;
  type: ChartType;
  title: string;
  intent:
    | "ventas_por_canal_mes"
    | "ventas_vs_gastos_mes"
    | "evolucion_ventas_n_meses"
    | "top_canales"
    | "ventas_vs_gastos_dos_meses";
  params?: Record<string, any>;
  notes?: string;
};
type ChatMsg = { role: "user" | "assistant"; content: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** ===== Meses EN/ES ===== */
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const MONTHS_ALL = [...MONTHS_EN, ...MONTHS_ES];

const monthNameToIndex = (s: string): number | null => {
  const p = norm(s);
  const iEn = MONTHS_EN.indexOf(p);
  if (iEn >= 0) return iEn + 1;
  const iEs = MONTHS_ES.indexOf(p);
  if (iEs >= 0) return iEs + 1;
  return null;
};

/** yyyy-mm helpers */
const mm = (ym: string) => (ym?.split("-")[1] ?? "").padStart(2, "0");
const latestYMForMonth = (available: string[], monthNum: number): string | null => {
  const wanted = String(monthNum).padStart(2, "0");
  const hits = available.filter((ym) => mm(ym) === wanted).sort();
  return hits.at(-1) ?? null;
};

/** Busca dos meses por nombre o por patrón YYYY-MM en el texto */
function extractTwoMonths(text: string, available: string[]) {
  const out: string[] = [];

  // 1) YYYY-MM explícitos
  const ymMatches = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)?.slice(0, 2) ?? [];
  out.push(...ymMatches);

  // 2) nombres de meses (tomamos los 2 primeros distintos), los mapeamos al último YYYY-MM disponible
  if (out.length < 2) {
    const namesFound: string[] = [];
    for (const name of MONTHS_ALL) {
      const re = new RegExp(`\\b${name}\\b`, "i");
      if (re.test(text)) namesFound.push(name);
    }
    const distinct = Array.from(new Set(namesFound)).slice(0, 2);
    for (const n of distinct) {
      const num = monthNameToIndex(n);
      if (!num) continue;
      const ym = latestYMForMonth(available, num);
      if (ym) out.push(ym);
    }
  }

  return out.slice(0, 2);
}

/** Extrae "last N months / últimos N meses"; si no aparece, da defaultN */
function extractWindowN(text: string, defaultN: number) {
  const p = norm(text);
  const m = p.match(/(?:last|ultimos?|últimos?)\s+(\d+)\s+month|meses?/);
  const n = m?.[1] ? Number(m[1]) : defaultN;
  return Math.max(1, Math.min(36, Number.isFinite(n) ? n : defaultN));
}

/** ===== Detectores de intención (ES/EN) ===== */
const wantsSalesVsExpenses = (p: string) =>
  /(ventas.*gastos|gastos.*ventas|sales.*expenses|expenses.*sales)/.test(p);

const wantsSalesByChannel = (p: string) =>
  /(\bventas\b|\bingresos\b).*(canal|canales)|\bsales\b.*channel(s)?/.test(p);

const wantsSalesEvolution = (p: string) =>
  /(evolucion|tendencia|hist[oó]rico|evolution|trend|history)/.test(p);

const wantsTopChannels = (p: string) =>
  /top\s*\d+.*(canales?|channels?)/.test(p);

const mentionsNewCustomers = (p: string) =>
  /(nuevos\s+clientes|altas\s+clientes|new\s+customers)/.test(p);

/** ===== Respuesta breve, natural, bilingüe ===== */
function brief(msg: string, lang: "es" | "en") {
  return lang === "en" ? msg : msg; // todos los strings abajo ya vienen en ambos idiomas
}

/** ===== Ruta Fastify ===== */
export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/chat", async (req, reply) => {
    const body = (req.body ?? {}) as {
      messages?: ChatMsg[];
      lang?: "es" | "en";
      mesActivo?: string | null;
      /** enviado desde el front (App.tsx) */
      ventasMonths?: string[];
      clientesMonths?: string[];
      maxCharts?: number;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lang: "es" | "en" = body.lang === "en" ? "en" : "es";
    const lastUser = [...messages].reverse().find(m => m?.role === "user")?.content || "";
    const p = norm(lastUser);

    const ventasMonths = Array.isArray(body.ventasMonths) ? body.ventasMonths.filter(Boolean) : [];
    const clientesMonths = Array.isArray(body.clientesMonths) ? body.clientesMonths.filter(Boolean) : [];
    const available = ventasMonths.slice().sort(); // para ventas/gastos
    const maxCharts = Math.max(1, Math.min(4, Number(body.maxCharts) || 4));

    const specs: ChartSpec[] = [];
    const notes: string[] = [];

    /** 1) Dos meses concretos → comparativa directa */
    if (wantsSalesVsExpenses(p)) {
      const pair = extractTwoMonths(lastUser, available);
      if (pair.length === 2) {
        specs.push({
          id: uid(),
          type: "bar",
          title: lang === "en"
            ? `Sales vs Expenses (${pair[0]} vs ${pair[1]})`
            : `Ventas vs Gastos (${pair[0]} vs ${pair[1]})`,
          intent: "ventas_vs_gastos_dos_meses",
          params: { months: pair },
          notes: lang === "en"
            ? "Direct comparison between two months."
            : "Comparativa directa entre dos meses.",
        });
      }
    }

    /** 2) Ventana “últimos N meses” de ventas vs gastos */
    if (specs.length === 0 && wantsSalesVsExpenses(p)) {
      const requested = extractWindowN(lastUser, 8);
      const have = available.length;
      const used = Math.min(requested, have);
      if (used > 0) {
        if (used < requested) {
          notes.push(
            lang === "en"
              ? `Only ${have} months available; I’ll use the last ${used}.`
              : `Solo hay ${have} meses disponibles; usaré los últimos ${used}.`
          );
        }
        specs.push({
          id: uid(),
          type: "bar",
          title: lang === "en"
            ? `Sales vs Expenses (last ${used} months)`
            : `Ventas vs Gastos (últimos ${used} meses)`,
          intent: "ventas_vs_gastos_mes",
          params: { months: used },
        });
      }
    }

    /** 3) Evolución de ventas */
    if (specs.length === 0 && wantsSalesEvolution(p)) {
      const requested = extractWindowN(lastUser, 6);
      const have = available.length;
      const used = Math.min(requested, have);
      if (used > 0) {
        if (used < requested) {
          notes.push(
            lang === "en"
              ? `Only ${have} months available; I’ll use the last ${used}.`
              : `Solo hay ${have} meses disponibles; usaré los últimos ${used}.`
          );
        }
        specs.push({
          id: uid(),
          type: "line",
          title: lang === "en"
            ? `Sales evolution (last ${used} months)`
            : `Evolución de ventas (últimos ${used} meses)`,
          intent: "evolucion_ventas_n_meses",
          params: { months: used },
        });
      }
    }

    /** 4) Ventas por canal (mes activo) */
    if (specs.length === 0 && wantsSalesByChannel(p)) {
      specs.push({
        id: uid(),
        type: "pie",
        title: lang === "en" ? "Sales by channel (active month)" : "Ventas por canal (mes activo)",
        intent: "ventas_por_canal_mes",
        params: {},
      });
    }

    /** 5) Top N canales */
    if (specs.length === 0 && wantsTopChannels(p)) {
      const m = p.match(/top\s*(\d+)/);
      const topN = m ? Math.max(1, Math.min(20, Number(m[1]))) : 5;
      specs.push({
        id: uid(),
        type: "bar",
        title: lang === "en"
          ? `Top ${topN} channels (active month)`
          : `Top ${topN} canales (mes activo)`,
        intent: "top_canales",
        params: { topN },
        notes: lang === "en" ? "Sorted by sales descending." : "Ordenado por ventas descendentes.",
      });
    }

    /** 6) Peticiones de “new customers / nuevos clientes”: informamos brevemente (sin spec) */
    let customersNote = "";
    if (mentionsNewCustomers(p)) {
      const have = clientesMonths.length;
      customersNote =
        lang === "en"
          ? (have > 0
              ? `New-customer data found for ${have} month${have>1?"s":""}. Charts for customers aren’t enabled yet; I can still analyze it textually or build sales/expenses charts.`
              : `No new-customer data detected. I can build sales/expenses charts instead.`)
          : (have > 0
              ? `Hay datos de nuevos clientes para ${have} mes(es). Aún no hay gráficos de clientes; puedo analizarlos en texto o crear gráficos de ventas/gastos.`
              : `No veo datos de nuevos clientes. Puedo crear gráficos de ventas/gastos en su lugar.`);
    }

    /** ===== Mensaje asistente (2 frases máx) ===== */
    let assistant = "";
    if (specs.length) {
      const titles = specs.map(s => s.title).join(" · ");
      const first = lang === "en" ? "Got it. I’ll generate the chart." : "Hecho. Genero el gráfico.";
      const extra = notes.length ? (" " + notes.join(" ")) : "";
      assistant = `${first} ${titles}.${extra}`.trim();
    } else {
      // sin specs: sugerencias muy breves
      if (customersNote) {
        assistant = customersNote;
      } else {
        assistant =
          lang === "en"
            ? "Tell me what to analyze. I can chart: “sales by channel”, “sales vs expenses last months”, “sales evolution last months”, or “top N channels”."
            : "Dime qué analizar. Puedo graficar: «ventas por canal», «ventas vs gastos últimos meses», «evolución de ventas últimos meses» o «top N canales».";
      }
    }

    // adjunta última nota si aplica (recorte de ventana)
    if (!customersNote && notes.length && !assistant.includes(notes[0])) {
      assistant += (assistant.endsWith(".") ? " " : ". ") + notes.join(" ");
    }

    return reply.send({
      reply: assistant,
      specs: specs.slice(0, maxCharts),
      usedLLM: false,
      reason: "ok",
      debug: {
        ventasMonths,
        clientesMonths,
      },
    });
  });
};
