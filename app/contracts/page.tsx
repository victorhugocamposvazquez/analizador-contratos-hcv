import { createClient } from "@/lib/supabase-server";
import BulkUploader from "@/components/BulkUploader";
import ContractsBulkTable, {
  type ContractRow,
} from "@/components/ContractsBulkTable";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim();

  let query = supabase
    .from("contracts")
    .select(
      `
      id, num_albaran, fecha_promocion, nombre, apellido_1, apellido_2, nif, importe_total, marked_duplicate, status, created_at, original_filename, storage_path,
      jobs!contracts_job_id_fkey ( original_filename )
    `
    )
    .in("status", ["auto_saved", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (q) {
    query = query.or(
      [
        `nif.ilike.%${q}%`,
        `num_albaran.ilike.%${q}%`,
        `nombre.ilike.%${q}%`,
        `apellido_1.ilike.%${q}%`,
        `apellido_2.ilike.%${q}%`,
        `original_filename.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data: contracts, error } = await query;

  return (
    <div className="space-y-6">
      <BulkUploader />

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <h2 className="font-medium">Contratos guardados</h2>
          <form className="ml-auto" action="/contracts">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por NIF, albarán, nombre o nombre de foto…"
              className="rounded-lg border px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </form>
        </div>
        {error && <p className="px-5 py-4 text-sm text-red-600">{error.message}</p>}
        {!error && (!contracts || contracts.length === 0) && (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            Aún no hay contratos guardados. Sube fotos arriba para empezar.
          </p>
        )}
        {contracts && contracts.length > 0 && (
          <ContractsBulkTable rows={contracts as ContractRow[]} />
        )}
      </div>
    </div>
  );
}
