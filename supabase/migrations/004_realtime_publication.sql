-- Publication supabase_realtime: recibir eventos en el cliente (Realtime) para UI reactiva.
-- Si da error "already member", las tablas ya estaban publicadas; ignorar o comentar esa línea.

alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.contracts;
alter publication supabase_realtime add table public.batches;
