-- Quita el criterio IBAN + importe de find_duplicates (solo NIF+fecha o mismo albarán).

drop function if exists public.find_duplicates(text, date, text, uuid, text, numeric);

create or replace function public.find_duplicates(
  p_nif text,
  p_fecha_promocion date,
  p_num_albaran text,
  p_exclude_id uuid default null
)
returns setof public.contracts
language sql stable as $$
  select c.* from public.contracts c
  where (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      (p_nif is not null and p_fecha_promocion is not null
        and c.nif is not null and c.fecha_promocion is not null
        and c.nif = upper(regexp_replace(p_nif, '\s', '', 'g'))
        and c.fecha_promocion = p_fecha_promocion)
      or
      (p_num_albaran is not null and p_num_albaran <> ''
        and c.num_albaran is not null
        and c.num_albaran = p_num_albaran)
    )
  order by c.created_at desc;
$$;

comment on function public.find_duplicates(text, date, text, uuid) is
  'Duplicados por NIF+fecha o mismo nº de albarán.';
