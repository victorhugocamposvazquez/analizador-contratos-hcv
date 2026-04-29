"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

type Props = {
  batchId: string;
  initialName: string | null;
};

export default function BatchRenameForm({ batchId, initialName }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialName ?? "");
  }, [initialName]);

  const initialTrim = (initialName ?? "").trim();
  const dirty = value.trim() !== initialTrim;

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/batches/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(typeof j.error === "string" ? j.error : "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 min-w-[12rem]">
        <span className="text-xs font-medium text-slate-600">Nombre del lote</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ej. Febrero tienda norte"
          disabled={busy}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full max-w-md focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={busy || !dirty}
        className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        Guardar nombre
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
