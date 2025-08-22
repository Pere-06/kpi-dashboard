import { useEffect, useState } from "react";

export function useSheetData() {
  const [kpis, setKpis] = useState(null);
  const [serieBar, setSerieBar] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        // 👉 ahora pedimos a la API serverless de Vercel (no a /gs ni a Google)
        const r = await fetch("/api/data", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();

        if (!cancel) {
          const v = (json.ventas || []).map(r => ({ ...r, fecha: new Date(r.fecha) }));
          const c = (json.clientes || []).map(r => ({ ...r, fecha: new Date(r.fecha) }));
          setVentas(v);
          setClientes(c);
          setKpis(json.kpis);
          setSerieBar(json.serieBar || []);
        }
      } catch (e) {
        if (!cancel) setErr(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  return { ventas, clientes, serieBar, kpis, loading, err };
}
