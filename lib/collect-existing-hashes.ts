import type { SupabaseClient } from "@supabase/supabase-js";

type RpcRow = { sha: string | null };

function rowsToSet(data: unknown): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(data)) return set;
  for (const row of data) {
    if (row && typeof row === "object" && "sha" in row) {
      const s = (row as RpcRow).sha;
      if (typeof s === "string" && s) set.add(s.toLowerCase());
    }
  }
  return set;
}

/** Hashes que ya están en contracts o jobs (opcionalmente incluye dni_jobs). */
export async function rpcExistingSha256Overlap(
  supabase: SupabaseClient,
  hashesLowerUnique: string[],
  includeDniJobs: boolean
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("existing_sha256_already_used", {
    p_hashes: hashesLowerUnique,
    p_include_dni_jobs: includeDniJobs,
  });
  if (error) throw new Error(error.message);
  return rowsToSet(data);
}

export async function collectExistingInContractsAndJobs(
  supabase: SupabaseClient,
  hashesLowerUnique: string[]
): Promise<Set<string>> {
  return rpcExistingSha256Overlap(supabase, hashesLowerUnique, false);
}

export async function collectExistingDniAndContractsAndJobs(
  supabase: SupabaseClient,
  hashesLowerUnique: string[]
): Promise<Set<string>> {
  return rpcExistingSha256Overlap(supabase, hashesLowerUnique, true);
}
