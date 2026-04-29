import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  normFromUrlSegment,
  urlSegmentForNormalizedLocality,
  formatLocalidadDisplayLabel,
} from "@/lib/locality-url";
import BulkUploader from "@/components/BulkUploader";
import ContractsBulkTable, {
  type ContractRow,
} from "@/components/ContractsBulkTable";

export const dynamic = "force-dynamic";

type CountAgg = {
  localidad_norm: string;
  localidad_display: string;
};

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: { q?: string; batch?: string; loc?: string };
}) {
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim();
  const batchId = (searchParams.batch ?? "").trim();
  const batchUuid =
    batchId.length === 36 && /^[0-9a-f-]{36}$/i.test(batchId)
      ? batchId
      : null;

  const locParam = searchParams.loc;
  const decodedLoc =
    locParam === undefined || locParam === ""
      ? undefined
      : normFromUrlSegment(locParam);
  const invalidLocSegment = Boolean(locParam && decodedLoc === null);

  const localidadNormForRpc =
    locParam === undefined || locParam === "" ? null : decodedLoc ?? null;

  const [{ data: batchesForFilter }, localityOptsRes] = await Promise.all([
    supabase
      .from("batches")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.rpc("contract_counts_by_locality"),
  ]);

  const localityOpts = (
    localityOptsRes.data && localityOptsRes.error === null
      ? (localityOptsRes.data as CountAgg[])
      : []
  ).filter((row) => (row.localidad_norm ?? "").length > 0);

  let contractsErrorMsg: string | null = localityOptsRes.error?.message ?? null;

  const { data: rawContracts, error: rpcErr } = invalidLocSegment
    ? { data: [], error: null }
    : await supabase.rpc("contracts_saved_list_filtered", {
        p_batch_id: batchUuid,
        p_localidad_norm: localidadNormForRpc,
        p_search: q || null,
        p_limit: 500,
      });

  if (rpcErr) contractsErrorMsg = contractsErrorMsg ?? rpcErr.message;
  const contractsFlat = rawContracts ?? [];

  const batchIdsShown = Array.from(
    new Set(
      contractsFlat.map((r: { batch_id?: string | null }) => r.batch_id).filter(Boolean)
    )
  ) as string[];

  const { data: batchNamesExtra } =
    batchIdsShown.length > 0
      ? await supabase.from("batches").select("id, name").in("id", batchIdsShown)
      : { data: [] as { id: string; name: string | null }[] };

  const batchNameById = new Map<string, string | null>(
    [...(batchNamesExtra ?? []).map((b) => [b.id, b.name] as const)]
  );

  const jobIds = Array.from(
    new Set(
      contractsFlat
        .map((r: { job_id?: string | null }) => r.job_id)
        .filter(Boolean)
    )
  ) as string[];

  const { data: jobRows } =
    jobIds.length > 0
      ? await supabase.from("jobs").select("id, original_filename").in("id", jobIds)
      : { data: [] as { id: string; original_filename: string | null }[] };

  const jobsById = new Map((jobRows ?? []).map((j) => [j.id, j] as const));

  const merged: ContractRow[] = (contractsFlat as ContractRow[]).map((row) => {
    const jid = row.job_id as string | undefined;
    const jb = jid ? jobsById.get(jid)?.original_filename : null;
    const embed =
      jb != null ? [{ original_filename: jb }] : row.jobs ? row.jobs : undefined;
    const bid = (row as { batch_id?: string | null }).batch_id;
    const batchLabel = bid
      ? batchNameById.get(bid)?.trim() || bid.slice(0, 8)
      : undefined;
    return {
      ...row,
      jobs: embed,
      batch_label: batchLabel,
    };
  });

  const error = contractsErrorMsg;

  return (
    <div className="space-y-6">
      <BulkUploader />

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Contratos guardados</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/contracts/locality"
              className="text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              Por localidad
            </Link>
            <form
              className="flex flex-wrap gap-2 items-end"
              action="/contracts"
              method="get"
            >
              <div className="flex flex-col gap-0.5">
                <label htmlFor="f-batch" className="text-[11px] text-slate-500">
                  Lote
                </label>
                <select
                  id="f-batch"
                  name="batch"
                  defaultValue={batchUuid ?? ""}
                  className="rounded-lg border px-2 py-1.5 text-sm min-w-[10rem] bg-white"
                >
                  <option value="">Todos los lotes</option>
                  {(batchesForFilter ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {(b.name as string)?.trim() || b.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label htmlFor="f-loc" className="text-[11px] text-slate-500">
                  Localidad
                </label>
                <select
                  id="f-loc"
                  name="loc"
                  defaultValue={locParam ?? ""}
                  className="rounded-lg border px-2 py-1.5 text-sm min-w-[11rem] bg-white"
                >
                  <option value="">Todas</option>
                  <option value={urlSegmentForNormalizedLocality("")}>
                    Sin localidad
                  </option>
                  {localityOpts.map((row) => {
                    const nn = row.localidad_norm ?? "";
                    const seg = urlSegmentForNormalizedLocality(nn);
                    const label =
                      nn === ""
                        ? "Sin localidad"
                        : formatLocalidadDisplayLabel(
                            row.localidad_display?.trim()
                              ? row.localidad_display
                              : nn
                          );
                    return (
                      <option key={`${nn}:${seg}`} value={seg}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label htmlFor="f-q" className="text-[11px] text-slate-500">
                  Buscar
                </label>
                <input
                  id="f-q"
                  name="q"
                  defaultValue={q}
                  placeholder="NIF, albarán, nombre, archivo…"
                  className="rounded-lg border px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border px-3 py-1.5 text-sm bg-slate-900 text-white hover:bg-slate-800"
              >
                Aplicar
              </button>
            </form>
          </div>
        </div>
        {error && <p className="px-5 py-4 text-sm text-red-600">{error}</p>}
        {!error && (!merged || merged.length === 0) && (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No hay contratos que coincidan con los filtros. Prueba a quitar lote o
            localidad, o sube fotos arriba.
          </p>
        )}
        {merged && merged.length > 0 && <ContractsBulkTable rows={merged} />}
      </div>
    </div>
  );
}
