"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";

const PARALLEL_UPLOADS = 10; // archivos subiendo a la vez

type UploadState = {
  total: number;
  uploaded: number;
  failed: number;
  active: boolean;
  batchId?: string;
  error?: string;
  /** Nombre de cada archivo durante la subida; ok null = pendiente */
  fileRows?: Array<{ name: string; ok: boolean | null }>;
};

export default function BulkUploader() {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UploadState>({
    total: 0,
    uploaded: 0,
    failed: 0,
    active: false,
  });

  function pickFiles() {
    inputRef.current?.click();
  }

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await uploadAll(files);
  }

  async function uploadAll(files: File[]) {
    const fileRowsInit = files.map((f) => ({ name: f.name, ok: null as boolean | null }));
    setState({
      total: files.length,
      uploaded: 0,
      failed: 0,
      active: true,
      fileRows: fileRowsInit,
    });

    // 1. Crear batch
    const batchResp = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Lote ${new Date().toLocaleString("es-ES")}`,
        total_files: files.length,
      }),
    });
    if (!batchResp.ok) {
      setState((s) => ({
        ...s,
        active: false,
        error: "No se pudo crear el lote",
      }));
      return;
    }
    const { batch_id } = await batchResp.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState((s) => ({ ...s, active: false, error: "Sesión expirada" }));
      return;
    }

    // 2. Subir archivos en paralelo limitado y crear job por cada uno
    const queue = files.map((f, i) => ({ file: f, index: i }));
    let uploaded = 0;
    let failed = 0;

    async function worker() {
      while (queue.length) {
        const { file: f, index } = queue.shift()!;
        let rowOk = false;
        try {
          const ext = f.name.split(".").pop() || "jpg";
          const path = `${user!.id}/${batch_id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("contracts")
            .upload(path, f, { contentType: f.type, upsert: false });
          if (upErr) throw upErr;

          const { error: jobErr } = await supabase.from("jobs").insert({
            batch_id,
            created_by: user!.id,
            storage_path: path,
            original_filename: f.name,
          });
          if (jobErr) throw jobErr;

          rowOk = true;
          uploaded++;
        } catch (e) {
          console.error("upload failed", f.name, e);
          failed++;
        } finally {
          setState((s) => ({
            ...s,
            uploaded,
            failed,
            fileRows: s.fileRows?.map((row, idx) =>
              idx === index ? { ...row, ok: rowOk } : row
            ),
          }));
        }
      }
    }

    await Promise.all(
      Array.from({ length: PARALLEL_UPLOADS }, () => worker())
    );

    setState((s) => ({ ...s, active: false, batchId: batch_id }));
    router.refresh();
  }

  const pct = state.total > 0
    ? Math.round(((state.uploaded + state.failed) / state.total) * 100)
    : 0;

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {!open && !state.active && state.total === 0 && (
        <div className="p-5 flex items-center gap-4">
          <Upload className="text-slate-400" />
          <div className="flex-1">
            <h2 className="font-medium">Subir lote de fotos</h2>
            <p className="text-sm text-slate-500">
              Sube hasta 1000 fotos a la vez. Se procesarán en background — puedes
              cerrar la pestaña.
            </p>
          </div>
          <button
            onClick={pickFiles}
            className="bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-800"
          >
            Seleccionar fotos
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
        </div>
      )}

      {(state.active || state.total > 0) && (
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            {state.active ? (
              <Loader2 className="animate-spin text-slate-500" size={18} />
            ) : state.failed > 0 ? (
              <AlertCircle className="text-amber-500" size={18} />
            ) : (
              <Check className="text-emerald-500" size={18} />
            )}
            <span className="text-sm font-medium">
              {state.active
                ? `Subiendo ${state.uploaded + state.failed} / ${state.total}…`
                : `Subida completa: ${state.uploaded} OK${state.failed > 0 ? `, ${state.failed} fallidas` : ""}`}
            </span>
            <span className="ml-auto text-sm text-slate-500">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {state.fileRows && state.fileRows.length > 0 && (
            <ul className="max-h-52 overflow-y-auto rounded-lg border bg-slate-50 text-xs divide-y">
              {state.fileRows.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <span className="truncate flex-1" title={r.name}>
                    {r.name}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {r.ok === null && "…"}
                    {r.ok === true && (
                      <span className="text-emerald-600">✓ Subido</span>
                    )}
                    {r.ok === false && (
                      <span className="text-red-600">Error</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!state.active && state.batchId && (
            <div className="flex items-center gap-3 pt-2 text-sm">
              <a
                href={`/contracts/batches/${state.batchId}`}
                className="text-slate-700 underline"
              >
                Ver progreso del procesamiento →
              </a>
              <button
                onClick={() =>
                  setState({
                    total: 0,
                    uploaded: 0,
                    failed: 0,
                    active: false,
                    fileRows: undefined,
                  })
                }
                className="ml-auto text-slate-500 hover:text-slate-800"
              >
                Subir otro lote
              </button>
            </div>
          )}
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <p className="text-xs text-slate-500">
            La extracción y guardado se hace en background. Mira la pestaña{" "}
            <strong>Lotes</strong> o <strong>Por revisar</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
