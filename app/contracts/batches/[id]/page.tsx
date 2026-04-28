import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import BatchAutoRefresh from "@/components/BatchAutoRefresh";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BatchDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!batch) return notFound();

  const { data: statsData } = await supabase.rpc("batch_stats", {
    p_batch_id: batch.id,
  });
  const s = statsData?.[0] ?? {
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    needs_review: 0,
    auto_saved: 0,
  };

  const { data: failedJobs } = await supabase
    .from("jobs")
    .select("id, original_filename, last_error, attempts")
    .eq("batch_id", batch.id)
    .eq("status", "failed")
    .limit(50);

  const inProgress = s.pending + s.processing > 0;
  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {inProgress && <BatchAutoRefresh />}

      <div className="flex items-center justify-between">
        <Link
          href="/contracts/batches"
          className="text-sm text-slate-600 hover:underline"
        >
          ← Lotes
        </Link>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
        <div>
          <h1 className="text-xl font-semibold">{batch.name}</h1>
          <p className="text-xs text-slate-500">
            Creado {formatDate(batch.created_at)}
          </p>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Stat label="Total" value={s.total} />
          <Stat
            label="En cola"
            value={s.pending + s.processing}
            color={inProgress ? "amber" : undefined}
          />
          <Stat label="Auto-guardados" value={s.auto_saved} color="emerald" />
          <Stat label="Por revisar" value={s.needs_review} color="blue" />
          <Stat label="Fallidos" value={s.failed} color={s.failed > 0 ? "red" : undefined} />
        </div>
        {inProgress && (
          <p className="text-xs text-slate-500">
            Procesando en background (~5–8 fotos por minuto). Esta página se
            actualiza sola. Puedes cerrar la pestaña.
          </p>
        )}
        {!inProgress && s.needs_review > 0 && (
          <Link
            href="/contracts/review"
            className="inline-block bg-slate-900 text-white text-sm rounded-lg px-3 py-2 hover:bg-slate-800"
          >
            Revisar {s.needs_review} pendiente{s.needs_review !== 1 && "s"} →
          </Link>
        )}
      </div>

      {failedJobs && failedJobs.length > 0 && (
        <div className="bg-white border rounded-2xl shadow-sm">
          <div className="px-5 py-4 border-b">
            <h2 className="font-medium text-red-700">
              Fallidos ({failedJobs.length})
            </h2>
            <p className="text-xs text-slate-500">
              Tras varios intentos. Puedes borrar el job y resubir el archivo
              manualmente.
            </p>
          </div>
          <ul className="divide-y text-sm">
            {failedJobs.map((j) => (
              <li key={j.id} className="px-5 py-2">
                <div className="font-mono text-xs text-slate-600">
                  {j.original_filename}
                </div>
                <div className="text-xs text-red-600">{j.last_error}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "amber" | "emerald" | "blue" | "red";
}) {
  const cmap = {
    amber: "text-amber-700 bg-amber-50",
    emerald: "text-emerald-700 bg-emerald-50",
    blue: "text-blue-700 bg-blue-50",
    red: "text-red-700 bg-red-50",
  };
  return (
    <div
      className={`rounded-xl px-3 py-2 ${color ? cmap[color] : "bg-slate-50 text-slate-700"}`}
    >
      <div className="text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
