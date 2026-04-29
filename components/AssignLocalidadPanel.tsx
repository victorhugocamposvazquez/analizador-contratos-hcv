"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle } from "lucide-react";
import type { ContractRow } from "@/components/ContractsBulkTable";
import { displayFilenameResolved } from "@/lib/utils";

type Props = {
  /** Clave normalize_localidad de la carpeta actual */
  targetNorm: string;
  /** Sugerencia (variante más frecuente en esta carpeta) */
  defaultLocalidad: string;
  candidates: ContractRow[];
};

export default function AssignLocalidadPanel({
  targetNorm,
  defaultLocalidad,
  candidates,
}: Props) {
  const router = useRouter();
  const [localidadText, setLocalidadText] = useState(defaultLocalidad);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  }

  async function submit() {
    const ids = [...selected];
    if (ids.length === 0) {
      setMessage("Selecciona al menos un contrato.");
      return;
    }
    const loc = localidadText.trim();
    if (!loc) {
      setMessage("Escribe el nombre de la localidad.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const r = await fetch("/api/contracts/assign-localidad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        localidad: loc,
        target_norm: targetNorm,
      }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(typeof j.error === "string" ? j.error : "No se pudo asignar.");
      return;
    }
    const u = typeof j.updated === "number" ? j.updated : 0;
    setMessage(
      u === ids.length
        ? `Listo: ${u} contrato${u !== 1 ? "s" : ""} movido${u !== 1 ? "s" : ""} a esta localidad.`
        : `Actualizados ${u} de ${ids.length}. Algunos no estaban sin localidad o no coincidían.`
    );
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 shadow-sm">
      <div className="px-5 py-4 border-b border-emerald-100 flex flex-wrap items-center gap-2">
        <PlusCircle className="text-emerald-700 shrink-0" size={22} strokeWidth={1.75} />
        <h2 className="font-medium text-slate-900">Añadir contratos sin localidad</h2>
        <p className="text-sm text-slate-600 w-full md:w-auto md:ml-2">
          {candidates.length} contrato{candidates.length !== 1 ? "s" : ""} archivado
          {candidates.length !== 1 ? "s" : ""} o confirmado{candidates.length !== 1 ? "s" : ""} sin
          localidad (hasta 500 en esta vista).
        </p>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 min-w-[12rem]">
            <span className="text-xs font-medium text-slate-600">
              Texto guardado en &quot;localidad&quot; (debe cuadrar con esta carpeta)
            </span>
            <input
              type="text"
              value={localidadText}
              onChange={(e) => setLocalidadText(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm w-full max-w-md focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
              placeholder="Ej. A Coruña"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-900 disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : null}
            Asignar selección
          </button>
        </div>
        {message && (
          <p className="text-sm text-slate-700" role="status">
            {message}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === candidates.length}
                    onChange={toggleAll}
                    title="Seleccionar todos"
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium">Archivo</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const fullName = [c.nombre, c.apellido_1, c.apellido_2].filter(Boolean).join(" ");
                const display = displayFilenameResolved(c);
                return (
                  <tr key={c.id} className="border-t hover:bg-slate-50">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="rounded border-slate-300"
                        aria-label={`Seleccionar ${display}`}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-800 max-w-[min(20rem,50vw)] break-words">
                      {display}
                    </td>
                    <td className="px-4 py-2">{fullName || "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/contracts/${c.id}`}
                        className="text-slate-700 hover:underline text-xs"
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
      </div>
    </div>
  );
}
