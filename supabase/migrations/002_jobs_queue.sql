-- ============================================================
-- Migration 002 — sistema de cola para procesamiento en background
-- Ejecutar DESPUÉS de 001_init.sql
-- ============================================================

-- Tabla de lotes (cada subida masiva = 1 batch)
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  name text,
  total_files int not null default 0
);

-- Cola de trabajos: una fila por foto subida, pendiente de procesar
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id uuid references public.batches(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,

  storage_path text not null,
  original_filename text,

  status text not null default 'pending', -- pending | processing | done | failed
  attempts int not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,

  -- Cuando done, apunta al contrato creado
  contract_id uuid references public.contracts(id) on delete set null
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_batch_idx on public.jobs (batch_id);

-- ============================================================
-- Ampliar tabla contracts con campo status para revisión
-- ============================================================
alter table public.contracts
  add column if not exists status text not null default 'auto_saved',
  add column if not exists batch_id uuid references public.batches(id) on delete set null,
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

-- status: auto_saved | needs_review | confirmed | discarded
-- - auto_saved: el procesador lo metió sin duplicados ni dudas. No requiere acción.
-- - needs_review: hay duplicados detectados o confianza baja. Aparece en la pestaña Revisar.
-- - confirmed: el usuario lo revisó y confirmó (con o sin marcar dup).
-- - discarded: el usuario lo descartó tras revisar (se mantiene para auditoría, opcional borrar).

create index if not exists contracts_status_idx on public.contracts (status);
create index if not exists contracts_batch_idx on public.contracts (batch_id);

-- ============================================================
-- RLS para nuevas tablas
-- ============================================================
alter table public.batches enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "auth_all_batches" on public.batches;
create policy "auth_all_batches" on public.batches
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_all_jobs" on public.jobs;
create policy "auth_all_jobs" on public.jobs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Función para reclamar un lote de jobs (atómica, evita carreras
-- entre invocaciones simultáneas del procesador)
-- ============================================================
create or replace function public.claim_jobs(p_limit int default 5)
returns setof public.jobs
language plpgsql
as $$
begin
  return query
    update public.jobs j
       set status = 'processing',
           started_at = now(),
           attempts = j.attempts + 1
     where j.id in (
       select id from public.jobs
        where status = 'pending'
          -- Reintenta también jobs que se quedaron colgados >5 min en processing
          or (status = 'processing' and started_at < now() - interval '5 minutes' and attempts < 3)
        order by created_at asc
        limit p_limit
        for update skip locked
     )
    returning *;
end$$;

-- ============================================================
-- Helper: estadísticas de un batch (para barra de progreso)
-- ============================================================
create or replace function public.batch_stats(p_batch_id uuid)
returns table(
  total int,
  pending int,
  processing int,
  done int,
  failed int,
  needs_review int,
  auto_saved int
)
language sql stable as $$
  select
    (select count(*) from public.jobs where batch_id = p_batch_id)::int as total,
    (select count(*) from public.jobs where batch_id = p_batch_id and status = 'pending')::int as pending,
    (select count(*) from public.jobs where batch_id = p_batch_id and status = 'processing')::int as processing,
    (select count(*) from public.jobs where batch_id = p_batch_id and status = 'done')::int as done,
    (select count(*) from public.jobs where batch_id = p_batch_id and status = 'failed')::int as failed,
    (select count(*) from public.contracts where batch_id = p_batch_id and status = 'needs_review')::int as needs_review,
    (select count(*) from public.contracts where batch_id = p_batch_id and status = 'auto_saved')::int as auto_saved;
$$;

-- ============================================================
-- pg_cron: invocar la Edge Function cada minuto
-- ============================================================
-- Necesitas activar las extensiones en Supabase Dashboard:
--   Database → Extensions → activa pg_cron y pg_net
-- Luego sustituye PROJECT_REF y SERVICE_ROLE_KEY abajo y ejecuta el bloque.

-- AVISO: este bloque hay que personalizarlo. Lo dejo aquí como referencia
-- pero NO lo ejecutes tal cual. Sigue las instrucciones del README.
/*
select cron.schedule(
  'process-jobs-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 50000
  );
  $$
);
*/
