import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

// TUS URLs CSV (funcionan en incógnito)
const CSV_CLIENTES =
  "/gs/spreadsheets/d/e/2PACX-1vTqlS3DPURwRwyqBYDiBw_s4-MiF-wU0DL08cFDD4IQIqEXB_GA8nONJ4bcaEoRQcpRmsnvdcfAymEZ/pub?gid=997201339&single=true&output=csv";

const CSV_VENTAS =
  "/gs/spreadsheets/d/e/2PACX-1vTqlS3DPURwRwyqBYDiBw_s4-MiF-wU0DL08cFDD4IQIqEXB_GA8nONJ4bcaEoRQcpRmsnvdcfAymEZ/pub?gid=31818336&single=true&output=csv";

// --- helpers robustos ---
const normalizeKey = (s = "") =>
  s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");

const parseNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const toDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function useSheetData() {
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setErr(null);

        // Descargas en paralelo
        const [rv, rc] = await Promise.all([
          fetch(CSV_VENTAS, { cache: "no-store" }),
          fetch(CSV_CLIENTES, { cache: "no-store" }),
        ]);

        if (!rv.ok) throw new Error(`Ventas HTTP ${rv.status}`);
        if (!rc.ok) throw new Error(`Clientes HTTP ${rc.status}`);

        const [txtV, txtC] = await Promise.all([rv.text(), rc.text()]);

        const parse = (csv) =>
          Papa.parse(csv, {
            header: true,
            dynamicTyping: false,
            skipEmptyLines: true,
            transformHeader: (h) => normalizeKey(h),
          }).data;

        const vRows = parse(txtV).map((r) => {
          const fecha = toDate(r.fecha ?? r.date);
          return {
            fecha,
            ventas: parseNumber(r.ventas ?? r.ingresos),
            gastos: parseNumber(r.gastos ?? r.costes),
            canal: String(r.canal ?? r.channel ?? "N/D").trim() || "N/D",
          };
        }).filter((r) => r.fecha);

        const cRows = parse(txtC).map((r) => {
          const fecha = toDate(r.fecha ?? r.date);
          return {
            fecha,
            nuevos_clientes: parseNumber(r.nuevos_clientes ?? r.nuevos ?? r.clientes_nuevos),
            ticket_medio: parseNumber(r.ticket_medio ?? r.ticket),
          };
        }).filter((r) => r.fecha);

        if (!cancel) {
          setVentas(vRows);
          setClientes(cRows);
        }
      } catch (e) {
        console.error("Fallo datos:", e);
        if (!cancel) setErr(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    if (!ventas.length || !clientes.length) return null;

    const ventasByM = ventas.reduce((acc, r) => {
      const key = ym(r.fecha);
      (acc[key] ||= { ventas: 0, gastos: 0 });
      acc[key].ventas += r.ventas;
      acc[key].gastos += r.gastos;
      return acc;
    }, {});
    const clientesByM = clientes.reduce((acc, r) => {
      const key = ym(r.fecha);
      (acc[key] ||= { nuevos: 0, ticketSum: 0, n: 0 });
      acc[key].nuevos += r.nuevos_clientes;
      acc[key].ticketSum += r.ticket_medio;
      acc[key].n += 1;
      return acc;
    }, {});

    const months = Object.keys(ventasByM).sort();
    const last = months.at(-1);
    const prev = months.at(-2);

    const vNow = ventasByM[last]?.ventas ?? 0;
    const vPrev = ventasByM[prev]?.ventas ?? 0;
    const deltaVentas = vPrev ? ((vNow - vPrev) / vPrev) * 100 : 0;

    const cNow = clientesByM[last]?.nuevos ?? 0;
    const cPrev = clientesByM[prev]?.nuevos ?? 0;
    const deltaNuevos = cPrev ? ((cNow - cPrev) / cPrev) * 100 : 0;

    const tmNow = clientesByM[last]?.n ? clientesByM[last].ticketSum / clientesByM[last].n : 0;
    const tmPrev = clientesByM[prev]?.n ? clientesByM[prev].ticketSum / clientesByM[prev].n : 0;
    const deltaTicket = tmPrev ? ((tmNow - tmPrev) / tmPrev) * 100 : 0;

    return { ventasMes: vNow, deltaVentas, nuevosMes: cNow, deltaNuevos, ticketMedio: tmNow, deltaTicket };
  }, [ventas, clientes]);

  // Serie para gráfico
  const serieBar = useMemo(() => {
    if (!ventas.length) return [];
    const byYM = {};
    ventas.forEach((r) => {
      const key = ym(r.fecha);
      (byYM[key] ||= { mes: key, ventas: 0, gastos: 0 });
      byYM[key].ventas += r.ventas;
      byYM[key].gastos += r.gastos;
    });
    return Object.values(byYM)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-8)
      .map((r) => ({ mes: r.mes.slice(5), ventas: r.ventas, gastos: r.gastos }));
  }, [ventas]);

  return { ventas, clientes, serieBar, kpis, loading, err };
}
