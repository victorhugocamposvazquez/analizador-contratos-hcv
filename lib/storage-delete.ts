import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "contracts";
const REMOVE_CHUNK = 90;

/**
 * Borra objetos del bucket `contracts` vía Storage API (obligatorio en Supabase hospedado).
 * Ignora paths vacíos / duplicados.
 */
export async function removeContractStorageFiles(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[]
): Promise<{ error: string | null }> {
  const unique = [
    ...new Set(
      paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    ),
  ];
  if (unique.length === 0) return { error: null };

  for (let i = 0; i < unique.length; i += REMOVE_CHUNK) {
    const slice = unique.slice(i, i + REMOVE_CHUNK);
    const { error } = await supabase.storage.from(BUCKET).remove(slice);
    if (error) return { error: error.message };
  }
  return { error: null };
}
