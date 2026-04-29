import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  formatLocalidadDisplayLabel,
  urlSegmentForNormalizedLocality,
} from "@/lib/locality-url";
import { FolderOpen } from "lucide-react";

export const dynamic = "force-dynamic";

type CountRow = {
  localidad_norm: string;
  localidad_display: string;
  total: number | string;
};

export default async function LocalidadIndexPage() {
  const supabase = createClient();

  const { data: rows, error } =
    await supabase.rpc("contract_counts_by_locality");

  const list = (rows ?? []) as CountRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/contracts" className="underline hover:no-underline">
              Contratos
            </Link>{" "}
            / Por localidad
          </p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            Contratos por localidad
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Las carpetas agrupan por localidad <strong>normalizada</strong> (misma ciudad aunque
            varíe mayúsculas, acentos o artículos). Solo cuentas <strong>archivadas o confirmadas</strong>.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No se pudo cargar el listado ({error.message}). Ejecuta en Supabase la migración{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">
            012_normalize_locality.sql
          </code>{" "}
          (extensión <code className="text-xs">unaccent</code> incluida).
        </div>
      )}

      {!error && list.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm px-8 py-12 text-center text-slate-600 text-sm">
          Aún no hay contratos agrupados por localidad.
        </div>
      )}

      {!error && list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((row) => {
            const nn = row.localidad_norm ?? "";
            const hrefSeg = urlSegmentForNormalizedLocality(nn);
            const displayed =
              nn === ""
                ? formatLocalidadDisplayLabel(null)
                : formatLocalidadDisplayLabel(
                    row.localidad_display?.trim() ? row.localidad_display : row.localidad_norm
                  );
            const total = Number(row.total);
            return (
              <Link
                key={`${hrefSeg}:${nn}`}
                href={`/contracts/locality/${hrefSeg}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-900/20 hover:bg-slate-50/80 transition-colors"
              >
                <FolderOpen
                  className="shrink-0 text-slate-500 group-hover:text-slate-800 mt-0.5"
                  size={22}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate" title={displayed}>
                    {displayed}
                  </p>
                  <p className="text-xs text-slate-400 truncate font-mono mt-0.5" title={nn}>
                    {nn === "" ? "(clave vacía)" : nn}
                  </p>
                  <p className="text-sm text-slate-500 mt-1 tabular-nums">
                    {total} contrato{total !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
