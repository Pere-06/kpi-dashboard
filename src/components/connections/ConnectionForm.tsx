import { useState } from "react";
import { useApi } from "@/hooks/useApi";

type Props = { onCreated: () => void };

export default function ConnectionForm({ onCreated }: Props) {
  const api = useApi();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("csv");
  const [type, setType] = useState("file");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      await api("/api/connections", {
        method: "POST",
        body: JSON.stringify({ name, provider, type, config: {} }),
      });
      setName("");
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3 border rounded-xl">
      <div className="font-medium">Nueva conexión</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          className="border rounded-lg px-3 py-2"
          placeholder="Nombre (ej. Ventas CSV)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <select className="border rounded-lg px-3 py-2" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="csv">CSV</option>
          <option value="excel">Excel</option>
          <option value="gsheets">Google Sheets</option>
          <option value="airtable">Airtable</option>
          <option value="hubspot">HubSpot</option>
          <option value="shopify">Shopify</option>
          <option value="stripe">Stripe</option>
          <option value="notion">Notion</option>
        </select>
        <select className="border rounded-lg px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="file">Archivo</option>
          <option value="api_key">API Key</option>
          <option value="oauth">OAuth</option>
        </select>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <button
        disabled={loading}
        className="self-start bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-lg disabled:opacity-60"
      >
        {loading ? "Creando..." : "Crear conexión"}
      </button>
    </form>
  );
}
