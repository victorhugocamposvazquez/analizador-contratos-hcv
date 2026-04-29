-- Copia contratos sin localidad (clave normalizada vacía) hacia un texto de localidad
-- coherente con una carpeta ya existente (misma normalize_localidad que p_target_norm).

create or replace function public.assign_localidad_from_empty(
  p_contract_ids uuid[],
  p_localidad text,
  p_target_norm text
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n bigint;
begin
  if p_contract_ids is null or cardinality(p_contract_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_contract_ids) > 500 then
    raise exception 'máximo 500 contratos por petición';
  end if;
  if p_localidad is null or trim(p_localidad) = '' then
    raise exception 'p_localidad no puede estar vacío';
  end if;
  if public.normalize_locality(trim(p_localidad)) is distinct from p_target_norm then
    raise exception 'el texto no corresponde a la clave de carpeta (normalización distinta)';
  end if;

  update public.contracts c
  set localidad = trim(p_localidad)
  where c.id = any(p_contract_ids)
    and c.status in ('auto_saved', 'confirmed')
    and public.normalize_locality(c.localidad) = '';

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.assign_localidad_from_empty(uuid[], text, text) is
  'Asigna localidad sólo si estaba vacía (normalizada) y el texto encaja con la clave esperada de carpeta.';

grant execute on function public.assign_localidad_from_empty(uuid[], text, text) to authenticated;
