"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { displayFilenameResolved, formatDate, formatMoney } from "@/lib/utils";

export type ContractRow = {
  id: string;
  num_albaran: string | null;
  fecha_promocion: string | null;
  nombre: string | null;
  apellido_1: string | null;
  apellido_2: string | null;
  nif: string | null;
  importe_total: number | null;
  marked_duplicate: boolean;
  status: string | null;
  created_at: string;
  original_filename: string | null;
  storage_path: string;
  job_id?: string | null;
  localidad?: string | null;
  batch_id?: string | null;
  /** Nombre del lote si hay batch_id */
  batch_label?: string;
  jobs?: unknown;
};

export default function ContractsBulkTable({ rows }: { rows: ContractRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allIds = rows.map((r) => r.id);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const n = ids.length;
    if (
      !window.confirm(
        `¿Eliminar ${n} contrato${n !== 1 ? "s" : ""} y sus fotos? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await fetch("/api/contracts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error || "No se pudo borrar");
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b bg-slate-50/90 text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-slate-300"
          />
          <span className="text-slate-600">
            Seleccionar todo ({rows.length})
          </span>
        </label>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={bulkDelete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
            Borrar {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="w-10 px-2 py-2"></th>
              <th className="text-left px-4 py-2 font-medium">Lote</th>
              <th className="text-left px-4 py-2 font-medium">Archivo original</th>
              <th className="text-left px-4 py-2 font-medium">Localidad</th>
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
            {rows.map((c) => {
              const fullName = [c.nombre, c.apellido_1, c.apellido_2]
                .filter(Boolean)
                .join(" ");
              const display = displayFilenameResolved(c);
              return (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="px-2 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="rounded border-slate-300 mt-1"
                      aria-label={`Seleccionar ${display}`}
                    />
                  </td>
                  <td className="px-4 py-2 align-top max-w-[8rem]">
                    {c.batch_id && c.batch_label ? (
                      <Link
                        href={`/contracts?batch=${encodeURIComponent(c.batch_id)}`}
                        className="text-slate-700 hover:underline text-xs break-words"
                        title="Filtrar este lote"
                      >
                        {c.batch_label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div
                      className="font-mono text-xs text-slate-800 whitespace-normal break-words max-w-[min(22rem,40vw)]"
                      title={display}
                    >
                      {display}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700 max-w-[9rem] truncate" title={c.localidad ?? ""}>
                    {c.localidad?.trim() || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono">{c.num_albaran || "—"}</td>
                  <td className="px-4 py-2">{formatDate(c.fecha_promocion)}</td>
                  <td className="px-4 py-2">{fullName || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.nif || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {formatMoney(c.importe_total)}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
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
    </div>
  );
}
