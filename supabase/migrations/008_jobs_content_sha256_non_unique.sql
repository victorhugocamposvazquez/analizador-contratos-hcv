-- Permite resubir el mismo binario a propósito: el índice único impedía un segundo job con el mismo hash.

drop index if exists public.jobs_content_sha256_unique;

create index if not exists jobs_content_sha256_lookup
  on public.jobs (content_sha256)
  where content_sha256 is not null;

comment on column public.jobs.content_sha256 is
  'SHA-256 hex del fichero; deduplicación suave en UI — no único para permitir resubidas forzadas.';
