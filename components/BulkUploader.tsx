"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";
import { fileSha256Hex } from "@/lib/file-sha256";

const PARALLEL_UPLOADS = 10;
const HASH_BATCH = 24;

type RowStatus =
  | "hashing"
  | "skipped_batch"
  | "skipped_already"
  | "uploading"
  | "ok"
  | "err";

type FileRow = { name: string; status: RowStatus; detail?: string };

type UploadState = {
  total: number;
  uploadTotal: number;
  uploaded: number;
  failed: number;
  active: boolean;
  batchId?: string;
  error?: string;
  phase?: "hash" | "upload" | "done";
  fileRows?: FileRow[];
};

export default function BulkUploader() {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UploadState>({
    total: 0,
    uploadTotal: 0,
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

  async function hashAllFiles(files: File[]): Promise<string[]> {
    const result: string[] = new Array(files.length);
    for (let offset = 0; offset < files.length; offset += HASH_BATCH) {
      const slice = files.slice(offset, offset + HASH_BATCH);
      const part = await Promise.all(
        slice.map((f) =>
          fileSha256Hex(f)
            .then((h) => h.toLowerCase())
            .catch(() => "")
        )
      );
      for (let j = 0; j < part.length; j++) {
        result[offset + j] = part[j];
      }
    }
    return result;
  }

  async function uploadAll(files: File[]) {
    const rowsInit: FileRow[] = files.map((f) => ({
      name: f.name,
      status: "hashing",
    }));

    setState({
      total: files.length,
      uploadTotal: 0,
      uploaded: 0,
      failed: 0,
      active: true,
      phase: "hash",
      fileRows: rowsInit,
    });

    const hashes = await hashAllFiles(files);

    for (let idx = 0; idx < files.length; idx++) {
      const h = hashes[idx];
      if (!/^[a-f0-9]{64}$/.test(h)) {
        setState({
          total: files.length,
          uploadTotal: 0,
          uploaded: 0,
          failed: 0,
          active: false,
          phase: "done",
          error:
            "No se pudo calcular la huella de un archivo (tamaño o formato incompatible).",
          fileRows: rowsInit.map((row, i) =>
            i === idx
              ? { ...row, status: "err" as RowStatus, detail: "Sin huella" }
              : row
          ),
        });
        return;
      }
    }

    type Item = { file: File; hash: string; index: number };

    const batchSeen = new Set<string>();

    files.forEach((file, idx) => {
      const hash = hashes[idx];
      if (batchSeen.has(hash)) {
        rowsInit[idx] = {
          ...rowsInit[idx],
          status: "skipped_batch",
          detail: "Repetida en esta selección",
        };
      } else {
        batchSeen.add(hash);
      }
    });

    const afterBatchDedup: Item[] = [];
    files.forEach((file, idx) => {
      if (rowsInit[idx].status === "skipped_batch") return;
      afterBatchDedup.push({
        file,
        hash: hashes[idx],
        index: idx,
      });
    });

    let serverExisting = new Set<string>();
    if (afterBatchDedup.length > 0) {
      const check = await fetch("/api/jobs/existing-hashes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashes: [...new Set(afterBatchDedup.map((b) => b.hash))],
        }),
      });

      if (!check.ok) {
        setState((s) => ({
          ...s,
          active: false,
          phase: "done",
          error:
            "No se pudo comprobar fotos ya subidas. Revisa la sesión e inténtalo otra vez.",
        }));
        return;
      }

      const { existing } = await check.json();
      serverExisting = new Set(
        (existing as string[]).map((x) => x.toLowerCase())
      );
    }

    const toUpload: Item[] = [];
    for (const w of afterBatchDedup) {
      if (serverExisting.has(w.hash)) {
        rowsInit[w.index] = {
          ...rowsInit[w.index],
          status: "skipped_already",
          detail: "Misma foto ya en el sistema",
        };
      } else {
        toUpload.push(w);
      }
    }

    setState((s) => ({
      ...s,
      phase: "upload",
      uploadTotal: toUpload.length,
      fileRows: [...rowsInit],
    }));

    if (toUpload.length === 0) {
      setState((s) => ({
        ...s,
        active: false,
        phase: "done",
        error:
          "No hay ficheros nuevos: todo coincide con subidas ya hechas (mismo contenido binario) o están repetidas en la selección.",
      }));
      return;
    }

    const batchResp = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Lote ${new Date().toLocaleString("es-ES")}`,
        total_files: toUpload.length,
      }),
    });
    if (!batchResp.ok) {
      setState((s) => ({
        ...s,
        active: false,
        phase: "done",
        error: "No se pudo crear el lote",
      }));
      return;
    }
    const { batch_id } = await batchResp.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState((s) => ({
        ...s,
        active: false,
        phase: "done",
        error: "Sesión expirada",
      }));
      return;
    }
    const uid = user.id;

    const queue = [...toUpload];
    let uploaded = 0;
    let failed = 0;

    function patchRow(ix: number, patch: Partial<FileRow>) {
      setState((s) => ({
        ...s,
        fileRows: s.fileRows?.map((row, i) =>
          i === ix ? { ...row, ...patch } : row
        ),
      }));
    }

    async function worker() {
      while (queue.length) {
        const w = queue.shift()!;
        patchRow(w.index, { status: "uploading" });

        try {
          const ext = w.file.name.split(".").pop() || "jpg";
          const path = `${uid}/${batch_id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("contracts")
            .upload(path, w.file, {
              contentType: w.file.type,
              upsert: false,
            });
          if (upErr) throw upErr;

          const { error: jobErr } = await supabase.from("jobs").insert({
            batch_id,
            created_by: uid,
            storage_path: path,
            original_filename: w.file.name,
            content_sha256: w.hash,
          });

          if (jobErr) {
            await supabase.storage.from("contracts").remove([path]);
            throw jobErr;
          }

          uploaded++;
          patchRow(w.index, { status: "ok" });
          setState((s) => ({
            ...s,
            uploaded,
            failed,
          }));
        } catch (e) {
          failed++;
          let detail = "Error al guardar job";
          if (typeof e === "object" && e && "message" in e) {
            const m = String((e as { message?: string }).message ?? "");
            if (m.includes("duplicate") || m.includes("jobs_content_sha256_unique")) {
              detail =
                "Otra pestaña/subida acaba de guardar mismo fichero; recarga el listado.";
            } else {
              detail = m.slice(0, 140);
            }
          }
          patchRow(w.index, { status: "err", detail });
          setState((s) => ({
            ...s,
            uploaded,
            failed,
          }));
        }
      }
    }

    await Promise.all(
      Array.from({ length: PARALLEL_UPLOADS }, () => worker())
    );

    setState((s) => ({
      ...s,
      active: false,
      phase: "done",
      uploaded,
      failed,
      batchId: batch_id,
    }));
    router.refresh();
  }

  const uploadGoal = Math.max(1, state.uploadTotal || 1);
  const pctUpload =
    state.phase === "upload" || state.phase === "done"
      ? Math.min(
          100,
          Math.round(((state.uploaded + state.failed) / uploadGoal) * 100)
        )
      : 0;

  const pctOverall =
    state.phase === "hash"
      ? 12
      : state.phase === "upload" || state.phase === "done"
        ? 12 + Math.round((pctUpload * 88) / 100)
        : 0;

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {!open && !state.active && state.total === 0 && (
        <div className="p-5 flex items-center gap-4">
          <Upload className="text-slate-400" />
          <div className="flex-1">
            <h2 className="font-medium">Subir lote de fotos</h2>
            <p className="text-sm text-slate-500">
              Sube hasta 1000 fotos a la vez. Si eliges{" "}
              <strong>el mismo fichero binario</strong> que ya subiste, se{" "}
              <strong>omite</strong> antes de procesar ni duplicar almacenamiento.
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
          <div className="flex items-center gap-3 flex-wrap">
            {state.active ? (
              <Loader2 className="animate-spin text-slate-500 shrink-0" size={18} />
            ) : state.failed > 0 ? (
              <AlertCircle className="text-amber-500 shrink-0" size={18} />
            ) : (
              <Check className="text-emerald-500 shrink-0" size={18} />
            )}
            <span className="text-sm font-medium">
              {state.phase === "hash" && state.active ? (
                <>Calculando huella SHA-256 ({state.total} archivos)</>
              ) : state.active ? (
                <>
                  Subiendo {state.uploaded + state.failed} /{" "}
                  {state.uploadTotal}{" "}
                  <span className="text-slate-500 font-normal text-xs">
                    (de {state.total} elegidas; omitidas = repetición)
                  </span>
                </>
              ) : state.phase === "done" ? (
                <>
                  Hecho: <strong>{state.uploaded}</strong> nuevas
                  {state.failed > 0 ? ` · ${state.failed} error(es)` : ""}
                </>
              ) : null}
            </span>
            <span className="ml-auto text-sm text-slate-500 tabular-nums">
              {pctOverall}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all"
              style={{ width: `${pctOverall}%` }}
            />
          </div>

          {state.fileRows && state.fileRows.length > 0 && (
            <ul className="max-h-52 overflow-y-auto rounded-lg border bg-slate-50 text-xs divide-y">
              {state.fileRows.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  className="flex flex-wrap items-center gap-2 px-2 py-1.5"
                >
                  <span className="truncate flex-1 min-w-[8rem]" title={r.name}>
                    {r.name}
                  </span>
                  <span className="shrink-0 text-slate-500 max-w-[14rem] text-right text-[11px] sm:text-xs">
                    {r.status === "hashing" && (
                      <span className="text-slate-400">Huella…</span>
                    )}
                    {r.status === "skipped_batch" && (
                      <span className="text-amber-800">{r.detail}</span>
                    )}
                    {r.status === "skipped_already" && (
                      <span className="text-amber-900">{r.detail}</span>
                    )}
                    {r.status === "uploading" && (
                      <span className="text-slate-600">Subiendo…</span>
                    )}
                    {r.status === "ok" && (
                      <span className="text-emerald-700">✓ Lista para OCR</span>
                    )}
                    {r.status === "err" && (
                      <span className="text-red-600" title={r.detail}>
                        {r.detail ?? "Error"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!state.active && state.batchId && state.phase === "done" && (
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
                    uploadTotal: 0,
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
            La deduplicación es por <strong>contenido idéntico</strong> (no por
            nombre de archivo). Si WhatsApp reexporta la imagen, el hash cambia.
            Revisa <strong>Lotes</strong> o <strong>Por revisar</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
