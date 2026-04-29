import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/utils";
export type DuplicateGroupItem = {
  id: string;
  filename: string;
  signedUrl: string | null;
  status: string | null;
  marked_duplicate: boolean | null;
  num_albaran: string | null;
  fecha_promocion: string | null;
  nif: string | null;
  iban: string | null;
  importe_total: string | number | null;
};

/**
 * Lista de grupos donde 2+ contratos del lote coinciden entre sí — comparación lado a lado.
 */
export default function BatchDuplicateCompareSection({
  groups,
}: {
  groups: DuplicateGroupItem[][];
}) {
  if (groups.length === 0) return null;

  return (
    <section className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-amber-50/80">
        <h2 className="font-semibold text-amber-950 text-lg">
          Fotos de este lote que coinciden entre sí
        </h2>
        <p className="text-xs text-amber-900/90 mt-1 leading-relaxed max-w-3xl">
          El sistema agrupa fotos de <strong>contratos de venta</strong> por:{" "}
          <strong>mismo número de albarán</strong> (prioritario; ambos con nº leído); si
          en alguna falta el albarán en los datos, usa <strong>mismo NIF + misma fecha de
          promoción</strong>. Comparad las imágenes; si solo es repetición por error
          podéis{" "}
          <Link href="/contracts/review" className="underline font-medium">
            revisar aquí
          </Link>
          {" "}o desde cada ficha.
        </p>
      </div>
      <div className="p-5 space-y-8">
        {groups.map((g, gi) => (
          <div
            key={`g-${gi}-${g[0]?.id ?? gi}`}
            className="rounded-xl border-2 border-amber-200 bg-amber-50/30 overflow-hidden"
          >
            <p className="text-xs font-medium text-amber-900 px-3 py-2 bg-amber-100/80 border-b border-amber-200">
              Grupo {gi + 1}: mismo caso en <strong>{g.length}</strong> foto
              {g.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {g.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col rounded-lg border bg-white shadow-sm overflow-hidden border-amber-200"
                >
                  <div className="aspect-[3/4] bg-slate-100 relative shrink-0 max-h-[220px]">
                    {item.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.signedUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-slate-500 p-2 text-center">
                        Vista previa no disponible
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5 text-xs flex-1 flex flex-col">
                    <p className="font-mono text-[11px] text-slate-800 break-all line-clamp-3" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="text-slate-600">
                      Albarán <span className="font-mono">#{item.num_albaran || "—"}</span>
                      · {formatDate(item.fecha_promocion)}
                    </p>
                    <p className="text-slate-600 font-mono">
                      NIF {item.nif?.trim() || "—"}
                    </p>
                    <p className="text-slate-600 font-mono text-[11px] break-all">
                      IBAN {item.iban?.trim() || "—"}
                    </p>
                    <p className="text-slate-600">
                      Importe{" "}
                      {formatMoney(
                        item.importe_total == null
                          ? null
                          : Number(item.importe_total)
                      )}
                    </p>
                    {item.marked_duplicate && (
                      <span className="inline-block w-fit text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-medium">
                        Marcado repetido
                      </span>
                    )}
                    {item.status === "needs_review" && (
                      <span className="inline-block w-fit text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-medium">
                        Pendiente de revisión
                      </span>
                    )}
                    <Link
                      href={`/contracts/${item.id}`}
                      className="mt-auto pt-2 text-sm font-medium text-slate-900 underline"
                    >
                      Abrir esta ficha
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
