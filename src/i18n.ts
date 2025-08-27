// src/i18n.ts
export type Lang = "en" | "es";

export const translations: Record<Lang, Record<string, string>> = {
  en: {
    "app.title": "MiKPI Dashboard",
    "theme.toggle.light": "Light",
    "theme.toggle.dark": "Dark",
    "auth.signin": "Sign in",
    "chat.greeting": "Hi 👋 What would you like to analyze today?",
    "chat.title": "Analysis chat",
    "chat.placeholder": "Ask for a chart or an insight… (Enter sends, Shift+Enter = newline)",
    "chat.examples.title": "Quick examples",
    "chat.example.1": "sales by channel",
    "chat.example.2": "sales vs expenses last 8 months",
    "chat.example.3": "sales evolution last 6 months",
    "chat.example.4": "top 3 channels",
    "chat.helper":
      "I can create charts if you ask for things like:\n• “sales by channel”\n• “sales vs expenses last 8 months”\n• “sales evolution last 6 months”\n• “top 3 channels”",
    "month.filter": "Analysis month",
    "kpi.salesMonth": "Sales (month)",
    "kpi.newCustomers": "New customers",
    "kpi.avgTicket": "Average ticket",
    "loading": "Loading…",
    "nodata": "No data.",
    "error": "Error",
    "chart.bar.title": "Sales vs Expenses (last 8 months)",
    "pie.title.prefix": "Distribution by channel — ",
    "insights.title": "📌 Interpretation",
    "insights.text": "This month’s sales are {sales} ({delta} vs previous month). Average ticket is {ticket}.",
    "ai.title": "🧠 AI-generated charts",
    "ai.clear": "Clear",
    "send": "Send",
    "lang.label": "Language",
  },
  es: {
    "app.title": "MiKPI Dashboard",
    "theme.toggle.light": "Claro",
    "theme.toggle.dark": "Oscuro",
    "auth.signin": "Iniciar sesión",
    "chat.greeting": "Hola 👋 ¿qué quieres analizar hoy?",
    "chat.title": "Chat de análisis",
    "chat.placeholder": "Pide un gráfico o un insight… (Enter envía, Shift+Enter = salto)",
    "chat.examples.title": "Ejemplos rápidos",
    "chat.example.1": "ventas por canal",
    "chat.example.2": "ventas vs gastos últimos 8 meses",
    "chat.example.3": "evolución de ventas últimos 6 meses",
    "chat.example.4": "top 3 canales",
    "chat.helper":
      "Puedo crear gráficos si me pides algo como:\n• «ventas por canal»\n• «ventas vs gastos últimos 8 meses»\n• «evolución de ventas últimos 6 meses»\n• «top 3 canales»",
    "month.filter": "Mes de análisis",
    "kpi.salesMonth": "Ventas (mes)",
    "kpi.newCustomers": "Nuevos clientes",
    "kpi.avgTicket": "Ticket medio",
    "loading": "Cargando…",
    "nodata": "Sin datos.",
    "error": "Error",
    "chart.bar.title": "Ventas vs Gastos (últimos 8 meses)",
    "pie.title.prefix": "Distribución por canal — ",
    "insights.title": "📌 Interpretación",
    "insights.text":
      "Las ventas del mes son {sales} ({delta} vs mes anterior). El ticket medio es {ticket}.",
    "ai.title": "🧠 Gráficos generados por IA",
    "ai.clear": "Limpiar",
    "send": "Enviar",
    "lang.label": "Idioma",
  },
};

export function t(lang: Lang, key: string, vars?: Record<string, string>) {
  const str = translations[lang]?.[key] ?? key;
  if (!vars) return str;
  return Object.keys(vars).reduce(
    (acc, k) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]),
    str
  );
}
