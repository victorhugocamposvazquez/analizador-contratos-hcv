-- Supabase ya no permite DELETE directo en storage.objects desde triggers SQL.
-- El borrado de ficheros pasa a hacerse vía Storage API en Next.js (routes de API).

drop trigger if exists trg_delete_contract_file on public.contracts;
drop function if exists public.delete_contract_file();
