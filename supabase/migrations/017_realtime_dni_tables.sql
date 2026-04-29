-- Realtime (opcional): si ya existe la publication, permite refrescos Live en UI.

alter publication supabase_realtime add table public.dni_batches;
alter publication supabase_realtime add table public.dni_jobs;
alter publication supabase_realtime add table public.dni_extractions;
