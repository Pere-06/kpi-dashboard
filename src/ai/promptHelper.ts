import type { ChartSpec } from "@/types/chart";

export function describeSpec(spec: ChartSpec): string {
  switch (spec.intent) {
    case "ventas_por_canal_mes":
      return "He añadido un **gráfico de distribución por canal** del mes activo (tipo donut).";
    case "ventas_vs_gastos_mes":
      return `He añadido **Ventas vs Gastos** para los últimos ${spec.params?.months ?? 8} meses (barras agrupadas).`;
    case "evolucion_ventas_n_meses":
      return `He añadido la **evolución de ventas** de los últimos ${spec.params?.months ?? 6} meses (línea).`;
    case "top_canales":
      return `He añadido el **Top ${spec.params?.topN ?? 5} canales por ventas** del mes activo (barras).`;
    default:
      return "He añadido un gráfico basado en tu petición.";
  }
}
