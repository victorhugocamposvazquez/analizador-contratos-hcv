import type { SupabaseClient } from "@supabase/supabase-js";
import { QUERY_IN_CHUNK_SIZE } from "@/lib/existing-hashes-batch";

type RowSha = { content_sha256?: string | null };

async function consumeRows(
  res: {
    data: RowSha[] | null;
    error: { message: string } | null;
  },
  set: Set<string>
) {
  if (res.error) throw new Error(res.error.message);
  for (const r of res.data ?? []) {
    const h = r.content_sha256?.toLowerCase();
    if (h) set.add(h);
  }
}

/** Busca hashes que ya están en contracts (subidas procesadas como contrato). */
export async function collectExistingInContractsAndJobs(
  supabase: SupabaseClient,
  hashesLowerUnique: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < hashesLowerUnique.length; i += QUERY_IN_CHUNK_SIZE) {
    const chunk = hashesLowerUnique.slice(i, i + QUERY_IN_CHUNK_SIZE);
    const [jobsRes, contractsRes] = await Promise.all([
      supabase.from("jobs").select("content_sha256").in("content_sha256", chunk),
      supabase
        .from("contracts")
        .select("content_sha256")
        .in("content_sha256", chunk),
    ]);
    await consumeRows(jobsRes, set);
    await consumeRows(contractsRes, set);
  }
  return set;
}

/** Incluye además tabla dni_jobs (misma columna que jobs). */
export async function collectExistingDniAndContractsAndJobs(
  supabase: SupabaseClient,
  hashesLowerUnique: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < hashesLowerUnique.length; i += QUERY_IN_CHUNK_SIZE) {
    const chunk = hashesLowerUnique.slice(i, i + QUERY_IN_CHUNK_SIZE);
    const [dniRes, jobRes, ctrRes] = await Promise.all([
      supabase
        .from("dni_jobs")
        .select("content_sha256")
        .in("content_sha256", chunk),
      supabase.from("jobs").select("content_sha256").in("content_sha256", chunk),
      supabase
        .from("contracts")
        .select("content_sha256")
        .in("content_sha256", chunk),
    ]);
    await consumeRows(dniRes, set);
    await consumeRows(jobRes, set);
    await consumeRows(ctrRes, set);
  }
  return set;
}
