-- Clasificación de documento, validez NIF, y duplicados: prioridad número de albarán.

alter table public.contracts drop constraint if exists contracts_document_class_check;

alter table public.contracts
  add column if not exists document_class text,
  add column if not exists nif_valid boolean;

update public.contracts
   set document_class = coalesce(document_class, 'contrato_venta')
 where document_class is null;

alter table public.contracts
  alter column document_class set not null,
  alter column document_class set default 'contrato_venta';

alter table public.contracts
  add constraint contracts_document_class_check
  check (
    document_class in (
      'contrato_venta',
      'documento_otro',
      'captura_app',
      'ilegible'
    )
  );

comment on column public.contracts.document_class is
  'Clasificación de la foto por la IA antes de interpretar datos de negocio.';
comment on column public.contracts.nif_valid is
  'null si no hay NIF; true/false según algoritmo DNI/NIE (letra control módulo 23).';

-- Duplicados: si hay número de albarán no vacío → solo ese criterio. Si no → NIF + fecha promoción.
create or replace function public.find_duplicates(
  p_nif text,
  p_fecha_promocion date,
  p_num_albaran text,
  p_exclude_id uuid default null
)
returns setof public.contracts
language sql stable as $$
  select c.* from public.contracts c
  where coalesce(trim(c.document_class), 'contrato_venta') = 'contrato_venta'
    and (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      (
        nullif(trim(p_num_albaran), '') is not null
        and nullif(trim(c.num_albaran), '') is not null
        and nullif(trim(c.num_albaran), '') = trim(p_num_albaran)
      )
      or (
        nullif(trim(p_num_albaran), '') is null
        and p_nif is not null
        and p_fecha_promocion is not null
        and c.nif is not null
        and c.fecha_promocion is not null
        and c.nif = upper(regexp_replace(p_nif, '\s', '', 'g'))
        and c.fecha_promocion = p_fecha_promocion
      )
    )
  order by c.created_at desc;
$$;

comment on function public.find_duplicates(text, date, text, uuid) is
  'Duplicados: mismo nº albarán cuando ambos están informados (prioritario); si el candidato llega sin albarán → NIF+fecha. Solo filas contrato_venta.';
