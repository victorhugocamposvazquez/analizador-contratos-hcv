import { createClient as createSb } from "@supabase/supabase-js";

// Solo desde el servidor. Bypassea RLS — úsalo con cuidado.
export function createServiceClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
