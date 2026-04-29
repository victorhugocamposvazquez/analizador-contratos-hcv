import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { SIN_LOCALIDAD_SLUG, slugToLocalidadValue } from "@/lib/localidades-url";
import ContractsBulkTable, {
  type ContractRow,
} from "@/components/ContractsBulkTable";

export const dynamic = "force-dynamic";

function bannerTitle(slugSegment: string, localidadResolved: "" | string): string {
  if (slugSegment === SIN_LOCALIDAD_SLUG || localidadResolved === "") {
    return "Sin localidad";
  }
  return localidadResolved.trim() || slugSegment;
}

export default async function LocalidadContratosPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { q?: string };
}) {
  const supabase = createClient();

  const resolved = slugToLocalidadValue(params.slug);
  if (resolved === null) notFound();

  const q = (searchParams.q ?? "").trim();

  let query = supabase
    .from("contracts")
    .select(
      `
      id, num_albaran, fecha_promocion, nombre, apellido_1, apellido_2, nif, localidad, importe_total, marked_duplicate, status, created_at, original_filename, storage_path,
      jobs!contracts_job_id_fkey ( original_filename )
    `
    )
    .in("status", ["auto_saved", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (resolved === "") {
    query = query.or("localidad.is.null,localidad.eq.");
  } else {
    query = query.eq("localidad", resolved.trim());
  }

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

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error.message}
      </div>
    );
  }

  const title = bannerTitle(params.slug, resolved);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/contracts" className="underline hover:no-underline">
            Contratos
          </Link>{" "}
          /{" "}
          <Link href="/contracts/localidades" className="underline hover:no-underline">
            Localidades
          </Link>{" "}
          / <span className="text-slate-700">{title}</span>
        </p>
        <h1 className="text-xl font-semibold text-slate-900 mt-2">{title}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {contracts?.length ?? 0}
          {(contracts?.length ?? 0) >= 500 ? "+" : ""} entradas
          {(contracts?.length ?? 0) >= 500
            ? " (límite 500 por carga — acota con la búsqueda)."
            : " en esta carpeta."}
        </p>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Contratos</h2>
          <form className="ml-auto flex flex-wrap gap-2" action={`/contracts/localidades/${params.slug}`} method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar dentro de esta carpeta…"
              className="rounded-lg border px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Buscar
            </button>
          </form>
        </div>
        {!contracts || contracts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No hay contratos que coincidan con esta carpeta{q ? ` o con “${q}”` : ""}.
          </p>
        ) : (
          <ContractsBulkTable rows={contracts as ContractRow[]} />
        )}
      </div>
    </div>
  );
}
