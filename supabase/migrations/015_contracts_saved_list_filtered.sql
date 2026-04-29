-- Listado filtrado de contratos archivados/confirmados (lote + clave normalize_localidad + texto libre).

create or replace function public.contracts_saved_list_filtered(
  p_batch_id uuid default null,
  p_localidad_norm text default null,
  p_search text default null,
  p_limit int default 500
)
returns setof public.contracts
language sql
stable
security invoker
set search_path = public
as $$
  with st as (
    select btrim(coalesce(p_search, '')) as s
  )
  select c.*
  from public.contracts c, st
  where c.status in ('auto_saved', 'confirmed')
    and (p_batch_id is null or c.batch_id = p_batch_id)
    and (
      p_localidad_norm is null
      or public.normalize_locality(c.localidad) is not distinct from p_localidad_norm
    )
    and (
      st.s = ''
      or strpos(lower(coalesce(c.nif, '')), lower(st.s)) > 0
      or strpos(lower(coalesce(c.num_albaran, '')), lower(st.s)) > 0
      or strpos(lower(coalesce(c.nombre, '')), lower(st.s)) > 0
      or strpos(lower(coalesce(c.apellido_1, '')), lower(st.s)) > 0
      or strpos(lower(coalesce(c.apellido_2, '')), lower(st.s)) > 0
      or strpos(lower(coalesce(c.original_filename, '')), lower(st.s)) > 0
    )
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

comment on function public.contracts_saved_list_filtered(uuid, text, text, int) is
  'Contratos auto_saved/confirmed con filtros opcional por lote, clave normalize_localidad y búsqueda libre.';

grant execute on function public.contracts_saved_list_filtered(uuid, text, text, int) to authenticated;
