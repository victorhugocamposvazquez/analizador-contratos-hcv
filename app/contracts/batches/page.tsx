import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const supabase = createClient();
  const { data: batches } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (batches ?? []).map((b) => b.id);
  // Trae stats para cada uno (consulta una RPC por batch para mantener simple)
  const stats = await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.rpc("batch_stats", { p_batch_id: id });
      return { id, stats: (data && data[0]) || null };
    })
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s.stats]));

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-5 py-4 border-b">
        <h2 className="font-medium">Lotes de subida</h2>
        <p className="text-xs text-slate-500">
          Cada lote es una subida masiva. El procesador corre cada minuto.
        </p>
      </div>
      {(!batches || batches.length === 0) && (
        <p className="px-5 py-12 text-center text-sm text-slate-500">
          Aún no hay lotes.
        </p>
      )}
      {batches && batches.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Lote</th>
              <th className="text-left px-4 py-2 font-medium">Creado</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
              <th className="text-right px-4 py-2 font-medium">Procesados</th>
              <th className="text-right px-4 py-2 font-medium">Pendientes</th>
              <th className="text-right px-4 py-2 font-medium">Por revisar</th>
              <th className="text-right px-4 py-2 font-medium">Fallidos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const s = statsMap[b.id];
              const pct = s && s.total > 0
                ? Math.round((s.done / s.total) * 100)
                : 0;
              return (
                <tr key={b.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/contracts/batches/${b.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.name || b.id.slice(0, 8)}
                    </Link>
                    <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden w-40">
                      <div
                        className="h-full bg-slate-900"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDate(b.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">{s?.total ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{s?.done ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {s ? s.pending + s.processing : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s?.needs_review ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {(s?.failed ?? 0) > 0 ? (
                      <span className="text-red-600">{s!.failed}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/contracts/batches/${b.id}`}
                      className="text-slate-700 hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
