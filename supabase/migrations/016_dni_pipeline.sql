-- Lotes de DNI/NIE para extracción de número — cola paralela al flujo de contratos/albaranes.

create table if not exists public.dni_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  name text,
  total_files int not null default 0
);

create table if not exists public.dni_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id uuid not null references public.dni_batches(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,

  storage_path text not null,
  original_filename text,
  content_sha256 text,

  status text not null default 'pending', -- pending | processing | done | failed
  attempts int not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,

  constraint dni_jobs_status_ck check (
    status in ('pending', 'processing', 'done', 'failed')
  )
);

create index if not exists dni_jobs_batch_idx on public.dni_jobs (batch_id);
create index if not exists dni_jobs_status_idx on public.dni_jobs (status);
create index if not exists dni_jobs_sha_lookup on public.dni_jobs (content_sha256)
  where content_sha256 is not null;

create table if not exists public.dni_extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  batch_id uuid not null references public.dni_batches(id) on delete cascade,
  dni_job_id uuid not null references public.dni_jobs(id) on delete cascade unique,
  created_by uuid references auth.users(id) on delete set null,

  numero_documento text,
  nif_valid boolean,
  extraction_confidence numeric,
  extraction_raw jsonb,
  notes text,

  status text not null default 'done',
  constraint dni_extractions_status_ck check (
    status in ('done', 'needs_review', 'failed')
  )
);

create index if not exists dni_extractions_batch_idx on public.dni_extractions (batch_id);
create index if not exists dni_extractions_status_idx on public.dni_extractions (status);

-- Reclamo atómico (Edge Function usa service_role)
create or replace function public.claim_dni_jobs(p_limit int default 8)
returns setof public.dni_jobs
language plpgsql as $$
begin
  return query
    update public.dni_jobs j
       set status = 'processing',
           started_at = now(),
           attempts = j.attempts + 1
     where j.id in (
       select id from public.dni_jobs
        where status = 'pending'
           or (
             status = 'processing'
             and started_at < now() - interval '5 minutes'
             and attempts < 3
           )
        order by created_at asc
        limit p_limit
        for update skip locked
     )
    returning *;
end;
$$;

create or replace function public.dni_batch_stats(p_batch_id uuid)
returns table(
  total int,
  pending int,
  processing int,
  done int,
  failed int,
  needs_review int
)
language sql stable as $$
  select
    (select count(*)::int from public.dni_jobs j where j.batch_id = p_batch_id),
    (select count(*)::int from public.dni_jobs j where j.batch_id = p_batch_id and j.status = 'pending'),
    (select count(*)::int from public.dni_jobs j where j.batch_id = p_batch_id and j.status = 'processing'),
    (select count(*)::int from public.dni_jobs j where j.batch_id = p_batch_id and j.status = 'done'),
    (select count(*)::int from public.dni_jobs j where j.batch_id = p_batch_id and j.status = 'failed'),
    (select count(*)::int from public.dni_extractions e
      where e.batch_id = p_batch_id and e.status = 'needs_review');
$$;

alter table public.dni_batches enable row level security;
alter table public.dni_jobs enable row level security;
alter table public.dni_extractions enable row level security;

drop policy if exists "auth_dni_batches" on public.dni_batches;
create policy "auth_dni_batches" on public.dni_batches
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_dni_jobs" on public.dni_jobs;
create policy "auth_dni_jobs" on public.dni_jobs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_dni_extractions" on public.dni_extractions;
create policy "auth_dni_extractions" on public.dni_extractions
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Borrado físico del fichero al borrar job (fallback si no va por cascada desde batch).
create or replace function public.delete_dni_storage_object()
returns trigger language plpgsql security definer as $$
begin
  if old.storage_path is not null then
    delete from storage.objects
     where bucket_id = 'dnis' and name = old.storage_path;
  end if;
  return old;
end$$;

drop trigger if exists trg_delete_dni_file on public.dni_jobs;
create trigger trg_delete_dni_file
after delete on public.dni_jobs
for each row execute function public.delete_dni_storage_object();

comment on table public.dni_batches is 'Lote de subidas de fotos DNI/NIE.';
comment on table public.dni_jobs is 'Job de procesamiento; un archivo.';
comment on table public.dni_extractions is 'Resultado OCR/visión sobre un job DNI.';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'dnis') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'dnis',
      'dnis',
      false,
      15728640,
      array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    );
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'dnis_read'
  ) then
    create policy "dnis_read" on storage.objects
      for select using (bucket_id = 'dnis' and auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'dnis_write'
  ) then
    create policy "dnis_write" on storage.objects
      for insert with check (bucket_id = 'dnis' and auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'dnis_delete'
  ) then
    create policy "dnis_delete" on storage.objects
      for delete using (bucket_id = 'dnis' and auth.role() = 'authenticated');
  end if;
end$$;
