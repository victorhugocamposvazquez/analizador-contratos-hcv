-- ============================================================
-- Analizador de contratos HCV — esquema inicial
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- Tabla principal de contratos
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  -- Datos del albarán
  num_albaran text,             -- 3853, 3714, ...
  fecha_promocion date,         -- fecha de la promoción/firma
  fecha_entrega date,
  hora_entrega text,

  -- Cliente
  nombre text,
  apellido_1 text,
  apellido_2 text,
  nif text,                     -- normalizado en mayúsculas, sin espacios
  telefono text,
  otros_telefonos text,
  fecha_nacimiento date,
  pais_nacimiento text,
  estado_civil text,
  direccion text,
  localidad text,
  cod_postal text,
  provincia text,

  -- Banco
  banco text,
  iban text,                    -- normalizado en mayúsculas, sin espacios

  -- Artículos (texto libre, una línea por artículo)
  articulos text,

  -- Importe
  importe_total numeric(10, 2),
  num_cuotas int,
  cuota_mensual numeric(10, 2),

  -- Imagen original
  storage_path text not null,   -- ruta en el bucket "contracts"

  -- Metadatos de extracción
  extraction_raw jsonb,         -- JSON completo devuelto por Claude
  extraction_confidence numeric, -- 0..1, media de confianzas por campo
  marked_duplicate boolean not null default false, -- el usuario lo guardó aun siendo duplicado
  notes text
);

-- Normalización: NIF e IBAN siempre en mayúsculas y sin espacios
create or replace function public.normalize_contract()
returns trigger language plpgsql as $$
begin
  if new.nif is not null then
    new.nif := upper(regexp_replace(new.nif, '\s', '', 'g'));
  end if;
  if new.iban is not null then
    new.iban := upper(regexp_replace(new.iban, '\s', '', 'g'));
  end if;
  return new;
end$$;

drop trigger if exists trg_normalize_contract on public.contracts;
create trigger trg_normalize_contract
before insert or update on public.contracts
for each row execute function public.normalize_contract();

-- Índices para búsquedas y duplicados
create index if not exists contracts_nif_idx on public.contracts (nif);
create index if not exists contracts_fecha_promo_idx on public.contracts (fecha_promocion);
create index if not exists contracts_albaran_idx on public.contracts (num_albaran);
create index if not exists contracts_nif_fecha_idx on public.contracts (nif, fecha_promocion);

-- ============================================================
-- Detección de duplicados (función auxiliar)
-- ============================================================
-- Devuelve los contratos que coinciden con un NIF + fecha (criterio principal)
-- o con el mismo nº de albarán (criterio secundario).
create or replace function public.find_duplicates(
  p_nif text,
  p_fecha_promocion date,
  p_num_albaran text,
  p_exclude_id uuid default null
)
returns setof public.contracts
language sql stable as $$
  select * from public.contracts
  where (p_exclude_id is null or id <> p_exclude_id)
    and (
      (p_nif is not null and p_fecha_promocion is not null
        and nif = upper(regexp_replace(p_nif, '\s', '', 'g'))
        and fecha_promocion = p_fecha_promocion)
      or
      (p_num_albaran is not null and num_albaran = p_num_albaran)
    )
  order by created_at desc;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
-- Modelo simple: cualquier usuario autenticado ve y edita todos los
-- contratos (es lo que pediste: "varios compañeros acceden al mismo
-- listado"). Si más adelante quieres separar por equipos, añade una
-- columna team_id y filtra por ella aquí.
alter table public.contracts enable row level security;

drop policy if exists "auth_select" on public.contracts;
create policy "auth_select" on public.contracts
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth_insert" on public.contracts;
create policy "auth_insert" on public.contracts
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "auth_update" on public.contracts;
create policy "auth_update" on public.contracts
  for update using (auth.role() = 'authenticated');

drop policy if exists "auth_delete" on public.contracts;
create policy "auth_delete" on public.contracts
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- Storage: bucket "contracts" (debes crearlo a mano en la UI)
-- Políticas: usuarios autenticados pueden subir/leer/borrar.
-- ============================================================
do $$
begin
  -- SELECT
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'contracts_read'
  ) then
    create policy "contracts_read" on storage.objects
      for select using (bucket_id = 'contracts' and auth.role() = 'authenticated');
  end if;
  -- INSERT
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'contracts_write'
  ) then
    create policy "contracts_write" on storage.objects
      for insert with check (bucket_id = 'contracts' and auth.role() = 'authenticated');
  end if;
  -- DELETE
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'contracts_delete'
  ) then
    create policy "contracts_delete" on storage.objects
      for delete using (bucket_id = 'contracts' and auth.role() = 'authenticated');
  end if;
end$$;

-- ============================================================
-- Trigger: al borrar un contrato, borra también su archivo en storage
-- ============================================================
create or replace function public.delete_contract_file()
returns trigger language plpgsql security definer as $$
begin
  if old.storage_path is not null then
    delete from storage.objects
     where bucket_id = 'contracts' and name = old.storage_path;
  end if;
  return old;
end$$;

drop trigger if exists trg_delete_contract_file on public.contracts;
create trigger trg_delete_contract_file
after delete on public.contracts
for each row execute function public.delete_contract_file();
