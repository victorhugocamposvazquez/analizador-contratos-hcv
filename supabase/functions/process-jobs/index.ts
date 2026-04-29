// Supabase Edge Function: process-jobs
// Se invoca cada minuto desde pg_cron. Reclama hasta N jobs pendientes,
// extrae los campos con Claude y los inserta en `contracts`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";

const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Cuántos jobs procesa cada invocación (cada minuto)
const BATCH_SIZE = 8;
// Cuántos en paralelo dentro de la invocación
const CONCURRENCY = 3;
// Umbral de confianza por debajo del cual se marca como needs_review
const LOW_CONFIDENCE_THRESHOLD = 0.7;

const SYSTEM_PROMPT = `Eres un extractor de datos de albaranes/contratos manuscritos de la empresa "Glomark Home".

Cada albarán es un formulario impreso en castellano con campos rellenados a mano. Tu tarea: leer la foto y devolver EXCLUSIVAMENTE un objeto JSON con los campos solicitados, sin texto antes ni después, sin markdown.

Reglas estrictas:
- Si un campo no se ve, no se entiende o está vacío → null. NUNCA inventes.
- Fechas → formato ISO YYYY-MM-DD. Las fechas suelen aparecer como DD/MM/YY o DD-M-YY (asume siglo XX para años de nacimiento >= 30, siglo XXI para el resto).
- NIF → letras en mayúsculas, sin espacios ni guiones.
- IBAN → empieza por ES y tiene 24 caracteres. Júntalos sin espacios.
- num_albaran → el número grande en rojo arriba a la derecha (ej: 3853, 3714).
- importe_total, num_cuotas, cuota_mensual → números, sin €.
- articulos → texto libre, una línea por artículo, separados por '\\n'. Mantén la grafía original.
- estado_civil → "casado", "soltero", "viudo", "divorciado" en minúscula, o null.
- confidence → tu autoevaluación 0..1 de cómo de seguro estás de la lectura general.
- notes → si hay algo importante que no has podido leer o tienes dudas, indícalo aquí.

Responde SOLO el JSON.`;

// Campos que el JSON debe contener
type ExtractedFields = Record<string, any> & { confidence: number };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

/** Base64 sin desplegar todo el buffer en un solo `fromCharCode(...bytes)` (revienta la pila en fotos grandes). */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function processJob(job: any): Promise<void> {
  console.log(`[job ${job.id}] start (attempt ${job.attempts})`);

  // 1. Descarga la imagen del bucket
  const { data: blob, error: dlErr } = await supabase.storage
    .from("contracts")
    .download(job.storage_path);
  if (dlErr || !blob) throw new Error(`download: ${dlErr?.message ?? "no blob"}`);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const base64 = uint8ArrayToBase64(buf);
  const mediaType = (blob.type || "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";

  // 2. Llama a Claude
  // Modelo: Sonnet 4.6 — el mejor para manuscritos en español a precio razonable.
  // Si quieres abaratar, cambia a "claude-haiku-4-5" (~3x más barato, algo menos preciso).
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Extrae los campos del albarán y devuélvelos como JSON." },
        ],
      },
    ],
  });

  const textBlock = msg.content.find((b: any) => b.type === "text") as any;
  if (!textBlock) throw new Error("Modelo no devolvió texto");

  const cleaned = String(textBlock.text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let extracted: ExtractedFields;
  try {
    extracted = JSON.parse(cleaned);
  } catch {
    throw new Error(`JSON inválido: ${cleaned.slice(0, 200)}`);
  }

  // 3. Buscar duplicados
  const { data: dups } = await supabase.rpc("find_duplicates", {
    p_nif: extracted.nif ?? null,
    p_fecha_promocion: extracted.fecha_promocion ?? null,
    p_num_albaran: extracted.num_albaran ?? null,
    p_exclude_id: null,
    p_iban: extracted.iban ?? null,
    p_importe_total: extracted.importe_total ?? null,
  });
  const hasDups = (dups ?? []).length > 0;
  const lowConfidence = (extracted.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD;

  const status = hasDups || lowConfidence ? "needs_review" : "auto_saved";

  // 4. Insertar contrato
  const { data: contract, error: insErr } = await supabase
    .from("contracts")
    .insert({
      created_by: job.created_by,
      storage_path: job.storage_path,
      batch_id: job.batch_id,
      job_id: job.id,
      original_filename: job.original_filename ?? null,
      status,
      extraction_raw: extracted,
      extraction_confidence: extracted.confidence ?? null,
      notes: extracted.notes ?? null,
      num_albaran: extracted.num_albaran ?? null,
      fecha_promocion: extracted.fecha_promocion ?? null,
      fecha_entrega: extracted.fecha_entrega ?? null,
      hora_entrega: extracted.hora_entrega ?? null,
      nombre: extracted.nombre ?? null,
      apellido_1: extracted.apellido_1 ?? null,
      apellido_2: extracted.apellido_2 ?? null,
      nif: extracted.nif ?? null,
      telefono: extracted.telefono ?? null,
      otros_telefonos: extracted.otros_telefonos ?? null,
      fecha_nacimiento: extracted.fecha_nacimiento ?? null,
      pais_nacimiento: extracted.pais_nacimiento ?? null,
      estado_civil: extracted.estado_civil ?? null,
      direccion: extracted.direccion ?? null,
      localidad: extracted.localidad ?? null,
      cod_postal: extracted.cod_postal ?? null,
      provincia: extracted.provincia ?? null,
      banco: extracted.banco ?? null,
      iban: extracted.iban ?? null,
      articulos: extracted.articulos ?? null,
      importe_total: extracted.importe_total ?? null,
      num_cuotas: extracted.num_cuotas ?? null,
      cuota_mensual: extracted.cuota_mensual ?? null,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`insert: ${insErr.message}`);

  // 5. Marcar job como done
  await supabase
    .from("jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      contract_id: contract!.id,
      last_error: null,
    })
    .eq("id", job.id);

  console.log(`[job ${job.id}] done → contract ${contract!.id} (${status})`);
}

async function processInPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
) {
  const queue = [...items];
  const runners = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      try {
        await worker(item);
      } catch (e) {
        // Manejado dentro de processOneSafely
      }
    }
  });
  await Promise.all(runners);
}

async function processOneSafely(job: any) {
  try {
    await processJob(job);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[job ${job.id}] error: ${msg}`);
    const finalStatus = job.attempts >= 3 ? "failed" : "pending"; // se reintenta
    await supabase
      .from("jobs")
      .update({
        status: finalStatus,
        last_error: msg,
        finished_at: finalStatus === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", job.id);
  }
}

Deno.serve(async (_req) => {
  const { data: jobs, error } = await supabase.rpc("claim_jobs", { p_limit: BATCH_SIZE });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  const list = jobs ?? [];
  if (list.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "no pending jobs" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  await processInPool(list, processOneSafely, CONCURRENCY);

  return new Response(
    JSON.stringify({ processed: list.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
