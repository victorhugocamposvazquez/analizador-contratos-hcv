import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, displayFilename } from "@/lib/utils";
import {
  clusterContractIds,
  summarizeBatchDuplicates,
} from "@/lib/batch-duplicate-clusters";
import BatchDuplicateCompareSection, {
  type DuplicateGroupItem,
} from "@/components/BatchDuplicateCompareSection";
import BatchRenameForm from "@/components/BatchRenameForm";

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

  const { data: batchContractsRaw } = await supabase
    .from("contracts")
    .select(
      "id, nif, fecha_promocion, num_albaran, iban, importe_total, original_filename, storage_path, status, marked_duplicate, document_class"
    )
    .eq("batch_id", batch.id);

  const batchContracts = batchContractsRaw ?? [];
  const clusters = clusterContractIds(batchContracts);
  const dupSummary = summarizeBatchDuplicates(batchContracts, clusters);

  const byContractId = new Map(batchContracts.map((c) => [c.id, c]));
  const multiClusters = clusters.filter((g) => g.length >= 2);

  let compareGroups: DuplicateGroupItem[][] = [];
  if (multiClusters.length > 0) {
    compareGroups = await Promise.all(
      multiClusters.map((ids) =>
        Promise.all(
          ids.map(async (id): Promise<DuplicateGroupItem> => {
            const c = byContractId.get(id)!;
            const { data: sig } = await supabase.storage
              .from("contracts")
              .createSignedUrl(c.storage_path, 3600);
            return {
              id: c.id,
              filename: displayFilename(c.original_filename, c.storage_path),
              signedUrl: sig?.signedUrl ?? null,
              status: c.status,
              marked_duplicate: c.marked_duplicate ?? null,
              num_albaran: c.num_albaran,
              fecha_promocion: c.fecha_promocion,
              nif: c.nif,
              iban: c.iban,
              importe_total: c.importe_total,
            };
          })
        )
      )
    );
  }

  const inProgress = s.pending + s.processing > 0;
  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link
          href="/contracts/batches"
          className="text-sm text-slate-600 hover:underline"
        >
          ← Lotes
        </Link>
        <Link
          href={`/contracts?batch=${encodeURIComponent(params.id)}`}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 hover:bg-slate-50"
        >
          Contratos de este lote
        </Link>
      </div>

        <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {(batch.name as string)?.trim() || `Lote ${batch.id.slice(0, 8)}…`}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Creado {formatDate(batch.created_at)}
            </p>
            <p className="text-xs font-mono text-slate-400 mt-2 break-all">{batch.id}</p>
          </div>
          <BatchRenameForm
            batchId={batch.id}
            initialName={(batch.name as string | null) ?? null}
          />
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

      {/* Resumen informativo: duplicidad dentro del lote vs revisión */}
      <div className="bg-white border rounded-2xl shadow-sm p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900 text-lg">
            Contratos extraídos de este lote
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
            Calculado solo entre las <strong>fotos ya procesadas</strong> de tipo{" "}
            <strong>contrato de venta</strong> en este lote: mismo nº de albarán (prioritario
            cuando ambos tienen nº leído); si falta comparar por albarán, mismo NIF + misma fecha
            de promoción — alineado con la base de datos.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
              Sin repetir dentro del lote
            </p>
            <p className="text-3xl font-bold text-emerald-950 mt-1 tabular-nums">
              {dupSummary.sinDuplicarEnLote}
            </p>
            <p className="text-xs text-emerald-900/85 mt-2 leading-snug">
              Contratos cuya foto{" "}
              <strong>no se parece a ninguna otra</strong> de este mismo envío por
              datos detectados (nº albarán o, sin albarán, NIF + fecha).
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              Con coincidencias entre sí
            </p>
            <p className="text-3xl font-bold text-amber-950 mt-1 tabular-nums">
              {dupSummary.contratosEnGrupoDuplicado}
            </p>
            <p className="text-xs text-amber-900/85 mt-2 leading-snug">
              Contratos agrupados en{" "}
              <strong>{dupSummary.gruposDuplicados} grupo{dupSummary.gruposDuplicados !== 1 ? "s" : ""}</strong> donde
              al menos <strong>dos fotos siguen pareciendo el mismo caso</strong>. Comparadlas
              más abajo.
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-900">
              Por revisar a mano
            </p>
            <p className="text-3xl font-bold text-blue-950 mt-1 tabular-nums">
              {dupSummary.porRevisar}
            </p>
            <p className="text-xs text-blue-900/85 mt-2 leading-snug">
              Pendientes en la lista &quot;
              <Link href="/contracts/review" className="underline font-medium">
                Por revisar
              </Link>
              &quot;: duplicidad posible fuera del lote <strong>o</strong> foto leída con
              poca seguridad.
            </p>
          </div>
        </div>
      </div>

      <BatchDuplicateCompareSection groups={compareGroups} />

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
