-- Nombre original de la foto (copiado del job al crear el contrato; útil siempre visible en UI)
alter table public.contracts
  add column if not exists original_filename text;

comment on column public.contracts.original_filename is
  'Nombre del archivo tal como lo subió el usuario (ej. WhatsApp Image....jpeg).';

-- Opcional: rellenar registros antiguos que tengan job_id pero no nombre
update public.contracts c
set original_filename = j.original_filename
from public.jobs j
where c.job_id = j.id
  and c.original_filename is null
  and j.original_filename is not null;
