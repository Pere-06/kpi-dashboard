import { useEffect, useState } from "react";

/* === Tipos de datos === */
export type VentasRow = {
  fecha?: Date | null;
  canal?: string | null;
  ventas?: number | null;
  gastos?: number | null;
  mes?: string | null; // por si tu backend ya trae "YYYY-MM"
};

export type ClientesRow = {
  fecha?: Date | null;
};

export type SerieBarPoint = {
  mes: string;
  ventas: number;
  gastos: number;
};

export type Kpis = {
  ventasMes: number;
  deltaVentas: number;
  nuevosMes: number;
  deltaNuevos: number;
  ticketMedio: number;
  deltaTicket: number;
};

/* Respuesta esperada de /api/data (antes de convertir fechas) */
type ApiDataRaw = {
  ventas?: Array<Omit<VentasRow, "fecha"> & { fecha?: string | null }>;
  clientes?: Array<Omit<ClientesRow, "fecha"> & { fecha?: string | null }>;
  serieBar?: SerieBarPoint[];
  kpis?: Kpis | null;
};

type UseSheetDataReturn = {
  ventas: VentasRow[];
  clientes: ClientesRow[];
  serieBar: SerieBarPoint[];
  kpis: Kpis | null;
  loading: boolean;
  err: Error | string | null;
};

export function useSheetData(): UseSheetDataReturn {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [serieBar, setSerieBar] = useState<SerieBarPoint[]>([]);
  const [ventas, setVentas] = useState<VentasRow[]>([]);
  const [clientes, setClientes] = useState<ClientesRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<Error | string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch("/api/data", {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const json = (await r.json()) as ApiDataRaw;

        const v: VentasRow[] = (json.ventas ?? []).map((row) => ({
          ...row,
          fecha: row.fecha ? new Date(row.fecha) : null,
        }));

        const c: ClientesRow[] = (json.clientes ?? []).map((row) => ({
          ...row,
          fecha: row.fecha ? new Date(row.fecha) : null,
        }));

        setVentas(v);
        setClientes(c);
        setKpis(json.kpis ?? null);
        setSerieBar(json.serieBar ?? []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(e?.message ? e as Error : (e?.toString?.() ?? "Error desconocido"));
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  return { ventas, clientes, serieBar, kpis, loading, err };
}
