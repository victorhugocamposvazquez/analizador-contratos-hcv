import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { formatDate, formatMoney } from "@/lib/utils";
import DeleteButton from "@/components/DeleteButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ContractDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!c) return notFound();

  const { data: signed } = await supabase.storage
    .from("contracts")
    .createSignedUrl(c.storage_path, 60 * 60);

  const fullName = [c.nombre, c.apellido_1, c.apellido_2]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/contracts" className="text-sm text-slate-600 hover:underline">
          ← Volver al listado
        </Link>
        <DeleteButton id={c.id} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-2xl p-3">
          {signed?.signedUrl ? (
            <img
              src={signed.signedUrl}
              alt="albaran"
              className="w-full rounded-md"
            />
          ) : (
            <p className="text-sm text-slate-500">No se pudo cargar la imagen.</p>
          )}
        </div>

        <div className="bg-white border rounded-2xl p-5 space-y-3">
          <h1 className="text-xl font-semibold">
            Albarán #{c.num_albaran || "—"}
          </h1>
          {c.marked_duplicate && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-block">
              Marcado como posible duplicado al guardar
            </p>
          )}
          <Field label="Cliente" value={fullName || "—"} />
          <Field label="NIF" value={c.nif} mono />
          <Field label="Fecha promoción" value={formatDate(c.fecha_promocion)} />
          <Field label="Fecha entrega" value={formatDate(c.fecha_entrega)} />
          <Field label="Hora entrega" value={c.hora_entrega} />
          <Field label="Teléfono" value={c.telefono} />
          <Field label="Otros teléfonos" value={c.otros_telefonos} />
          <Field label="Estado civil" value={c.estado_civil} />
          <Field
            label="Dirección"
            value={[c.direccion, c.localidad, c.cod_postal, c.provincia]
              .filter(Boolean)
              .join(", ")}
          />
          <Field label="Banco" value={c.banco} />
          <Field label="IBAN" value={c.iban} mono />
          <div>
            <p className="text-xs text-slate-500">Artículos</p>
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {c.articulos || "—"}
            </pre>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2 border-t">
            <Field label="Importe" value={formatMoney(c.importe_total)} />
            <Field label="Nº cuotas" value={c.num_cuotas} />
            <Field
              label="Cuota mensual"
              value={formatMoney(c.cuota_mensual)}
            />
          </div>
          {c.notes && <Field label="Notas extracción" value={c.notes} />}
          {c.extraction_confidence != null && (
            <Field
              label="Confianza OCR"
              value={`${Math.round(c.extraction_confidence * 100)}%`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: any;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>
        {value || value === 0 ? value : "—"}
      </p>
    </div>
  );
}
