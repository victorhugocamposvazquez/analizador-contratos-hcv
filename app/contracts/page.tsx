import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import BulkUploader from "@/components/BulkUploader";

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
      "id, num_albaran, fecha_promocion, nombre, apellido_1, apellido_2, nif, importe_total, marked_duplicate, status, created_at"
    )
    .in("status", ["auto_saved", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (q) {
    query = query.or(
      `nif.ilike.%${q}%,num_albaran.ilike.%${q}%,nombre.ilike.%${q}%,apellido_1.ilike.%${q}%,apellido_2.ilike.%${q}%`
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
              placeholder="Buscar por NIF, albarán o nombre…"
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Albarán</th>
                  <th className="text-left px-4 py-2 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">NIF</th>
                  <th className="text-right px-4 py-2 font-medium">Importe</th>
                  <th className="text-left px-4 py-2 font-medium">Subido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const fullName = [c.nombre, c.apellido_1, c.apellido_2]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={c.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono">
                        {c.num_albaran || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {formatDate(c.fecha_promocion)}
                      </td>
                      <td className="px-4 py-2">{fullName || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {c.nif || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatMoney(c.importe_total)}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {c.marked_duplicate && (
                          <span
                            title="Marcado como posible duplicado"
                            className="inline-flex items-center gap-1 text-amber-700 text-xs mr-2"
                          >
                            <AlertTriangle size={14} /> dup
                          </span>
                        )}
                        <Link
                          href={`/contracts/${c.id}`}
                          className="text-slate-700 hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
