# Analizador de contratos HCV

Webapp para subir lotes grandes de fotos de albaranes (hasta 1000 a la vez), extraer los datos automáticamente con IA en background, y revisar solo los casos dudosos o duplicados.

## Cómo funciona el flujo de subida masiva

1. **Subes 500-1000 fotos** desde el navegador. Suben directas al Storage de Supabase en paralelo (10 a la vez). En 2-5 minutos están todas arriba.
2. Por cada foto se crea un **job pendiente** en la tabla `jobs`.
3. Una **Edge Function de Supabase** (`process-jobs`) corre cada minuto via `pg_cron`. Reclama 8 jobs pendientes de la cola y los procesa en grupos de 3 en paralelo respetando el rate limit de Anthropic.
4. Cada extracción se guarda directamente en `contracts` con uno de estos estados:
   - **`auto_saved`** → confianza alta y no hay duplicados. No requiere acción tuya.
   - **`needs_review`** → confianza baja o se han detectado duplicados. Aparece en la pestaña **Por revisar**.
   - El job termina como **`failed`** si Claude falla 3 veces seguidas.
5. Tú vas a la pestaña **Por revisar** y solo ves los dudosos. Para cada uno: confirmas, editas, marcas como dup, o descartas.

A 5-8 fotos/minuto, **800 fotos tardan unas 2-3 horas** en procesarse. Puedes cerrar la pestaña y volver mañana.

## Stack

- **Next.js 14** + TypeScript + Tailwind, desplegable en Vercel.
- **Supabase**: PostgreSQL + Auth + Storage + Edge Functions (Deno) + pg_cron.
- **Anthropic Claude API** (`claude-sonnet-4-6`) para OCR de manuscritos.

---

## Despliegue paso a paso

### 1. Proyecto Supabase

1. Crea un proyecto en https://supabase.com.
2. Apunta `Project URL`, `anon key`, `service_role key` (Settings → API). También apunta tu **PROJECT_REF** (parte del Project URL: `https://PROJECT_REF.supabase.co`).
3. **SQL Editor**: ejecuta primero `supabase/migrations/001_init.sql`, luego `supabase/migrations/002_jobs_queue.sql`.
4. **Storage**: crea bucket privado llamado `contracts`.
5. **Authentication → Providers**: activa Email. Crea los usuarios de tu equipo manualmente desde **Authentication → Users → Add user**.
6. **Database → Extensions**: activa `pg_cron` y `pg_net`.

### 2. Clave de Anthropic

https://console.anthropic.com → API Keys → Create. Carga 20-50€ de saldo (cada extracción cuesta ~0,01€, así te llega para miles).

### 3. Desplegar la Edge Function

Necesitas la CLI de Supabase:

```bash
npm i -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
```

Configura los secretos de la función:

```bash
supabase secrets set \
  SB_URL="https://TU_PROJECT_REF.supabase.co" \
  SB_SERVICE_ROLE_KEY="tu_service_role_key" \
  ANTHROPIC_API_KEY="sk-ant-..."
```

Despliega la función:

```bash
supabase functions deploy process-jobs --no-verify-jwt
```

(`--no-verify-jwt` es importante: la función la invoca el cron de la BBDD, no un usuario.)

Pruébala manualmente:

```bash
curl -X POST https://TU_PROJECT_REF.supabase.co/functions/v1/process-jobs \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY"
# debe responder {"processed": 0, "message": "no pending jobs"}
```

### 4. Activar el cron

En el SQL Editor de Supabase, ejecuta (sustituye los placeholders):

```sql
select cron.schedule(
  'process-jobs-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 50000
  );
  $$
);
```

Para comprobar que está activo:
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

Para pausarlo:
```sql
select cron.unschedule('process-jobs-every-minute');
```

### 5. Frontend

Copia `.env.example` a `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # solo se usa en endpoints API server-side
ANTHROPIC_API_KEY=sk-ant-...         # ya no se usa en Vercel pero lo dejamos por si vuelves a OCR síncrono
```

Local:
```bash
npm install
npm run dev
```

Vercel: importa el repo, pega las mismas variables de entorno, deploy.

---

## Ajustar la velocidad y el coste

En `supabase/functions/process-jobs/index.ts`:

- `BATCH_SIZE = 8` → cuántos jobs reclama cada minuto.
- `CONCURRENCY = 3` → cuántos en paralelo dentro de la invocación.
- `LOW_CONFIDENCE_THRESHOLD = 0.7` → por debajo de esto, va a "needs_review".
- `model: "claude-sonnet-4-6"` → para abaratar ~3x cámbialo a `"claude-haiku-4-5"`. Pierde algo de precisión con manuscritos difíciles.

Con 8 × 3 paralelos sale a unos **8 jobs/minuto reales** = 480/hora. Para 800 fotos: ~1h45m. Si quieres ir más rápido:
- Sube `BATCH_SIZE` a 15 y `CONCURRENCY` a 5. Vigila los rate limits de Anthropic (50 RPM por defecto, te puede pedir aumento gratuito).
- Reduce el intervalo del cron a 30 s con `*/30 * * * * *` (necesita `pg_cron 1.4+`).

**Coste aproximado de IA con Sonnet 4.6**: ~0,012 €/foto. Un lote de 800 fotos = ~10 €.

## Reintentos manuales

Para reencolar jobs fallidos:
```sql
update public.jobs
   set status = 'pending', attempts = 0, last_error = null
 where status = 'failed' and batch_id = '...';
```

## Limpieza de archivos huérfanos

Si un archivo se sube al bucket pero el job nunca se crea (rara vez), queda huérfano. Para limpiar archivos > 7 días sin contrato asociado:
```sql
delete from storage.objects o
 where bucket_id = 'contracts'
   and o.created_at < now() - interval '7 days'
   and not exists (select 1 from public.contracts c where c.storage_path = o.name)
   and not exists (select 1 from public.jobs j where j.storage_path = o.name and j.status in ('pending', 'processing'));
```

## Estructura del repo

```
app/
  api/
    contracts/      → PATCH (revisar) y DELETE
    jobs/           → POST (crear batch)
  contracts/
    page.tsx        → Listado principal + uploader
    review/         → "Por revisar"
    batches/        → Lotes y progreso
    [id]/           → Detalle
components/
  BulkUploader.tsx  → Subida masiva directa a Storage
  ReviewClient.tsx  → UI de revisión uno-a-uno
  ...
supabase/
  migrations/
    001_init.sql
    002_jobs_queue.sql
  functions/
    process-jobs/   → Edge Function que procesa la cola
```
# analizador-contratos-hcv
