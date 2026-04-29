import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  formatLocalidadDisplayLabel,
  normFromUrlSegment,
  urlSegmentForNormalizedLocality,
} from "@/lib/locality-url";
import ContractsBulkTable, {
  type ContractRow,
} from "@/components/ContractsBulkTable";
import { displayFilenameResolved } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CountAgg = {
  localidad_norm: string;
  localidad_display: string;
  total?: number | string;
};

function rowMatchesQ(c: ContractRow, q: string): boolean {
  const qh = q.toLowerCase().trim();
  if (!qh) return true;
  const haystack = [
    c.nif,
    c.num_albaran,
    c.nombre,
    c.apellido_1,
    c.apellido_2,
    c.original_filename,
    displayFilenameResolved(c),
  ]
    .filter((x): x is string => x != null && String(x).length > 0)
    .join(" ")
    .toLowerCase();
  return haystack.includes(qh);
}

export default async function LocalityContractsPage({
  params,
  searchParams,
}: {
  params: { norm: string };
  searchParams: { q?: string };
}) {
  const supabase = createClient();

  const decoded = normFromUrlSegment(params.norm);
  if (decoded === null) notFound();

  const q = (searchParams.q ?? "").trim();

  const [{ data: rawRows, error: e1 }, { data: aggRows, error: e2 }] =
    await Promise.all([
      supabase.rpc("contracts_by_normalized_locality", {
        p_localidad_norm: decoded,
      }),
      supabase.rpc("contract_counts_by_locality"),
    ]);

  const errMsg = e1?.message ?? e2?.message;
  if (errMsg) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        {errMsg}
      </div>
    );
  }

  let contracts = (rawRows ?? []) as ContractRow[];
  if (q) {
    contracts = contracts.filter((c) => rowMatchesQ(c, q));
  }

  const hitList = ((aggRows ?? []) as CountAgg[]).filter(
    (r) => (r.localidad_norm ?? "") === decoded
  );
  let titleBadge: string;
  if (decoded === "") {
    titleBadge = formatLocalidadDisplayLabel(null);
  } else if (hitList[0]?.localidad_display?.trim()) {
    titleBadge = formatLocalidadDisplayLabel(hitList[0].localidad_display);
  } else {
    titleBadge = formatLocalidadDisplayLabel(decoded);
  }

  const formAction = `/contracts/locality/${urlSegmentForNormalizedLocality(decoded)}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/contracts" className="underline hover:no-underline">
            Contratos
          </Link>{" "}
          /{" "}
          <Link href="/contracts/locality" className="underline hover:no-underline">
            Por localidad
          </Link>{" "}
          / <span className="text-slate-700">{titleBadge}</span>
        </p>
        <h1 className="text-xl font-semibold text-slate-900 mt-2">{titleBadge}</h1>
        <p className="text-xs font-mono text-slate-500 mt-1 break-all">
          Clave normalizada: {decoded === "" ? "(vacía)" : decoded}
        </p>
        <p className="text-sm text-slate-600 mt-2">
          {contracts.length} resultado{contracts.length !== 1 ? "s" : ""}
          {Boolean(q)
            ? " con el texto de filtro aplicado sobre la página."
            : " (hasta 500 contratos cargados desde la función SQL)."}
        </p>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Contratos</h2>
          <form className="ml-auto flex flex-wrap gap-2" action={formAction} method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Filtrar por nombre, NIF, albarán, archivo…"
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
        {contracts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No hay contratos que coincidan{q ? ` con “${q}”` : ""}.
          </p>
        ) : (
          <ContractsBulkTable rows={contracts} />
        )}
      </div>
    </div>
  );
}
