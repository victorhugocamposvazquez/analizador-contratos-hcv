import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  SIN_LOCALIDAD_SLUG,
  localidadToSlug,
} from "@/lib/localidades-url";
import { FolderOpen } from "lucide-react";

export const dynamic = "force-dynamic";

function labelForLocalidad(raw: string): string {
  const t = raw?.trim();
  if (!t) return "Sin localidad";
  return t;
}

export default async function LocalidadesPage() {
  const supabase = createClient();

  const { data: rows, error } = await supabase.rpc("contract_counts_by_locality");

  const list =
    (rows ?? []) as { localidad: string | null; total: number | string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/contracts" className="underline hover:no-underline">
              Contratos
            </Link>{" "}
            / Localidades
          </p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            Contratos por localidad
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Cada carpeta agrupa los contratos ya archivados o confirmados cuyo campo localidad coincide
            (tras quitar espacios). Fotos clasificadas como no venta no aparecen aquí.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No se pudo cargar el listado ({error.message}). Si acabas de añadir el proyecto, ejecuta la
          migración <code className="text-xs bg-amber-100 px-1 rounded">011_contract_counts_by_locality.sql</code>{" "}
          en Supabase SQL.
        </div>
      )}

      {!error && list.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm px-8 py-12 text-center text-slate-600 text-sm">
          Aún no hay contratos agrupados. Cuando guardas fichas con campo localidad informado, aparecerán
          aquí.
        </div>
      )}

      {!error && list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((row) => {
            const key = row.localidad?.trim() ?? "";
            const slug =
              key === "" ? SIN_LOCALIDAD_SLUG : localidadToSlug(key);
            const label = labelForLocalidad(key);
            const total = Number(row.total);
            return (
              <Link
                key={`${slug}-${label}`}
                href={`/contracts/localidades/${slug}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-900/20 hover:bg-slate-50/80 transition-colors"
              >
                <FolderOpen
                  className="shrink-0 text-slate-500 group-hover:text-slate-800 mt-0.5"
                  size={22}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate" title={label}>
                    {label}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
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
