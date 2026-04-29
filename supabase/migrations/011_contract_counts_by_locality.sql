-- Agregados por localidad para la sección Contratos → Localidades (solo archivados/confirmados).

create or replace function public.contract_counts_by_locality()
returns table(localidad text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with agg as (
    select
      case
        when nullif(trim(c.localidad), '') is null then ''
        else trim(c.localidad)
      end as loc,
      count(*)::bigint as total
    from public.contracts c
    where c.status in ('auto_saved', 'confirmed')
    group by 1
  )
  select agg.loc as localidad, agg.total
  from agg
  order by
    case when agg.loc = '' then 1 else 0 end asc,
    agg.loc asc;
$$;

comment on function public.contract_counts_by_locality() is
  'Contratos guardados agrupados por localidad trim; cadena vacía = sin datos de localidad.';

grant execute on function public.contract_counts_by_locality() to authenticated;
