import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import BatchAutoRefresh from "@/components/BatchAutoRefresh";
import { formatDate, displayFilename } from "@/lib/utils";

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

  const { data: batchJobs } = await supabase
    .from("jobs")
    .select(
      "id, original_filename, storage_path, status, contract_id, last_error"
    )
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true })
    .limit(2000);

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

      {batchJobs && batchJobs.length > 0 && (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-medium">Archivos del lote</h2>
            <p className="text-xs text-slate-500">
              Nombre original de cada foto y su estado de procesamiento.
            </p>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    Archivo original
                  </th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">
                    Estado
                  </th>
                  <th className="text-left px-4 py-2 font-medium min-w-[8rem]">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {batchJobs.map((j) => {
                  const name = displayFilename(
                    j.original_filename,
                    j.storage_path
                  );
                  return (
                    <tr key={j.id} className="border-t hover:bg-slate-50 align-top">
                      <td className="px-4 py-2 text-xs font-mono break-all max-w-md">
                        {name}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <JobStatusBadge status={j.status} />
                        {j.status === "failed" && j.last_error && (
                          <p className="text-xs text-red-600 mt-1 max-w-sm break-words">
                            {j.last_error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs">
                        {j.status === "done" && j.contract_id != null && (
                          <Link
                            href={`/contracts/${String(j.contract_id)}`}
                            className="text-slate-700 hover:underline"
                          >
                            Ver contrato →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; className: string }
  > = {
    pending: { label: "En cola", className: "bg-amber-100 text-amber-900" },
    processing: { label: "Procesando", className: "bg-violet-100 text-violet-900" },
    done: { label: "Extraído", className: "bg-emerald-100 text-emerald-900" },
    failed: { label: "Fallido", className: "bg-red-100 text-red-900" },
  };
  const m = map[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-800",
  };
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${m.className}`}
    >
      {m.label}
    </span>
  );
}
