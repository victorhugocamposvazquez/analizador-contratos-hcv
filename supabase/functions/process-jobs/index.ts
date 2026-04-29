// Supabase Edge Function: process-jobs
// Se invoca cada minuto desde pg_cron. Reclama hasta N jobs pendientes,
// extrae los campos con Claude y los inserta en `contracts`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";

/* DNI/NIE (módulo 23) — empaquetado en un solo archivo (el deploy remoto no incluye ./spanish-id.ts). Alinear con lib/spanish-id.ts */
const MOD23_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function niePrefixToDigit(c: string): string {
  if (c === "X") return "0";
  if (c === "Y") return "1";
  if (c === "Z") return "2";
  return "";
}

function isValidDni(normalized: string): boolean {
  if (!/^\d{8}[A-Z]$/.test(normalized)) return false;
  const num = parseInt(normalized.slice(0, 8), 10);
  const letter = normalized[8];
  return MOD23_LETTERS[num % 23] === letter;
}

function isValidNie(normalized: string): boolean {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(normalized)) return false;
  const mapped = niePrefixToDigit(normalized[0]) + normalized.slice(1, 8);
  const num = parseInt(mapped, 10);
  const letter = normalized[8];
  return MOD23_LETTERS[num % 23] === letter;
}

function validateSpanishPersonalId(normalizedUpper: string | null | undefined): boolean | null {
  const s = normalizedUpper?.trim() ?? "";
  if (!s) return null;
  if (isValidDni(s) || isValidNie(s)) return true;
  return false;
}

const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const BATCH_SIZE = 8;
const CONCURRENCY = 3;
const LOW_CONFIDENCE_THRESHOLD = 0.7;

const DOCUMENT_CLASSES = [
  "contrato_venta",
  "documento_otro",
  "captura_app",
  "ilegible",
] as const;

type DocumentClass = (typeof DOCUMENT_CLASSES)[number];

function normalizeDocumentClass(raw: unknown): DocumentClass {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (DOCUMENT_CLASSES.includes(v as DocumentClass)) return v as DocumentClass;
  return "ilegible";
}

const SYSTEM_PROMPT = `Eres un clasificador y extractor de documentos relacionados con "Glomark Home".

ANTES QUE NADA clasifica la imagen con el campo "document_class":
- contrato_venta (Tipo A) — formulario impreso de contrato/albarán de venta que importa para datos de cliente.
- documento_otro (Tipo B) — encuestas, fichas, recortes sin el formulario de venta esperado u otro papel.
- captura_app (Tipo C) — foto de pantalla de móvil u ordenador, no papel escaneado.
- ilegible — foto borrosa, demasiado recortada, sobreexpuesta u otra causa que impida leer con garantías.

IMPORTANTE sobre document_class:
- Si NO es inequívocamente contrato_venta, NO lo marques como contrato_venta por defecto; ante duda usa documento_otro o ilegible según aplique.

Si document_class ES "contrato_venta", rellena todos los campos de negocio que puedas ver.
Si document_class NO es "contrato_venta", devuelve null en los campos de negocio (num_albaran, nif, importes…); puedes poner un breve "notes".

Reglas cuando document_class sea "contrato_venta":
- Si un campo no se ve, no se entiende o está vacío → null. NUNCA inventes.
- Fechas → formato ISO YYYY-MM-DD. Las fechas suelen aparecer como DD/MM/YY o DD-MM-YY (asume siglo XX para años de nacimiento >= 30, siglo XXI para el resto).
- NIF → letras en mayúsculas, sin espacios ni guiones.
- IBAN → empieza por ES y tiene 24 caracteres. Júntalos sin espacios.
- num_albaran → el número grande en rojo arriba a la derecha (ej: 3853, 3714).
- importe_total, num_cuotas, cuota_mensual → números, sin €.
- articulos → texto libre, una línea por artículo, separados por '\\n'. Mantén la grafía original.
- estado_civil → "casado", "soltero", "viudo", "divorciado" en minúscula, o null.
- confidence → tu autoevaluación 0..1 de la lectura (si no es contrato_venta, refleja confianza en la clasificación).

JSON obligatorio (incluye siempre document_class y confidence):
document_class, confidence, notes, num_albaran, fecha_promocion, fecha_entrega, hora_entrega, nombre, apellido_1, apellido_2, nif, telefono, otros_telefonos, fecha_nacimiento, pais_nacimiento, estado_civil, direccion, localidad, cod_postal, provincia, banco, iban, articulos, importe_total, num_cuotas, cuota_mensual

Responde SOLO el JSON, sin markdown.`;

type ExtractedFields = Record<string, unknown> & {
  document_class?: string;
  confidence?: number;
  notes?: string | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function processJob(job: Record<string, unknown>): Promise<void> {
  console.log(`[job ${job.id}] start (attempt ${job.attempts})`);

  const { data: blob, error: dlErr } = await supabase.storage
    .from("contracts")
    .download(job.storage_path as string);
  if (dlErr || !blob) throw new Error(`download: ${dlErr?.message ?? "no blob"}`);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const base64 = uint8ArrayToBase64(buf);
  const mediaType = (blob.type || "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";

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
          {
            type: "text",
            text: "Clasifica el documento y, solo si es contrato_venta, extrae los campos como JSON único.",
          },
        ],
      },
    ],
  });

  const textBlock = msg.content.find((b: { type: string }) => b.type === "text") as
    | { text?: string }
    | undefined;
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

  const documentClass = normalizeDocumentClass(extracted.document_class);

  if (documentClass !== "contrato_venta") {
    const kindLabel: Record<DocumentClass, string> = {
      contrato_venta: "contrato de venta",
      documento_otro: "documento distinto del formulario",
      captura_app: "captura de pantalla",
      ilegible: "ilegible o no válida como formulario",
    };
    const head = `No es un contrato de venta — clasificación: ${documentClass} (${kindLabel[documentClass]}).`;
    const prev = extracted.notes != null ? String(extracted.notes).trim() : "";
    const notesCombined = prev ? `${head} ${prev}` : head;

    const { data: contract, error: insErr } = await supabase
      .from("contracts")
      .insert({
        created_by: job.created_by as string,
        storage_path: job.storage_path as string,
        batch_id: job.batch_id ?? null,
        job_id: job.id as string,
        original_filename: (job.original_filename as string | null) ?? null,
        status: "needs_review",
        document_class: documentClass,
        nif_valid: null,
        extraction_raw: extracted,
        extraction_confidence:
          extracted.confidence !== undefined ? Number(extracted.confidence) : null,
        notes: notesCombined.slice(0, 8000),
        content_sha256: (job.content_sha256 as string | null) ?? null,
      })
      .select("id")
      .single();

    if (insErr) throw new Error(`insert: ${insErr.message}`);

    await supabase
      .from("jobs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        contract_id: contract!.id,
        last_error: null,
      })
      .eq("id", job.id as string);

    console.log(`[job ${job.id}] done → contract ${contract!.id} (needs_review, ${documentClass})`);
    return;
  }

  const nifStr = str(extracted.nif);
  const nifValid = validateSpanishPersonalId(nifStr);

  const { data: dups } = await supabase.rpc("find_duplicates", {
    p_nif: nifStr ?? null,
    p_fecha_promocion: extracted.fecha_promocion ?? null,
    p_num_albaran: str(extracted.num_albaran),
    p_exclude_id: null,
  });
  const hasDups = (dups ?? []).length > 0;
  const lowConfidence =
    extracted.confidence === undefined ||
    Number(extracted.confidence) < LOW_CONFIDENCE_THRESHOLD;
  const badNif = nifStr != null && nifStr.length > 0 && nifValid === false;

  const status =
    hasDups || lowConfidence || badNif ? "needs_review" : "auto_saved";

  const { data: contract, error: insErr } = await supabase
    .from("contracts")
    .insert({
      created_by: job.created_by,
      storage_path: job.storage_path,
      batch_id: job.batch_id,
      job_id: job.id,
      original_filename: job.original_filename ?? null,
      status,
      document_class: "contrato_venta",
      nif_valid: nifStr ? nifValid : null,
      extraction_raw: extracted,
      extraction_confidence:
        extracted.confidence !== undefined ? Number(extracted.confidence) : null,
      notes: str(extracted.notes),
      num_albaran: str(extracted.num_albaran),
      fecha_promocion: str(extracted.fecha_promocion),
      fecha_entrega: str(extracted.fecha_entrega),
      hora_entrega: str(extracted.hora_entrega),
      nombre: str(extracted.nombre),
      apellido_1: str(extracted.apellido_1),
      apellido_2: str(extracted.apellido_2),
      nif: nifStr,
      telefono: str(extracted.telefono),
      otros_telefonos: str(extracted.otros_telefonos),
      fecha_nacimiento: str(extracted.fecha_nacimiento),
      pais_nacimiento: str(extracted.pais_nacimiento),
      estado_civil: str(extracted.estado_civil),
      direccion: str(extracted.direccion),
      localidad: str(extracted.localidad),
      cod_postal: str(extracted.cod_postal),
      provincia: str(extracted.provincia),
      banco: str(extracted.banco),
      iban: str(extracted.iban),
      articulos: str(extracted.articulos),
      importe_total: num(extracted.importe_total),
      num_cuotas:
        extracted.num_cuotas == null || extracted.num_cuotas === ""
          ? null
          : Math.trunc(Number(extracted.num_cuotas)),
      cuota_mensual: num(extracted.cuota_mensual),
      content_sha256: job.content_sha256 ?? null,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`insert: ${insErr.message}`);

  await supabase
    .from("jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      contract_id: contract!.id,
      last_error: null,
    })
    .eq("id", job.id as string);

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
      } catch (_) {
        // Manejado dentro de processOneSafely
      }
    }
  });
  await Promise.all(runners);
}

async function processOneSafely(job: Record<string, unknown>) {
  try {
    await processJob(job);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[job ${job.id}] error: ${msg}`);
    const attempts = Number(job.attempts);
    const finalStatus = attempts >= 3 ? "failed" : "pending";
    await supabase
      .from("jobs")
      .update({
        status: finalStatus,
        last_error: msg,
        finished_at: finalStatus === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", job.id as string);
  }
}

Deno.serve(async (_req: Request) => {
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

  return new Response(JSON.stringify({ processed: list.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
