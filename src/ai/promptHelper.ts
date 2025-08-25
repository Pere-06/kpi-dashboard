// src/ai/promptHelper.ts
import type { ChartSpec } from "../types/chart";

export function describeSpec(spec: ChartSpec): string {
  switch (spec.intent) {
    case "ventas_por_canal_mes":
      return "He preparado un gráfico de tarta con la distribución de ventas por canal en el mes activo.";
    case "ventas_vs_gastos_mes":
      return `He añadido un bar chart de ventas vs gastos para los últimos ${(spec.params as any)?.months ?? 8} meses.`;
    case "evolucion_ventas_n_meses":
      return `He creado una línea con la evolución de ventas en los últimos ${(spec.params as any)?.months ?? 6} meses.`;
    case "top_canales":
      return `He mostrado el Top ${(spec.params as any)?.topN ?? 5} de canales por ventas del mes activo.`;
    default:
      return "He generado un gráfico según tu petición.";
  }
}
