import Link from "next/link";
import DniBulkUploader from "@/components/DniBulkUploader";

export const dynamic = "force-dynamic";

export default function DnisLandingPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/contracts" className="underline hover:no-underline">
              Contratos
            </Link>{" "}
            / DNI/NIE por lotes
          </p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">DNI/NIE por lotes</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Sube fotos del anverso o documento entero en lotes nominados; el proceso en
            segundo plano intenta extraer el <strong>número de soporte</strong> (DNI español /
            NIE). Luego descarga un CSV desde el detalle del lote.
          </p>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 max-w-2xl">
            Datos de identificación personal: usar solo dentro de políticas internas y con
            el consentimiento necesario del titular.
          </p>
        </div>
        <Link
          href="/contracts/dnis/batches"
          className="text-sm border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50 shrink-0"
        >
          Listado de lotes DNI
        </Link>
      </div>
      <DniBulkUploader />
    </div>
  );
}
