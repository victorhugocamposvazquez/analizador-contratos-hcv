-- Normalización de localidad (no persiste columnas nuevas): unaccent + reglas para agrupar y filtrar.

create extension if not exists unaccent;

-- Reglas: null o sólo espacios → ''; trim; lower; unaccent;
-- quitar artículos iniciales (la | el | a | as | os | o según orden alternancia largos primero);
-- colapsar espacios múltiples.
create or replace function public.normalize_locality(t text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when t is null or trim(t) = '' then ''
    else
      regexp_replace(
        regexp_replace(
          lower(public.unaccent(trim(t))),
          '^(las|los|la|el|as|os|a|o) +',
          ''
        ),
        '\s+',
        ' ',
        'g'
      )
  end;
$$;

comment on function public.normalize_locality(text) is
  'Clave: trim → lower(unaccent)→ quita prefijo articulador (las|los|la|el|as|os|a|o) → espacios únicos.';

drop function if exists public.contract_counts_by_locality();

create or replace function public.contract_counts_by_locality()
returns table(localidad_norm text, localidad_display text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with pair_counts as (
    select
      public.normalize_locality(c.localidad) as nn,
      trim(coalesce(c.localidad, '')) as disp,
      count(*)::bigint as cnt
    from public.contracts c
    where c.status in ('auto_saved', 'confirmed')
    group by 1, 2
  ),
  totals as (
    select nn, sum(cnt)::bigint as total_sum
    from pair_counts
    group by nn
  ),
  best as (
    select distinct on (pc.nn)
      pc.nn,
      pc.disp as localidad_display
    from pair_counts pc
    order by pc.nn, pc.cnt desc, pc.disp asc
  )
  select
    t.nn as localidad_norm,
    coalesce(b.localidad_display, '') as localidad_display,
    t.total_sum as total
  from totals t
  left join best b on b.nn = t.nn
  order by
    case when t.nn = '' then 1 else 0 end asc,
    t.nn asc;
$$;

comment on function public.contract_counts_by_locality() is
  'Agrupa por normalize_locality; localidad_display = variante más frecuente (empate alfabético).';

drop function if exists public.contracts_by_normalized_locality(text);

create or replace function public.contracts_by_normalized_locality(p_localidad_norm text)
returns setof public.contracts
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.contracts c
  where c.status in ('auto_saved', 'confirmed')
    and public.normalize_locality(c.localidad) is not distinct from p_localidad_norm
  order by c.created_at desc
  limit 500;
$$;

comment on function public.contracts_by_normalized_locality(text) is
  'Contratos guardados que comparten la misma clave normalize_locality.';

create index if not exists contracts_localidad_norm_idx
  on public.contracts (normalize_locality(localidad))
  where status in ('auto_saved', 'confirmed');

grant execute on function public.normalize_locality(text) to authenticated;
grant execute on function public.contract_counts_by_locality() to authenticated;
grant execute on function public.contracts_by_normalized_locality(text) to authenticated;
