-- localidad debe ser un nombre de municipio/población, no lugar de entrega ni dirección.
-- Si no parece plausible, NO se guarda (null → sin agrupación en por localidad / cartera vacía).

create or replace function public.localidad_is_plausible_municipality(t text)
returns boolean
language sql
immutable parallel safe
set search_path = public
as $$
  select case
    when t is null then false
    when length(btrim(t)) < 2 then false
    when length(btrim(t)) > 72 then false
    when btrim(t) ~ '[\n\r\t\f\v]' then false
    -- Más de dos comas suele indicar línea tipo calle / portal / provincia…
    when (length(btrim(t)) - length(replace(btrim(t), ',', ''))) > 2 then false
    when btrim(t) ~* '(^|[\s,])c\.?\s*p\.?\s*[.:]?\s*[0-9]' then false
    when btrim(t) ~* 'c[oó]digo\s+pstal|c[oó]digo\s+postal' then false
    -- Código postal español típico aislado
    when btrim(t) ~ '[[:<:]][0123456789]{5}[[:>:]]' then false
    when btrim(t) ~ '[0-9]+\s*[ºª°]' then false
    -- Guiones típicos tipo "22 – 24" entre números en direcciones/bloques
    when btrim(t) ~ '[0-9][[:space:]]*[\-–][[:space:]]*[[:digit:]a-z]' then false
    else true
  end;
$$;

comment on function public.localidad_is_plausible_municipality(text) is
  'Devuelve true si el texto es razonable como solo municipio; false si huele a dirección o bloque de entrega.';

create or replace function public.trg_contracts_localidad_only_municipality()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    if new.localidad is not null
       and not public.localidad_is_plausible_municipality(new.localidad::text) then
      new.localidad := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contracts_localidad_only_municipality on public.contracts;
create trigger trg_contracts_localidad_only_municipality
before insert or update on public.contracts
for each row execute function public.trg_contracts_localidad_only_municipality();
