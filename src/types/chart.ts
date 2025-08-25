// src/types/chart.ts

export type ChartType = "line" | "bar" | "area" | "pie" | "scatter";

export type FilterOp =
  | { op: "eq"; field: string; value: string | number | boolean }
  | { op: "gte" | "lte" | "gt" | "lt"; field: string; value: number | string }
  | { op: "in"; field: string; value: Array<string | number> };

export interface DataQuery {
  source: "mock" | "crm" | "airtable" | "postgres";
  dataset: string;
  fields: string[];
  filters?: FilterOp[];
  groupBy?: string[];
  dateRange?: { start?: string; end?: string };
  agg?: { op: "sum" | "avg" | "count" | "min" | "max"; field: string; as: string };
  sort?: { by: string; dir: "asc" | "desc" };
  limit?: number;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  x: { field: string; label?: string };
  y: { field: string; label?: string };
  series?: { field: string }[];
  query: DataQuery;
  notes?: string;
}
