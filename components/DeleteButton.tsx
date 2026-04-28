"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export default function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("¿Borrar este contrato y su foto? No se puede deshacer.")) return;
    setBusy(true);
    const r = await fetch("/api/contracts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || "Error al borrar");
      return;
    }
    router.push("/contracts");
    router.refresh();
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 size={14} />
      {busy ? "Borrando…" : "Borrar"}
    </button>
  );
}
