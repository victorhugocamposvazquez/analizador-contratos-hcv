import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import DniBatchesBulkTable, { type DniBatchRow } from "@/components/DniBatchesBulkTable";

export const dynamic = "force-dynamic";

export default async function DniBatchesPage() {
  const supabase = createClient();
  const { data: batches } = await supabase
    .from("dni_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (batches ?? []).map((b) => b.id);
  const stats = await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.rpc("dni_batch_stats", { p_batch_id: id });
      return { id, stats: data?.[0] ?? null };
    })
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s.stats]));

  const rows: DniBatchRow[] = (batches ?? []).map((b) => ({
    id: b.id,
    name: ((b.name as string) ?? "").trim() || b.id.slice(0, 8),
    created_at: b.created_at as string,
    stats: statsMap[b.id]
      ? {
          total: statsMap[b.id].total ?? 0,
          done: statsMap[b.id].done ?? 0,
          pending: statsMap[b.id].pending ?? 0,
          processing: statsMap[b.id].processing ?? 0,
          failed: statsMap[b.id].failed ?? 0,
          needs_review: statsMap[b.id].needs_review ?? 0,
        }
      : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 justify-between items-center">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/contracts/dnis" className="underline hover:no-underline">
              DNI/NIE
            </Link>{" "}
            / Lotes
          </p>
          <h1 className="text-xl font-semibold mt-1">Lotes DNI/NIE</h1>
        </div>
        <Link
          href="/contracts/dnis"
          className="text-sm rounded-lg bg-slate-900 text-white px-4 py-2 hover:bg-slate-800"
        >
          Nueva subida
        </Link>
      </div>
      <div className="bg-white border rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-medium">Historial</h2>
          <p className="text-xs text-slate-500 mt-1">
            El extractor se lanza desde la Edge Function <code className="text-xs">process-dni-jobs</code>{" "}
            (cron cada minuto en Supabase, como los albaranes).
          </p>
        </div>
        {(!batches || batches.length === 0) && (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No hay lotes DNI todavía.
          </p>
        )}
        {batches && batches.length > 0 && <DniBatchesBulkTable rows={rows} />}
      </div>
    </div>
  );
}
