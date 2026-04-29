-- Comprueba qué SHA-256 hex del array ya existen en BD, sin pasar listas enormes por querystring (evita 414/500 en PostgREST).

create or replace function public.existing_sha256_already_used(
  p_hashes text[],
  p_include_dni_jobs boolean default true
)
returns table (sha text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct inp.h::text as sha
  from (
    select distinct trim(lower(u.h))::text as h
    from unnest(coalesce(p_hashes, array[]::text[])) as u(h)
    where trim(lower(u.h::text)) ~ '^[a-f0-9]{64}$'
  ) inp
  where exists (
      select 1
        from public.contracts c
       where c.content_sha256 is not null
         and lower(c.content_sha256::text) = inp.h::text
    )
    or exists (
      select 1
        from public.jobs j
       where j.content_sha256 is not null
         and lower(j.content_sha256::text) = inp.h::text
    )
    or (
      p_include_dni_jobs
      and exists (
        select 1
          from public.dni_jobs d
         where d.content_sha256 is not null
           and lower(d.content_sha256::text) = inp.h::text
      )
    );
$$;

grant execute on function public.existing_sha256_already_used(text[], boolean) to authenticated;

comment on function public.existing_sha256_already_used(text[], boolean) is
  'Devuelve hashes (minúsculas) del array que ya están en contracts, jobs y opcionalmente dni_jobs.';
