"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney, displayFilename } from "@/lib/utils";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";

type Item = {
  contract: any;
  duplicates: any[];
  imageUrl?: string;
};

export default function ReviewClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<any | null>(null);

  const total = items.length;
  const current = items[idx];

  // Sincroniza "working" con el ítem actual
  useEffect(() => {
    if (current) setWorking({ ...current.contract });
  }, [current?.contract.id]);

  function next() {
    if (idx < total - 1) setIdx(idx + 1);
    else router.refresh();
  }

  async function confirmContract(asDup = false) {
    if (!working) return;
    setBusy(true);
    const r = await fetch("/api/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: working.id,
        fields: working,
        status: "confirmed",
        marked_duplicate: asDup,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || "Error al guardar");
      return;
    }
    next();
  }

  async function discard() {
    if (!working) return;
    if (!window.confirm("¿Seguro que quieres descartar este contrato? Se borrará junto con la foto.")) return;
    setBusy(true);
    const r = await fetch("/api/contracts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: working.id }),
    });
    setBusy(false);
    if (!r.ok) {
      alert("Error al descartar");
      return;
    }
    next();
  }

  if (!current) return null;
  if (!working) return null;

  function update(key: string, value: any) {
    setWorking((w: any) => ({ ...w, [key]: value }));
  }

  const dups = current.duplicates;
  const hasDups = dups.length > 0;
  const lowConf =
    current.contract.extraction_confidence != null &&
    current.contract.extraction_confidence < 0.7;

  const fotoNombre = displayFilename(
    current.contract.original_filename,
    current.contract.storage_path
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 bg-slate-50">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Foto original
          </p>
          <p
            className="mt-1 text-sm font-mono text-slate-900 break-all leading-snug"
            title={fotoNombre}
          >
            {fotoNombre}
          </p>
        </div>
        <div className="flex items-center justify-between px-4 py-2 gap-4 flex-wrap">
          <div className="text-sm shrink-0">
            Revisando <strong>{idx + 1}</strong> de <strong>{total}</strong>
          </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIdx(Math.max(0, idx - 1))}
            disabled={idx === 0 || busy}
            className="text-sm px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <button
            onClick={next}
            disabled={busy}
            className="text-sm px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-30"
          >
            Saltar →
          </button>
        </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden grid md:grid-cols-2">
        <div className="bg-slate-100 border-r p-4 flex flex-col items-start gap-2">
          <div className="flex flex-1 w-full items-start justify-center min-h-[200px]">
            {current.imageUrl ? (
              <img
                src={current.imageUrl}
                alt={`Foto original: ${fotoNombre}`}
                className="max-h-[700px] w-auto rounded-md shadow"
              />
            ) : (
              <p className="text-sm text-slate-500">Imagen no disponible</p>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[700px] overflow-y-auto">
          {/* Razones por las que está aquí */}
          <div className="space-y-2">
            {hasDups && (
              <div className="border border-amber-300 bg-amber-50 rounded-xl p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-amber-800">
                  <AlertTriangle size={16} />
                  {dups.length === 1
                    ? "Posible duplicado"
                    : `${dups.length} posibles duplicados`}
                </div>
                <ul className="mt-2 space-y-1 text-amber-900 text-xs">
                  {dups.map((d: any) => (
                    <li key={d.id}>
                      <span className="font-mono">#{d.num_albaran || "—"}</span>{" "}
                      — {formatDate(d.fecha_promocion)} —{" "}
                      {[d.nombre, d.apellido_1, d.apellido_2]
                        .filter(Boolean)
                        .join(" ")}{" "}
                      — NIF {d.nif || "—"} — {formatMoney(d.importe_total)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lowConf && !hasDups && (
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 text-sm text-blue-800">
                Confianza de OCR baja (
                {Math.round((current.contract.extraction_confidence ?? 0) * 100)}%
                ). Revisa los campos antes de confirmar.
              </div>
            )}
            {current.contract.notes && (
              <div className="text-xs text-slate-600">
                Notas del modelo: {current.contract.notes}
              </div>
            )}
          </div>

          <FieldsForm fields={working} onUpdate={update} />

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            <button
              onClick={() => confirmContract(false)}
              disabled={busy}
              className="bg-slate-900 text-white text-sm font-medium rounded-lg px-3 py-2 hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Confirmar y siguiente
            </button>
            {hasDups && (
              <button
                onClick={() => confirmContract(true)}
                disabled={busy}
                className="bg-amber-600 text-white text-sm rounded-lg px-3 py-2 hover:bg-amber-700 disabled:opacity-50"
              >
                Confirmar marcando como duplicado
              </button>
            )}
            <button
              onClick={discard}
              disabled={busy}
              className="border text-sm rounded-lg px-3 py-2 hover:bg-red-50 text-red-600 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={14} /> Descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldsForm({
  fields,
  onUpdate,
}: {
  fields: any;
  onUpdate: (k: string, v: any) => void;
}) {
  function T(label: string, key: string, type: "text" | "date" = "text") {
    return (
      <label className="block">
        <span className="text-xs text-slate-500">{label}</span>
        <input
          type={type}
          value={fields[key] ?? ""}
          onChange={(e) => onUpdate(key, e.target.value || null)}
          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </label>
    );
  }
  function N(label: string, key: string) {
    return (
      <label className="block">
        <span className="text-xs text-slate-500">{label}</span>
        <input
          type="number"
          step="0.01"
          value={fields[key] ?? ""}
          onChange={(e) =>
            onUpdate(key, e.target.value === "" ? null : Number(e.target.value))
          }
          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </label>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {T("Nº albarán", "num_albaran")}
      {T("Fecha promoción", "fecha_promocion", "date")}
      {T("Nombre", "nombre")}
      {T("1er apellido", "apellido_1")}
      {T("2º apellido", "apellido_2")}
      {T("NIF", "nif")}
      {T("Teléfono", "telefono")}
      {T("Localidad", "localidad")}
      {T("Provincia", "provincia")}
      {T("CP", "cod_postal")}
      {T("Banco", "banco")}
      {T("IBAN", "iban")}
      {N("Importe (€)", "importe_total")}
      {N("Nº cuotas", "num_cuotas")}
      {N("Cuota mensual (€)", "cuota_mensual")}
      <label className="block col-span-2">
        <span className="text-xs text-slate-500">Artículos</span>
        <textarea
          rows={3}
          value={fields.articulos ?? ""}
          onChange={(e) => onUpdate("articulos", e.target.value || null)}
          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </label>
    </div>
  );
}
