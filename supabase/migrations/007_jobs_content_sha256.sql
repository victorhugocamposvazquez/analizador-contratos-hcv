-- Evita resubir el mismo fichero binario (misma foto): hash SHA-256 en jobs y contrato.

alter table public.jobs
  add column if not exists content_sha256 text;

comment on column public.jobs.content_sha256 is
  'SHA-256 hex (64 chars) del PDF/imagen; misma subida duplicada se rechaza.';

-- Un mismo binario no puede tener dos jobs (cola atómica).
create unique index if not exists jobs_content_sha256_unique
  on public.jobs (content_sha256)
  where content_sha256 is not null;

alter table public.contracts
  add column if not exists content_sha256 text;

comment on column public.contracts.content_sha256 is
  'Copia del hash del job origen; permite comprobar duplicados también si se busca por contrato.';

create index if not exists contracts_content_sha256_idx
  on public.contracts (content_sha256)
  where content_sha256 is not null;
