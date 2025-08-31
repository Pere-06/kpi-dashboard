import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { useApi } from "@/hooks/useApi";
import ConnectionForm from "@/components/connections/ConnectionForm";
import ConnectionsTable from "@/components/connections/ConnectionsTable";

type Row = {
  id: string; name: string; provider: string; type: string;
  status: string; createdAt: string; lastSyncAt: string | null;
};

export default function ConnectionsPage() {
  const api = useApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await api("/api/connections");
      const data = await res.json();
      setRows(data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conexiones</h1>
        <OrganizationSwitcher />
      </div>

      <SignedOut>
        <div className="p-4 border rounded-xl">
          Debes iniciar sesión para ver tus conexiones. <SignInButton>Iniciar sesión</SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <ConnectionForm onCreated={load} />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        {loading ? (
          <div className="p-4 border rounded-xl text-sm">Cargando...</div>
        ) : (
          <ConnectionsTable rows={rows} />
        )}
      </SignedIn>
    </div>
  );
}
