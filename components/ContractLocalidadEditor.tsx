"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = {
  contractId: string;
  initialLocalidad: string | null;
  localityFolderHref: string;
  showFolderHint: boolean;
};

export default function ContractLocalidadEditor({
  contractId,
  initialLocalidad,
  localityFolderHref,
  showFolderHint,
}: Props) {
  const router = useRouter();
  const initialTrim = useMemo(
    () => (typeof initialLocalidad === "string" ? initialLocalidad.trim() : ""),
    [initialLocalidad]
  );
  const [value, setValue] = useState(
    () => (typeof initialLocalidad === "string" ? initialLocalidad : "")
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [discardHint, setDiscardHint] = useState<string | null>(null);

  useEffect(() => {
    setValue(typeof initialLocalidad === "string" ? initialLocalidad : "");
  }, [initialLocalidad]);

  const trimmed = value.trim();
  const dirty = trimmed !== initialTrim;
  const savedHasLocalidad = initialTrim.length > 0;

  async function save() {
    setBusy(true);
    setErr(null);
    setDiscardHint(null);
    const r = await fetch("/api/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: contractId,
        fields: { localidad: trimmed || null },
      }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(typeof j.error === "string" ? j.error : "No se pudo guardar.");
      return;
    }
    if (j.localityDiscarded === true && trimmed.length > 0) {
      setDiscardHint(
        "Este texto parece dirección completa o lugar de entrega, no solo el municipio. No se guarda en «localidad»: quedará sin localidad hasta que escribas el nombre del pueblo o ciudad únicamente."
      );
    } else {
      setDiscardHint(null);
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
      <div>
        <p className="text-xs font-medium text-slate-600">Localidad</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Solo el <strong>municipio</strong> (p. ej. A Coruña), no líneas largas tipo lugar de entrega ni
          dirección. Si pegas esa línea aquí no se guardará como localidad — quedará sin localidad.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ej. Ferrol, A Coruña…"
          className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/20"
          disabled={busy}
          autoComplete="address-level2"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : null}
          Guardar
        </button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {discardHint && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {discardHint}
        </p>
      )}
      {showFolderHint && savedHasLocalidad && (
        <p className="text-sm pt-1 border-t border-slate-200">
          <Link
            href={localityFolderHref}
            className="text-slate-800 underline underline-offset-2 hover:no-underline font-medium"
          >
            Abrir carpeta de esta localidad
          </Link>
          <span className="text-slate-600"> · {initialTrim}</span>
        </p>
      )}
      {showFolderHint && !savedHasLocalidad && (
        <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">
          Escribe el municipio (como en el albarán) y guarda para enlazarlo a la carpeta correspondiente.
        </p>
      )}
    </div>
  );
}
