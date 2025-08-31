// api/data.js — Vercel Edge Function (JS)
// ✅ Siempre responde JSON para que la UI no rompa

export const config = { runtime: "edge" };

export default async function handler(_req) {
  try {
    const serieBar = Array.from({ length: 8 }, (_, i) => ({
      mes: String(i + 1).padStart(2, "0"),
      ventas: 10000 + i * 1500,
      gastos: 7000 + i * 1000,
    }));

    const ventas = [
      { fecha: new Date().toISOString(), canal: "Email", ventas: 2300 },
      { fecha: new Date().toISOString(), canal: "Ads", ventas: 1200 },
      { fecha: new Date().toISOString(), canal: "Orgánico", ventas: 1800 },
    ];

    const clientes = [
      { fecha: new Date().toISOString() },
      { fecha: new Date().toISOString() },
    ];

    const kpis = {
      ventasMes: 20650,
      deltaVentas: 4.3,
      nuevosMes: 37,
      deltaNuevos: 2.8,
      ticketMedio: 345,
      deltaTicket: 1.2,
    };

    return new Response(JSON.stringify({ serieBar, ventas, clientes, kpis }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
