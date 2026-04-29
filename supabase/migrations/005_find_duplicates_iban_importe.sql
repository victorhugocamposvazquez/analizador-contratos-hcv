-- Amplía find_duplicates: también considera mismo IBAN + mismo importe total
-- (útil cuando coinciden otros campos OCR o como criterio fuerte). Misma normalización
-- de IBAN que el trigger (mayúsculas, sin espacios).

-- Sustituye la firma anterior (4 parámetros) por la nueva (6 opcionales al final).
drop function if exists public.find_duplicates(text, date, text, uuid);

create or replace function public.find_duplicates(
  p_nif text,
  p_fecha_promocion date,
  p_num_albaran text,
  p_exclude_id uuid default null,
  p_iban text default null,
  p_importe_total numeric default null
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
      or
      (p_iban is not null and p_importe_total is not null
        and c.iban is not null and c.importe_total is not null
        and upper(regexp_replace(p_iban, '\s', '', 'g')) =
            upper(regexp_replace(c.iban, '\s', '', 'g'))
        and c.importe_total = p_importe_total)
    )
  order by c.created_at desc;
$$;

comment on function public.find_duplicates(text, date, text, uuid, text, numeric) is
  'Duplicados por NIF+fecha, nº albarán, o mismo IBAN + mismo importe total.';
