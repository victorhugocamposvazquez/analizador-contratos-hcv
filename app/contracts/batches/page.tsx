import { createClient } from "@/lib/supabase-server";
import BatchesBulkTable, {
  type BatchRow,
} from "@/components/BatchesBulkTable";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const supabase = createClient();
  const { data: batches } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (batches ?? []).map((b) => b.id);
  const stats = await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.rpc("batch_stats", { p_batch_id: id });
      return { id, stats: (data && data[0]) || null };
    })
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s.stats]));

  const rows: BatchRow[] = (batches ?? []).map((b) => ({
    id: b.id,
    name: (b.name as string) || b.id.slice(0, 8),
    created_at: b.created_at as string,
    stats: statsMap[b.id] ?? null,
  }));

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-5 py-4 border-b">
        <h2 className="font-medium">Lotes de subida</h2>
        <p className="text-xs text-slate-500">
          Cada lote es una subida masiva. El procesador corre cada minuto. Podéis
          seleccionar varios lotes y borrarlos a la vez (también se eliminan los
          contratos de esos lotes).
        </p>
      </div>
      {(!batches || batches.length === 0) && (
        <p className="px-5 py-12 text-center text-sm text-slate-500">
          Aún no hay lotes.
        </p>
      )}
      {batches && batches.length > 0 && <BatchesBulkTable rows={rows} />}
    </div>
  );
}
