"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney, displayFilename } from "@/lib/utils";
import { validateSpanishPersonalId } from "@/lib/spanish-id";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

function documentClassLabel(dc: string | null | undefined): string {
  const v = dc ?? "contrato_venta";
  const map: Record<string, string> = {
    contrato_venta: "Contrato de venta",
    documento_otro: "Otro documento",
    captura_app: "Captura app",
    ilegible: "Ilegible / no deducible",
  };
  return map[v] ?? v;
}

function normalizeNifUi(s: unknown): string | null {
  if (s == null || String(s).trim() === "") return null;
  return String(s).toUpperCase().replace(/\s/g, "");
}

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
      alert(j.error || "No se pudo guardar. Prueba otra vez.");
      return;
    }
    next();
  }

  async function discard() {
    if (!working) return;
    if (
      !window.confirm(
        "¿Borrar este albarán? Se eliminarán los datos y la foto de forma definitiva."
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await fetch("/api/contracts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: working.id }),
    });
    setBusy(false);
    if (!r.ok) {
      alert("No se pudo borrar.");
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

  const documentClass = current.contract.document_class ?? "contrato_venta";
  const isNonSale = documentClass !== "contrato_venta";
  const nifNormalized = normalizeNifUi(working.nif);
  const invalidNifUi =
    nifNormalized !== null && validateSpanishPersonalId(nifNormalized).valid === false;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Foto · {documentClassLabel(documentClass)}
          </p>
          <p
            className="text-sm font-mono text-slate-900 truncate"
            title={fotoNombre}
          >
            {fotoNombre}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-sm text-slate-700 tabular-nums">
            Pendiente <strong>{idx + 1}</strong> / <strong>{total}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0 || busy}
              className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={next}
              disabled={busy}
              className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Pasar sin guardar →
            </button>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          <CircleHelp className="text-slate-500 shrink-0" size={18} aria-hidden />
          Qué es «Por revisar» (ayuda)
        </summary>
        <div className="mt-3 space-y-2 text-sm text-slate-700 border-t pt-3">
          <p>
            Aquí aparecen las fotos que el sistema no puede archivar solas: o bien{" "}
            <strong>coinciden con datos que ya teníamos</strong>, o bien la{" "}
            <strong>lectura de la foto no es fiable</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>
              <strong className="text-amber-800">Naranja</strong>: mismo nº de albarán que otro
              archivo (prioritario), o si falta albarán comparable, mismo NIF + misma fecha de
              promoción.
            </li>
            <li>
              <strong className="text-blue-800">Azul</strong>: lectura automática{" "}
              <strong>poco segura</strong>; revisad los campos.
            </li>
            <li>
              <strong className="text-red-800">NIF</strong>: letra de control incorrecta (DNI /
              NIE español); corregid el valor o comprobad el documento.
            </li>
            <li>
              <strong className="text-violet-900">Clasificación</strong>: la IA no considera la
              foto un contrato de venta; podéis borrar o conservar según archivo interno.
            </li>
          </ul>
        </div>
      </details>

      <div className="grid grid-cols-1 xl:grid-cols-2 xl:gap-4 xl:items-start">
        <div className="order-2 xl:order-none xl:sticky xl:top-4 space-y-2">
          <p className="text-xs font-medium text-slate-600">Imagen del albarán</p>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-3 flex justify-center items-start">
            <div className="w-full flex justify-center min-h-[160px]">
              {current.imageUrl ? (
                <img
                  src={current.imageUrl}
                  alt={`Foto original: ${fotoNombre}`}
                  className="max-h-[min(78vh,860px)] w-auto max-w-full rounded-md shadow object-contain"
                />
              ) : (
                <p className="text-sm text-slate-500 self-center">
                  Imagen no disponible
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="order-1 xl:order-none min-w-0 space-y-3 flex flex-col max-h-none xl:max-h-[min(92vh,920px)] xl:overflow-y-auto xl:pr-1">
          {isNonSale && (
            <section className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 shadow-sm">
              <p className="font-semibold text-violet-950 text-sm">
                Esta foto no se clasificó como contrato de venta ({documentClass})
              </p>
              <p className="text-xs text-violet-900 mt-1 leading-snug">
                Los datos debajo pueden estar vacíos; podéis borrarla, archivar como referencia u
                operar desde vuestro criterio.
              </p>
            </section>
          )}
          <div
            className={
              lowConf || invalidNifUi
                ? "grid grid-cols-1 xl:grid-cols-2 gap-3"
                : "space-y-3"
            }
          >
            <section
              className={`rounded-xl border-2 p-3 shadow-sm ${
                hasDups && !isNonSale
                  ? "border-amber-400 bg-amber-50"
                  : "border-emerald-300 bg-emerald-50/80"
              }`}
            >
              <div className="flex gap-2.5 items-start">
                <div className="shrink-0">
                  {hasDups && !isNonSale ? (
                    <Copy
                      className="text-amber-700 w-8 h-8"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  ) : (
                    <ShieldCheck
                      className="text-emerald-700 w-8 h-8"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-slate-900 text-sm leading-snug">
                    {hasDups && !isNonSale
                      ? "Sí: parece el mismo caso que otros ya guardados"
                      : "No: por duplicidad no coincide con otros albarán"}
                  </p>
                  <p className="text-xs text-slate-800 leading-snug">
                    {hasDups && !isNonSale ? (
                      <>
                        Coincidencias ya archivadas debajo; esta foto{" "}
                        <strong>no se archivó sola</strong>.
                      </>
                    ) : (
                      <>
                        Sin duplicado por datos clave (albarán prioritario o NIF+fecha si falta
                        albarán). Si hay aviso azul o rojo, revisad antes de archivar.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </section>

            {lowConf && (
              <section className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
                <div className="flex gap-2 items-start">
                  <AlertTriangle
                    className="text-blue-800 shrink-0 mt-0.5"
                    size={20}
                  />
                  <div>
                    <p className="font-semibold text-blue-950 text-sm">
                      Lectura poco segura (
                      {Math.round(
                        (current.contract.extraction_confidence ?? 0) * 100
                      )}
                      %)
                    </p>
                    <p className="text-xs text-blue-900 mt-1 leading-snug">
                      Comprobad los datos campo a campo antes de guardar.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {invalidNifUi && (
              <section className="rounded-xl border-2 border-red-400 bg-red-50 p-3">
                <div className="flex gap-2 items-start">
                  <AlertTriangle
                    className="text-red-800 shrink-0 mt-0.5"
                    size={20}
                  />
                  <div>
                    <p className="font-semibold text-red-950 text-sm">NIF / NIE no válido</p>
                    <p className="text-xs text-red-900 mt-1 leading-snug">
                      La letra de control no coincide con el número (revisad lectura o documento).
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {hasDups && !isNonSale && (
            <section className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm flex flex-col min-h-0 max-h-[min(38vh,260px)]">
              <h3 className="font-semibold text-amber-950 text-sm flex items-center gap-2 shrink-0">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                Coincidencias en archivo
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5 mb-2 shrink-0">
                Abrid cada ficha en otra pestaña para comparar.
              </p>
              <ul className="space-y-1.5 overflow-y-auto pr-0.5 min-h-0 flex-1">
                {dups.map((d: any) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm border border-amber-100 rounded-lg px-2 py-1.5 bg-amber-50/50"
                  >
                    <span className="font-mono font-medium">
                      #{d.num_albaran || "—"}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span>{formatDate(d.fecha_promocion)}</span>
                    <span className="text-slate-500">·</span>
                    <span>
                      {[d.nombre, d.apellido_1, d.apellido_2]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-[11px]">NIF {d.nif || "—"}</span>
                    <span className="text-slate-500">·</span>
                    <span>{formatMoney(d.importe_total)}</span>
                    <Link
                      href={`/contracts/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 ml-auto text-amber-900 font-medium underline text-xs sm:text-sm"
                    >
                      Abrir <ExternalLink size={13} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            {current.contract.notes && (
              <div className="text-xs text-slate-600 bg-slate-50 border rounded-lg px-3 py-2">
                <span className="font-medium text-slate-700">
                  Comentario del sistema:{" "}
                </span>
                {current.contract.notes}
              </div>
            )}

            <div>
              <h3 className="font-semibold text-slate-900 text-sm mb-2">
                Datos leídos de la foto (podéis corregirlos)
              </h3>
              <FieldsForm
                fields={working}
                onUpdate={update}
                nifInvalid={invalidNifUi}
              />
            </div>

            <section className="pt-3 border-t border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">
                Qué queréis hacer con este albarán
              </h3>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/80">
                  <button
                    type="button"
                    onClick={() => confirmContract(false)}
                    disabled={busy}
                    className="w-full sm:w-auto bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Check size={18} />
                    )}
                    {hasDups
                      ? "Guardar: es un albarán válido (no es copia)"
                      : "Guardar y archivar"}
                  </button>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {hasDups ? (
                      <>
                        Otro contrato distinto o datos ya corregidos sin coincidencia.
                      </>
                    ) : (
                      <>
                        Los datos pasan al listado como archivados.
                      </>
                    )}
                  </p>
                </div>

                {hasDups && (
                  <div className="rounded-xl border border-amber-300 p-3 bg-amber-50/90">
                    <button
                      type="button"
                      onClick={() => confirmContract(true)}
                      disabled={busy}
                      className="w-full sm:w-auto bg-amber-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-amber-800 disabled:opacity-50"
                    >
                      Guardar sabiendo que está repetido
                    </button>
                    <p className="text-xs text-amber-950 mt-2 leading-relaxed">
                      Misma venta que un listado anterior; marcado repetido para control interno.
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-red-100 p-3 bg-red-50/60">
                  <button
                    type="button"
                    onClick={discard}
                    disabled={busy}
                    className="w-full sm:w-auto border-2 border-red-300 bg-white text-red-800 text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-red-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} /> Borrar por completo
                  </button>
                  <p className="text-xs text-red-900/90 mt-2 leading-relaxed">
                    Elimina ficha y foto (error de subida o duplicado que no debe existir).
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 border-t pt-2 leading-snug">
                  <strong>Pasar sin guardar</strong> arriba no archiva cambios ni quita este
                  pendiente.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldsForm({
  fields,
  onUpdate,
  nifInvalid,
}: {
  fields: Record<string, unknown>;
  onUpdate: (k: string, v: unknown) => void;
  nifInvalid?: boolean;
}) {
  function T(label: string, key: string, type: "text" | "date" = "text") {
    const isNif = key === "nif";
    const invalid = isNif && nifInvalid;
    return (
      <label className="block">
        <span className={`text-xs ${invalid ? "text-red-700 font-medium" : "text-slate-500"}`}>
          {label}
        </span>
        <input
          type={type}
          value={String(fields[key] ?? "")}
          onChange={(e) => onUpdate(key, e.target.value || null)}
          className={
            invalid
              ? "mt-0.5 w-full rounded-md border-2 border-red-500 bg-red-50/50 px-2 py-1.5 text-sm text-red-950 focus:outline-none focus:ring-2 focus:ring-red-700"
              : "mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          }
          aria-invalid={invalid || undefined}
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
          value={
            fields[key] == null || fields[key] === ""
              ? ""
              : String(fields[key] as string | number)
          }
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
          value={String(fields.articulos ?? "")}
          onChange={(e) => onUpdate("articulos", e.target.value || null)}
          className="mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </label>
    </div>
  );
}
