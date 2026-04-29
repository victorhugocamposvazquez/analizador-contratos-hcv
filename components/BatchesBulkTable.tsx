"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type BatchStats = {
  total: number;
  done: number;
  pending: number;
  processing: number;
  needs_review: number;
  failed: number;
} | null;

export type BatchRow = {
  id: string;
  name: string;
  created_at: string;
  stats: BatchStats;
};

export default function BatchesBulkTable({ rows }: { rows: BatchRow[] }) {
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
        `¿Eliminar ${n} lote${n !== 1 ? "s" : ""}? Se borrarán todos los contratos de esos lotes y no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await fetch("/api/batches/bulk-delete", {
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
            Borrar {selected.size} lote{selected.size !== 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-2 py-2 w-10"></th>
              <th className="text-left px-4 py-2 font-medium">Lote</th>
              <th className="text-left px-4 py-2 font-medium">Creado</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
              <th className="text-right px-4 py-2 font-medium whitespace-nowrap">
                Procesados
              </th>
              <th className="text-right px-4 py-2 font-medium whitespace-nowrap">
                Pendientes
              </th>
              <th className="text-right px-4 py-2 font-medium whitespace-nowrap">
                Por revisar
              </th>
              <th className="text-right px-4 py-2 font-medium">Fallidos</th>
              <th className="text-right px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const s = b.stats;
              const pct =
                s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
              return (
                <tr key={b.id} className="border-t hover:bg-slate-50">
                  <td className="px-2 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggle(b.id)}
                      className="rounded border-slate-300 mt-1"
                      aria-label={`Seleccionar lote ${b.name}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/contracts/batches/${b.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    <div className="h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden w-40">
                      <div
                        className="h-full bg-slate-900"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {formatDate(b.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">{s?.total ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{s?.done ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {s ? s.pending + s.processing : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">{s?.needs_review ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {(s?.failed ?? 0) > 0 ? (
                      <span className="text-red-600">{s!.failed}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/contracts/batches/${b.id}`}
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
