// api/data.js  (Node runtime)
export default async function handler(req, res) {
  try {
    const VENTAS_URL = process.env.VENTAS_URL;
    const CLIENTES_URL = process.env.CLIENTES_URL;
    if (!VENTAS_URL || !CLIENTES_URL) {
      return res.status(500).json({ error: "Missing env VENTAS_URL/CLIENTES_URL" });
    }

    const [rv, rc] = await Promise.all([fetch(VENTAS_URL), fetch(CLIENTES_URL)]);
    if (!rv.ok || !rc.ok) {
      return res.status(502).json({ error: `Upstream ${rv.status}/${rc.status}` });
    }
    const [csvV, csvC] = await Promise.all([rv.text(), rc.text()]);

    // Parse CSV simple (sin dependencias) -> split por líneas
    const parseCsv = (txt) => {
      const lines = txt.trim().split(/\r?\n/);
      const headers = lines[0].split(",").map(h => norm(h));
      return lines.slice(1).map(line => {
        const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // respeta comas dentro de comillas
        const obj = {};
        headers.forEach((h, i) => obj[h] = (cols[i] ?? "").replace(/^"|"$/g,""));
        return obj;
      });
    };

    const norm = (s="") =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"_");
    const toNum = (v) => {
      if (v===null||v===undefined||v==="") return 0;
      const n = Number(String(v).replace(/\./g,"").replace(",","."));
      return Number.isFinite(n) ? n : 0;
    };
    const toDate = (v) => { const d=new Date(v); return isNaN(d)?null:d; };
    const ym = (d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

    const vRowsRaw = parseCsv(csvV);
    const cRowsRaw = parseCsv(csvC);

    const ventas = vRowsRaw.map(r => ({
      fecha: toDate(r.fecha || r.date),
      ventas: toNum(r.ventas || r.ingresos),
      gastos: toNum(r.gastos || r.costes),
      canal: (r.canal || r.channel || "N/D").trim(),
    })).filter(r => r.fecha);

    const clientes = cRowsRaw.map(r => ({
      fecha: toDate(r.fecha || r.date),
      nuevos_clientes: toNum(r.nuevos_clientes || r.nuevos || r.clientes_nuevos),
      ticket_medio: toNum(r.ticket_medio || r.ticket),
    })).filter(r => r.fecha);

    // Aggregations
    const ventasByM = {};
    ventas.forEach(r => {
      const key = ym(r.fecha);
      (ventasByM[key] ||= { ventas:0, gastos:0 });
      ventasByM[key].ventas += r.ventas;
      ventasByM[key].gastos += r.gastos;
    });

    const clientesByM = {};
    clientes.forEach(r => {
      const key = ym(r.fecha);
      (clientesByM[key] ||= { nuevos:0, ticketSum:0, n:0 });
      clientesByM[key].nuevos += r.nuevos_clientes;
      clientesByM[key].ticketSum += r.ticket_medio;
      clientesByM[key].n += 1;
    });

    const months = Object.keys(ventasByM).sort();
    const last = months.at(-1); const prev = months.at(-2);
    const vNow = ventasByM[last]?.ventas ?? 0;
    const vPrev = ventasByM[prev]?.ventas ?? 0;
    const cNow = clientesByM[last]?.nuevos ?? 0;
    const cPrev = clientesByM[prev]?.nuevos ?? 0;
    const tmNow = clientesByM[last]?.n ? clientesByM[last].ticketSum / clientesByM[last].n : 0;
    const tmPrev = clientesByM[prev]?.n ? clientesByM[prev].ticketSum / clientesByM[prev].n : 0;

    const kpis = {
      ventasMes: vNow,
      deltaVentas: vPrev ? ((vNow - vPrev) / vPrev) * 100 : 0,
      nuevosMes: cNow,
      deltaNuevos: cPrev ? ((cNow - cPrev) / cPrev) * 100 : 0,
      ticketMedio: tmNow,
      deltaTicket: tmPrev ? ((tmNow - tmPrev) / tmPrev) * 100 : 0,
    };

    const serieBar = Object.entries(ventasByM)
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(-8)
      .map(([mes, v]) => ({ mes: mes.slice(5), ventas: v.ventas, gastos: v.gastos }));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600"); // cache 5 min
    return res.status(200).json({ kpis, serieBar, updatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
