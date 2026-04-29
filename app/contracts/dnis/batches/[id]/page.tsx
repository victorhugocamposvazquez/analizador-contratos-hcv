import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";
import DniBatchRenameForm from "@/components/DniBatchRenameForm";
import DniBatchLiveRefresh from "@/components/DniBatchLiveRefresh";

export const dynamic = "force-dynamic";

type ExRow = {
  numero_documento: string | null;
  nif_valid: boolean | null;
  extraction_confidence: number | null;
  status: string;
  notes: string | null;
};

export default async function DniBatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: batch } = await supabase
    .from("dni_batches")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!batch) notFound();

  const { data: statsRows } = await supabase.rpc("dni_batch_stats", {
    p_batch_id: batch.id,
  });
  const s = statsRows?.[0] ?? {
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    needs_review: 0,
  };

  const { data: jobs } = await supabase
    .from("dni_jobs")
    .select("id, original_filename, storage_path, status, last_error, created_at")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });

  const jid = (jobs ?? []).map((j) => j.id);
  const { data: extras } =
    jid.length > 0
      ? await supabase.from("dni_extractions").select("*").in("dni_job_id", jid)
      : { data: [] };

  const byJob = new Map((extras ?? []).map((e) => [e.dni_job_id, e]));

  const pct = s.total > 0 ? Math.round(((s.done + s.failed) / s.total) * 100) : 0;
  const inProgress = s.pending + s.processing > 0;

  return (
    <div className="space-y-4">
      <DniBatchLiveRefresh active={inProgress} />

      <div className="flex flex-wrap gap-4 justify-between">
        <Link
          href="/contracts/dnis/batches"
          className="text-sm text-slate-600 hover:underline"
        >
          ← Lotes DNI
        </Link>
        <a
          href={`/api/dni-batches/${batch.id}/export`}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
        >
          Descargar CSV
        </a>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <p className="text-xs font-mono text-slate-400 break-all">{batch.id}</p>
          <h1 className="text-xl font-semibold mt-2">
            {(batch.name as string)?.trim() || `Lote ${String(batch.id).slice(0, 8)}…`}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Creado {formatDate(batch.created_at)}</p>
        </div>
        <DniBatchRenameForm
          batchId={batch.id}
          initialName={(batch.name as string | null) ?? null}
        />
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Stat label="Total" value={s.total} />
          <Stat label="En cola" value={s.pending + s.processing} highlight={inProgress} />
          <Stat label="Hechos" value={s.done} ok />
          <Stat label="Por revisar" value={s.needs_review} warn={s.needs_review > 0} />
          <Stat label="Fallidos" value={s.failed} bad={s.failed > 0} />
        </div>
        {inProgress && (
          <p className="text-xs text-slate-500">
            Importación en proceso (refresco automático cada pocos segundos). Cron: función{" "}
            <code className="text-xs">process-dni-jobs</code>.
          </p>
        )}
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b font-medium text-slate-900">Extracciones</div>
        <div className="overflow-x-auto max-h-[min(520px,60vh)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Archivo</th>
                <th className="text-left px-4 py-2 font-medium">Nº documento</th>
                <th className="text-left px-4 py-2 font-medium">Módulo 23</th>
                <th className="text-right px-4 py-2 font-medium">Conf.</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => {
                const ex = byJob.get(j.id) as ExRow | undefined;
                const nf = typeof j.original_filename === "string" ? j.original_filename : j.storage_path;
                return (
                  <tr key={j.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs max-w-[14rem] break-all">
                      {nf}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {ex?.numero_documento ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {ex?.nif_valid === true ? (
                        <span className="text-emerald-700">ok</span>
                      ) : ex?.nif_valid === false ? (
                        <span className="text-amber-800">no</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {ex?.extraction_confidence != null
                        ? `${Math.round(Number(ex.extraction_confidence) * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="text-slate-700">{ex?.status ?? j.status}</span>
                      {(ex?.notes || j.last_error) && (
                        <span className="block text-slate-500 truncate max-w-xs" title={[ex?.notes, j.last_error].filter(Boolean).join(" · ") || ""}>
                          {[ex?.notes, j.last_error].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  ok,
  warn,
  bad,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  ok?: boolean;
  warn?: boolean;
  bad?: boolean;
}) {
  let color = "text-slate-900";
  if (bad) color = "text-red-700 font-semibold";
  else if (warn) color = "text-amber-800 font-medium";
  else if (ok) color = "text-emerald-800";
  else if (highlight) color = "text-amber-800";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
