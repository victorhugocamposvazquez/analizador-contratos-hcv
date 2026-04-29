"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney, displayFilename } from "@/lib/utils";
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

  return (
    <div className="space-y-5">
      {/* Guía fija: lenguaje claro para quien no sea técnico */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
        aria-label="Instrucciones"
      >
        <div className="flex gap-2 items-start">
          <CircleHelp
            className="text-slate-500 shrink-0 mt-0.5"
            size={20}
            aria-hidden
          />
          <div className="space-y-2 text-sm text-slate-700">
            <h2 className="font-semibold text-slate-900 text-base">
              Qué es «Por revisar»
            </h2>
            <p>
              Aquí aparecen las fotos que el sistema no puede archivar solas: o
              bien <strong>coinciden con datos que ya teníamos</strong>, o bien
              la <strong>lectura de la foto no es fiable</strong> y conviene
              que alguien lo mire.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>
                <strong className="text-amber-800">Naranja</strong>: hay{" "}
                <strong>otro albarán guardado</strong> con el mismo NIF y fecha,
                o el mismo número de albarán. No es un fallo: es para que
                decidáis si es copia o es distinto.
              </li>
              <li>
                <strong className="text-blue-800">Azul</strong>: no se ha
                detectado duplicado, pero la lectura automática{" "}
                <strong>no está segura</strong>. Revisad y corregid los campos
                si hace falta.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 bg-slate-50">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Foto que estás revisando
          </p>
          <p
            className="mt-1 text-sm font-mono text-slate-900 break-all leading-snug"
            title={fotoNombre}
          >
            {fotoNombre}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <p className="text-sm text-slate-700">
            Pendiente <strong>{idx + 1}</strong> de <strong>{total}</strong>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0 || busy}
              className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={next}
              disabled={busy}
              className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Pasar sin guardar →
            </button>
          </div>
        </div>
      </div>

      {/* Estado de ESTE caso: duplicado o no */}
      <section
        className={`rounded-2xl border-2 p-4 sm:p-5 shadow-sm ${
          hasDups
            ? "border-amber-400 bg-amber-50"
            : "border-emerald-300 bg-emerald-50/80"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="shrink-0">
            {hasDups ? (
              <Copy className="text-amber-700 w-10 h-10" strokeWidth={1.75} aria-hidden />
            ) : (
              <ShieldCheck className="text-emerald-700 w-10 h-10" strokeWidth={1.75} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-lg font-semibold text-slate-900">
              {hasDups
                ? "Sí: parece el mismo caso que otros ya guardados"
                : "No: por duplicidad no coincide con otros albarán"}
            </p>
            <p className="text-sm text-slate-800 leading-snug">
              {hasDups ? (
                <>
                  Debajo aparecen <strong>los albarán que ya estaban archivados</strong>{" "}
                  y que coinciden (mismo cliente y fecha de promoción, o mismo número
                  de albarán). <strong>Esta foto nueva no se ha archivado sola</strong>{" "}
                  para que decidáis si es una copia o un caso distinto.
                </>
              ) : (
                <>
                  No hemos encontrado otro albarán guardado con los mismos datos
                  clave. Si estáis viendo este aviso, es porque la{" "}
                  <strong>lectura automática de la foto no iba lo bastante segura</strong>{" "}
                  (ver recuadro azul si aparece).
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {lowConf && (
        <section className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 sm:p-5">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="text-blue-800 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-semibold text-blue-950">
                Lectura automática poco segura (
                {Math.round((current.contract.extraction_confidence ?? 0) * 100)}%)
              </p>
              <p className="text-sm text-blue-900 mt-1 leading-snug">
                Comprobad letra por letra los datos de abajo. Corregid lo que no
                cuadre antes de guardar.
              </p>
            </div>
          </div>
        </section>
      )}

      {hasDups && (
        <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-amber-950 text-base flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            Albaranes que ya teníamos (coincidencia)
          </h3>
          <p className="text-xs text-slate-600 mt-1 mb-3">
            Podéis abrir cada uno en otra pestaña para comparar con la foto de la
            izquierda.
          </p>
          <ul className="space-y-2">
            {dups.map((d: any) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm border border-amber-100 rounded-lg px-3 py-2 bg-amber-50/50"
              >
                <span className="font-mono font-medium">#{d.num_albaran || "—"}</span>
                <span className="text-slate-500">·</span>
                <span>{formatDate(d.fecha_promocion)}</span>
                <span className="text-slate-500">·</span>
                <span>
                  {[d.nombre, d.apellido_1, d.apellido_2].filter(Boolean).join(" ") ||
                    "—"}
                </span>
                <span className="text-slate-500">·</span>
                <span className="font-mono text-xs">NIF {d.nif || "—"}</span>
                <span className="text-slate-500">·</span>
                <span>{formatMoney(d.importe_total)}</span>
                <Link
                  href={`/contracts/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 ml-auto text-amber-900 font-medium underline text-sm"
                >
                  Abrir ficha <ExternalLink size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden grid md:grid-cols-2">
        <div className="bg-slate-100 border-r p-4 flex flex-col items-start gap-2">
          <p className="text-xs font-medium text-slate-600 w-full">
            Imagen del albarán
          </p>
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
          {current.contract.notes && (
            <div className="text-xs text-slate-600 bg-slate-50 border rounded-lg px-3 py-2">
              <span className="font-medium text-slate-700">Comentario del sistema: </span>
              {current.contract.notes}
            </div>
          )}

          <div>
            <h3 className="font-semibold text-slate-900 text-sm mb-2">
              Datos leídos de la foto (podéis corregirlos)
            </h3>
            <FieldsForm fields={working} onUpdate={update} />
          </div>

          <section className="pt-2 border-t border-slate-200">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">
              Qué queréis hacer con este albarán
            </h3>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3 sm:p-4 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => confirmContract(false)}
                  disabled={busy}
                  className="w-full sm:w-auto bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-3 hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
                      Usad esto si, tras comparar, <strong>esta foto es de otro
                      contrato distinto</strong> aunque los datos se parezcan, o
                      los habéis corregido abajo y ya no coinciden.
                    </>
                  ) : (
                    <>
                      Los datos pasan al listado principal como albarán archivado
                      correctamente.
                    </>
                  )}
                </p>
              </div>

              {hasDups && (
                <div className="rounded-xl border border-amber-300 p-3 sm:p-4 bg-amber-50/90">
                  <button
                    type="button"
                    onClick={() => confirmContract(true)}
                    disabled={busy}
                    className="w-full sm:w-auto bg-amber-700 text-white text-sm font-semibold rounded-lg px-4 py-3 hover:bg-amber-800 disabled:opacity-50"
                  >
                    Guardar sabiendo que está repetido
                  </button>
                  <p className="text-xs text-amber-950 mt-2 leading-relaxed">
                    Usad esto si <strong>esta foto es la misma venta / el mismo
                    papel</strong> que uno de los de arriba y queréis dejar constancia
                    de que era duplicado. Sigue apareciendo en el listado, marcado como
                    repetido para control interno.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-red-100 p-3 sm:p-4 bg-red-50/60">
                <button
                  type="button"
                  onClick={discard}
                  disabled={busy}
                  className="w-full sm:w-auto border-2 border-red-300 bg-white text-red-800 text-sm font-semibold rounded-lg px-4 py-3 hover:bg-red-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Borrar por completo
                </button>
                <p className="text-xs text-red-900/90 mt-2 leading-relaxed">
                  Elimina esta ficha y la foto del albarán (por ejemplo foto
                  erronea o duplicado que no debe existir).
                </p>
              </div>

              <p className="text-xs text-slate-500 border-t pt-3">
                <strong>Pasar sin guardar:</strong> el botón de arriba no guarda cambios ni
                quita este caso de pendientes — seguirá apareciendo aquí hasta que
                alguien elija Guardar o Borrar.
              </p>
            </div>
          </section>
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
