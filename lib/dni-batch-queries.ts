import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST suele cortar respuestas (p. ej. 1000 filas); `.range()` pagina de forma fiable. */
const PAGE_SIZE = 1000;

/** Tamaño máximo seguro por `.in()` en querystring (UUID ~36 chars × N). */
const IN_CHUNK = 40;

export type DniJobRow = {
  id: string;
  original_filename: string | null;
  storage_path: string | null;
  status: string | null;
  last_error: string | null;
  created_at: string | null;
};

export async function fetchAllDniJobsForBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<{ data: DniJobRow[]; error: string | null }> {
  const rows: DniJobRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("dni_jobs")
      .select("id, original_filename, storage_path, status, last_error, created_at")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    if (!data?.length) break;
    rows.push(...(data as DniJobRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

/** Todas las extracciones del lote; solo `eq(batch_id)` + paginación (sin IN enorme). */
export async function fetchAllDniExtractionsForBatch(
  supabase: SupabaseClient,
  batchId: string,
  columns: string
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("dni_extractions")
      .select(columns)
      .eq("batch_id", batchId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    if (!data?.length) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

/** Extracciones para un subconjunto de jobs (IN acotado por trozos). */
export async function fetchDniExtractionsByJobIds(
  supabase: SupabaseClient,
  batchId: string,
  jobIds: string[],
  columns: string
): Promise<{ data: Map<string, Record<string, unknown>>; error: string | null }> {
  const byJob = new Map<string, Record<string, unknown>>();
  if (jobIds.length === 0) return { data: byJob, error: null };

  const chunks: string[][] = [];
  for (let i = 0; i < jobIds.length; i += IN_CHUNK) {
    chunks.push(jobIds.slice(i, i + IN_CHUNK));
  }

  const concurrency = 4;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const slice = chunks.slice(i, i + concurrency);
    const settled = await Promise.all(
      slice.map((chunk) =>
        supabase
          .from("dni_extractions")
          .select(columns)
          .eq("batch_id", batchId)
          .in("dni_job_id", chunk)
      )
    );
    for (const res of settled) {
      if (res.error) return { data: byJob, error: res.error.message };
      const rowsOut = (res.data ?? []) as unknown as {
        dni_job_id?: string;
        [key: string]: unknown;
      }[];
      for (const row of rowsOut) {
        const id = row.dni_job_id;
        if (typeof id === "string") byJob.set(id, row as Record<string, unknown>);
      }
    }
  }

  return { data: byJob, error: null };
}

/** Máximo de filas a renderizar en la tabla del detalle (evita RSC enorme y GET fallidos). */
export const DNI_BATCH_TABLE_MAX_ROWS = 1200;
