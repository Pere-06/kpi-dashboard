export type ChartType = "line" | "bar" | "area" | "pie";

export type ChartSpec = {
  id: string;                 // uid para render y key
  type: ChartType;
  title: string;
  x?: { field: string; label?: string };
  y?: { field: string; label?: string };
  series?: { field: string; label?: string }[]; // para comparativas
  notes?: string;
  // parámetros de agregación a aplicar en cliente (con tus datos locales)
  // soportamos algunos casos comunes
  intent:
    | "ventas_por_canal_mes"
    | "ventas_vs_gastos_mes"
    | "evolucion_ventas_n_meses"
    | "top_canales";
  params?: Record<string, any>;
};
