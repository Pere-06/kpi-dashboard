import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton, OrganizationSwitcher } from "@clerk/clerk-react";
import ConnectionForm from "@/components/connections/ConnectionForm";
import ConnectionsTable from "@/components/connections/ConnectionsTable";
import { API_BASE } from "@/config";

type Row = {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: string;
  createdAt: string;
  lastSyncAt: string | null;
};

const ORG_ENABLED = (import.meta.env.VITE_CLERK_ORG_ENABLED || "").toString() === "true";

/** Pequeño helper de fetch que fuerza API_BASE (Render) */
async function apiFetch(path: string, init?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt || url}`);
  }
  return res;
}

export default function ConnectionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/connections");
      const data = (await res.json()) as Row[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load connections");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conexiones</h1>
        {/* Sólo mostrar el selector de organización si está habilitado */}
        {ORG_ENABLED ? <OrganizationSwitcher /> : null}
      </div>

      <SignedOut>
        <div className="p-4 border rounded-xl">
          Debes iniciar sesión para ver tus conexiones.{" "}
          <SignInButton>
            <button className="underline">Iniciar sesión</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <ConnectionForm onCreated={load} />

        {err && (
          <div className="p-3 rounded-lg border border-rose-300/40 bg-rose-50 text-rose-700 text-sm">
            {err}
          </div>
        )}

        {loading ? (
          <div className="p-4 border rounded-xl text-sm">Cargando...</div>
        ) : (
          <ConnectionsTable rows={rows} />
        )}
      </SignedIn>
    </div>
  );
}
