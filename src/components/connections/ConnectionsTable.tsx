type Row = {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: string;
  createdAt: string;
  lastSyncAt: string | null;
};

export default function ConnectionsTable({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return <div className="p-4 border rounded-xl text-sm text-neutral-500">No hay conexiones todavía.</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 dark:bg-neutral-900">
          <tr>
            <th className="text-left p-3">Nombre</th>
            <th className="text-left p-3">Proveedor</th>
            <th className="text-left p-3">Tipo</th>
            <th className="text-left p-3">Estado</th>
            <th className="text-left p-3">Creado</th>
            <th className="text-left p-3">Último sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-3 font-medium">{r.name}</td>
              <td className="p-3">{r.provider}</td>
              <td className="p-3">{r.type}</td>
              <td className="p-3">{r.status}</td>
              <td className="p-3">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="p-3">{r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
