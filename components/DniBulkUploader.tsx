"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Upload, Loader2, Check, AlertCircle, X } from "lucide-react";
import { fileSha256Hex } from "@/lib/file-sha256";

const PARALLEL_UPLOADS = 10;
const HASH_BATCH = 24;

type RowStatus =
  | "hashing"
  | "analyzed"
  | "skipped_batch"
  | "skipped_already"
  | "skipped_user"
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
  phase?: "hash" | "confirm" | "upload" | "done";
  fileRows?: FileRow[];
  /** Resumen para el diálogo de duplicados */
  dupSummary?: {
    /** Totalmente nuevos (por defecto se suben) */
    strictNew: number;
    /** Ya en sistema (1.ª copia en selección) */
    serverDupFirst: number;
    /** Copias extra del mismo fichero dentro de la selección */
    batchDupExtra: number;
  };
};

type Item = { file: File; hash: string; index: number };

type PendingCtx = {
  files: File[];
  hashes: string[];
  serverExisting: Set<string>;
  batchDup: boolean[];
  serverDup: boolean[];
  rowsAfterHash: FileRow[];
};

export default function DniBulkUploader() {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingCtx | null>(null);

  const [state, setState] = useState<UploadState>({
    total: 0,
    uploadTotal: 0,
    uploaded: 0,
    failed: 0,
    active: false,
  });

  const [forceServer, setForceServer] = useState(false);
  const [forceBatchCopies, setForceBatchCopies] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [showDupDialog, setShowDupDialog] = useState(false);

  function pickFiles() {
    inputRef.current?.click();
  }

  function resetIdle() {
    setShowDupDialog(false);
    setForceServer(false);
    setForceBatchCopies(false);
    pendingRef.current = null;
    setBatchName("");
    setState({
      total: 0,
      uploadTotal: 0,
      uploaded: 0,
      failed: 0,
      active: false,
      fileRows: undefined,
      dupSummary: undefined,
    });
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

  function classifyDuplicates(
    hashes: string[],
    serverExisting: Set<string>
  ): { batchDup: boolean[]; serverDup: boolean[] } {
    const batchDup: boolean[] = [];
    const serverDup: boolean[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < hashes.length; i++) {
      const h = hashes[i];
      serverDup[i] = serverExisting.has(h);
      if (seen.has(h)) {
        batchDup[i] = true;
      } else {
        seen.add(h);
        batchDup[i] = false;
      }
    }
    return { batchDup, serverDup };
  }

  function shouldInclude(
    i: number,
    opts: { includeServerResubmits: boolean; includeBatchCopies: boolean }
  ): boolean {
    const ctx = pendingRef.current;
    if (!ctx) return false;
    const sd = ctx.serverDup[i];
    const bd = ctx.batchDup[i];
    if (bd && !opts.includeBatchCopies) return false;
    if (sd && !opts.includeServerResubmits) return false;
    return true;
  }

  const runWorkers = useCallback(
    async (queue: Item[], batch_id: string, uid: string) => {
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
          patchRow(w.index, { status: "uploading", detail: undefined });

          try {
            const ext = w.file.name.split(".").pop() || "jpg";
            const path = `${uid}/${batch_id}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("dnis")
              .upload(path, w.file, {
                contentType: w.file.type,
                upsert: false,
              });
            if (upErr) throw upErr;

            const { error: jobErr } = await supabase.from("dni_jobs").insert({
              batch_id,
              created_by: uid,
              storage_path: path,
              original_filename: w.file.name,
              content_sha256: w.hash,
            });

            if (jobErr) {
              await supabase.storage.from("dnis").remove([path]);
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
            let detail = "No se pudo guardar";
            if (typeof e === "object" && e && "message" in e) {
              detail = String((e as { message?: string }).message ?? "").slice(
                0,
                140
              );
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
    },
    [router, supabase]
  );

  async function finishWithOptions(
    includeServerResubmits: boolean,
    includeBatchCopies: boolean
  ) {
    const ctx = pendingRef.current;
    if (!ctx) return;

    setShowDupDialog(false);
    setState((s) => ({
      ...s,
      phase: "upload",
      active: true,
    }));

    const { files, hashes, batchDup, serverDup, rowsAfterHash } = ctx;

    const finalRows: FileRow[] = rowsAfterHash.map((row, i) => {
      const inc = shouldInclude(i, {
        includeServerResubmits,
        includeBatchCopies,
      });
      if (!inc) {
        if (batchDup[i] && !includeBatchCopies) {
          return {
            ...row,
            status: "skipped_user" as RowStatus,
            detail: "No incluida (copia en la selección)",
          };
        }
        if (serverDup[i] && !includeServerResubmits) {
          return {
            ...row,
            status: "skipped_already" as RowStatus,
            detail: "Ya estaba en el sistema",
          };
        }
      }
      return { ...row, status: "analyzed" as RowStatus, detail: undefined };
    });

    const toUpload: Item[] = [];
    for (let i = 0; i < files.length; i++) {
      if (
        shouldInclude(i, { includeServerResubmits, includeBatchCopies })
      ) {
        toUpload.push({
          file: files[i],
          hash: hashes[i],
          index: i,
        });
      }
    }

    setState((s) => ({
      ...s,
      fileRows: finalRows,
      uploadTotal: toUpload.length,
    }));

    if (toUpload.length === 0) {
      setState((s) => ({
        ...s,
        active: false,
        phase: "done",
        error:
          "Ningún archivo cumple los criterios elegidos (revisa las casillas o cancela y vuelve a seleccionar).",
      }));
      pendingRef.current = null;
      return;
    }

    const batchResp = await fetch("/api/dni-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: batchName.trim() || undefined,
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
      pendingRef.current = null;
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
      pendingRef.current = null;
      return;
    }

    pendingRef.current = null;
    await runWorkers([...toUpload], batch_id, user.id);
  }

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await uploadAll(files);
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
      if (!/^[a-f0-9]{64}$/.test(hashes[idx])) {
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

    const uniqueHashes = [...new Set(hashes)];
    const check = await fetch("/api/dni-jobs/existing-hashes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: uniqueHashes }),
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
    const serverExisting = new Set(
      (existing as string[]).map((x: string) => x.toLowerCase())
    );

    const { batchDup, serverDup } = classifyDuplicates(hashes, serverExisting);

    const rowsAfterHash: FileRow[] = files.map((_, i) => ({
      name: files[i].name,
      status: "analyzed" as RowStatus,
      detail: undefined,
    }));

    pendingRef.current = {
      files,
      hashes,
      serverExisting,
      batchDup,
      serverDup,
      rowsAfterHash,
    };

    let strictNew = 0;
    let serverDupFirst = 0;
    let batchDupExtra = 0;
    for (let i = 0; i < files.length; i++) {
      const isNewStrict = !serverDup[i] && !batchDup[i];
      const isSr = serverDup[i] && !batchDup[i];
      const isBd = batchDup[i];
      if (isNewStrict) strictNew++;
      if (isSr) serverDupFirst++;
      if (isBd) batchDupExtra++;
    }

    const dupSummary = { strictNew, serverDupFirst, batchDupExtra };

    const needsDupDialog =
      serverDup.some(Boolean) || batchDup.some(Boolean);

    setState((s) => ({
      ...s,
      phase: needsDupDialog ? "confirm" : "upload",
      active: !needsDupDialog,
      fileRows: rowsAfterHash,
      dupSummary,
    }));

    if (!needsDupDialog) {
      await finishWithOptions(false, false);
      return;
    }

    setForceServer(false);
    setForceBatchCopies(false);
    setShowDupDialog(true);
  }

  /** Continuar desde el modal usando las dos casillas. */
  async function confirmDuplicatesAndUpload() {
    await finishWithOptions(forceServer, forceBatchCopies);
  }

  function cancelDuplicateDialog() {
    resetIdle();
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
      : state.phase === "confirm"
        ? 40
        : state.phase === "upload" || state.phase === "done"
          ? 40 + Math.round((pctUpload * 60) / 100)
          : 0;

  const d = state.dupSummary;

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden relative">
      <div className="px-5 py-3 border-b border-slate-100">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Nombre del lote (opcional)
        </label>
        <input
          type="text"
          value={batchName}
          onChange={(e) => setBatchName(e.target.value)}
          placeholder="Ej. Promo abril tienda norte"
          className="w-full max-w-xl rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          maxLength={240}
        />
        <p className="text-xs text-slate-500 mt-1">
          Aparecerá en el historial de lotes DNI y en el CSV exportado.
        </p>
      </div>
      {showDupDialog && d && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-labelledby="dup-dialog-title"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl border max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={22} />
              <div className="min-w-0">
                <h3
                  id="dup-dialog-title"
                  className="font-semibold text-slate-900"
                >
                  Hay fotos repetidas
                </h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Comparamos por <strong>mismo contenido del fichero</strong>{" "}
                  (SHA-256), no solo por nombre.
                </p>
                <ul className="mt-3 text-sm text-slate-700 space-y-1 list-disc pl-5">
                  <li>
                    <strong>{d.strictNew}</strong> nueva(s): se subirán siempre{" "}
                    (por defecto).
                  </li>
                  {d.serverDupFirst > 0 && (
                    <li>
                      <strong>{d.serverDupFirst}</strong> con el mismo binario
                      ya guardado antes (resubida).
                    </li>
                  )}
                  {d.batchDupExtra > 0 && (
                    <li>
                      <strong>{d.batchDupExtra}</strong> selección repetida
                      (has elegido el mismo fichero varias veces).
                    </li>
                  )}
                </ul>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => cancelDuplicateDialog()}
                className="shrink-0 p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 border-t pt-3">
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={forceServer}
                  onChange={(e) => setForceServer(e.target.checked)}
                />
                <span>
                  También{" "}
                  <strong className="text-slate-900">
                    volver a subir las que ya estaban en el sistema
                  </strong>{" "}
                  (útil si hace falta reprocesar o corregir un fallo).
                </span>
              </label>
              {d.batchDupExtra > 0 && (
                <label className="flex items-start gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300"
                    checked={forceBatchCopies}
                    onChange={(e) => setForceBatchCopies(e.target.checked)}
                  />
                  <span>
                    Subir{" "}
                    <strong>cada copia dentro de esta selección</strong>{" "}
                    (mismo fichero varias veces → varios jobs).
                  </span>
                </label>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
                onClick={() => cancelDuplicateDialog()}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={(() => {
                  /* Sin casillas solo suben estrictamente nuevos; debe haber al menos uno o el usuario marca resubidas */
                  const pending = pendingRef.current;
                  if (!pending) return true;
                  const anyWouldUpload = pending.files.some((_, i) =>
                    shouldInclude(i, {
                      includeServerResubmits: forceServer,
                      includeBatchCopies: forceBatchCopies,
                    })
                  );
                  return !anyWouldUpload;
                })()}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => void confirmDuplicatesAndUpload()}
              >
                Continuar con la subida
              </button>
            </div>
          </div>
        </div>
      )}

      {state.total === 0 && !state.active && (
        <div className="p-5 flex items-center gap-4">
          <Upload className="text-slate-400" />
          <div className="flex-1">
            <h2 className="font-medium">Subir fotos de DNI/NIE</h2>
            <p className="text-sm text-slate-500">
              Hasta 1000 imágenes por lote. Detectamos duplicados por SHA-256 igual
              que en albaranes; podéis forzar resubida desde el diálogo.
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
            {state.phase === "confirm" ? (
              <AlertCircle className="text-amber-600 shrink-0" size={18} />
            ) : state.active ? (
              <Loader2 className="animate-spin text-slate-500 shrink-0" size={18} />
            ) : state.failed > 0 ? (
              <AlertCircle className="text-amber-500 shrink-0" size={18} />
            ) : (
              <Check className="text-emerald-500 shrink-0" size={18} />
            )}
            <span className="text-sm font-medium">
              {state.phase === "hash" && state.active ? (
                <>Calculando huella SHA-256 ({state.total} archivos)</>
              ) : state.phase === "confirm" ? (
                <span className="text-amber-800">
                  Elegid en el modal qué hacer con las repetidas.
                </span>
              ) : state.active ? (
                <>
                  Subiendo {state.uploaded + state.failed} / {state.uploadTotal}{" "}
                  <span className="text-slate-500 font-normal text-xs">
                    (de {state.total} elegidas)
                  </span>
                </>
              ) : state.phase === "done" ? (
                <>
                  Hecho: <strong>{state.uploaded}</strong> subida(s)
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
                    {r.status === "analyzed" && (
                      <span className="text-slate-600">Analizada</span>
                    )}
                    {r.status === "skipped_batch" && (
                      <span className="text-amber-800">{r.detail}</span>
                    )}
                    {r.status === "skipped_already" && (
                      <span className="text-amber-900">{r.detail}</span>
                    )}
                    {r.status === "skipped_user" && (
                      <span className="text-slate-500">{r.detail}</span>
                    )}
                    {r.status === "uploading" && (
                      <span className="text-slate-600">Subiendo…</span>
                    )}
                    {r.status === "ok" && (
                      <span className="text-emerald-700">✓ Ok</span>
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
                href={`/contracts/dnis/batches/${state.batchId}`}
                className="text-slate-700 underline"
              >
                Ver progreso del procesamiento →
              </a>
              <button
                type="button"
                onClick={() => resetIdle()}
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
            Deduplicación por <strong>bytes idénticos</strong>. WhatsApp u otra
            app que recompima la imagen genera otro hash.{" "}
            <strong>Lotes</strong> · <strong>Por revisar</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
