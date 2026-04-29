// Extracción de número de documento español desde fotos en bucket `dnis`.
// Cron: igual que process-jobs, nueva URL `/functions/v1/process-dni-jobs`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";

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

function validateSpanishPersonalId(norm: string | null | undefined): boolean | null {
  if (!norm?.trim()) return null;
  if (isValidDni(norm) || isValidNie(norm)) return true;
  return false;
}

const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const BATCH_SIZE = 8;
const CONCURRENCY = 3;
const LOW_CONF_THRESHOLD = 0.75;

const DNI_SYSTEM_PROMPT = `Eres un lector especializado en documentos de identidad españoles (DNIe en formato tarjeta, fotos físicas).

Tarea:
1. Indica si la imagen permite leer el NÚMERO DE SOPORTE del documento (DNI español / NIE) con claridad suficiente.
   - Para DNI: 8 dígitos + una letra (ej: 12345678A).
   - Para NIE: letra inicial X/Y/Z seguida de 7 dígitos + letra final (ej: X1234567L).

2. Campos obligatorios en JSON único:
- document_visible: boolean — true solo si ves claramente un DNI español físico/tarjeta o NIE español reconocibles.
- document_kind: "dni_es" | "nie_es" | "otro" | "desconocido"
- numero_documento: string o null — el identificador SIN espacios ni guiones, mayúsculas (solo el número de soporte como en el modelo impreso electrónico; NO el número OCR de pasaportes extranjeros).
- confidence: number 0..1 — seguridad global en esa lectura.
- notes: string breve opcional solo si algo impide lectura total.

NO inventes cifras. Si la foto es borrosa, parcial (solo cara, solo reverso incompleta), selfie, pantalla borrosa o no es documento español → document_visible=false, numero_documento=null.
Responde SOLO JSON válido sin markdown ni prose.`;

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
  return String(v).trim() || null;
}

function normalizeNumero(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  return s.toUpperCase().replace(/\s/g, "").replace(/-/g, "");
}

async function processDniJob(job: Record<string, unknown>): Promise<void> {
  console.log(`[dni-job ${job.id}] start (attempt ${job.attempts})`);

  const { data: already } = await supabase
    .from("dni_extractions")
    .select("id")
    .eq("dni_job_id", job.id as string)
    .maybeSingle();
  if (already?.id) {
    await supabase
      .from("dni_jobs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", job.id as string);
    console.log(`[dni-job ${job.id}] skip (extracción ya existía)`);
    return;
  }

  const { data: blob, error: dlErr } = await supabase.storage.from("dnis").download(job.storage_path as string);
  if (dlErr || !blob) throw new Error(`download dnis: ${dlErr?.message ?? "no blob"}`);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const base64 = uint8ArrayToBase64(buf);
  const mediaType = (blob.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: DNI_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Extrae numero_documento y metadatos en JSON único." },
        ],
      },
    ],
  });

  const textBlock = msg.content.find((b: { type: string }) => b.type === "text") as
    | { text?: string }
    | undefined;
  if (!textBlock) throw new Error("modelo sin texto");

  const cleaned = String(textBlock.text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(cleaned);
  } catch {
    throw new Error(`JSON inválido: ${cleaned.slice(0, 140)}`);
  }

  const numRaw = normalizeNumero(extracted.numero_documento);
  const confidence = extracted.confidence !== undefined ? Number(extracted.confidence) : null;
  const docVisible =
    extracted.document_visible === true || extracted.document_visible === false
      ? Boolean(extracted.document_visible)
      : true;

  const nifValid = validateSpanishPersonalId(numRaw);
  const lowConf = confidence !== null && !Number.isNaN(confidence) && confidence < LOW_CONF_THRESHOLD;

  let extStatus: "done" | "needs_review" | "failed" = "done";
  let notesCombined: string | null = str(extracted.notes);

  if (!docVisible || str(extracted.document_kind)?.startsWith("descon")) {
    extStatus = "failed";
    if (!notesCombined) notesCombined = "Documento no identificado como DNI/NIE español o ilegible.";
  } else if (!numRaw) {
    extStatus = lowConf ? "needs_review" : "needs_review";
    if (!notesCombined) notesCombined = "No se leyeron 8 dígitos + letra (o formato NIE).";
  } else if (lowConf || nifValid === false || nifValid === null) {
    extStatus = "needs_review";
    if (!notesCombined && nifValid === false) notesCombined = "El número detectado falla la validación de letra (módulo 23).";
  }

  const { data: row, error: insEx } = await supabase
    .from("dni_extractions")
    .insert({
      batch_id: job.batch_id,
      dni_job_id: job.id,
      created_by: job.created_by,
      numero_documento: numRaw,
      nif_valid: numRaw ? nifValid : null,
      extraction_confidence: confidence,
      extraction_raw: extracted,
      notes: notesCombined,
      status: extStatus,
    })
    .select("id")
    .single();

  if (insEx) throw new Error(`insert extraction: ${insEx.message}`);

  await supabase
    .from("dni_jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", job.id as string);

  console.log(`[dni-job ${job.id}] done → extraction ${row!.id} (${extStatus})`);
}

async function processInPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  const queue = [...items];
  const runners = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      try {
        await worker(item);
      } catch {
        // manejado en processOneSafely
      }
    }
  });
  await Promise.all(runners);
}

async function processOneSafely(job: Record<string, unknown>) {
  try {
    await processDniJob(job);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dni-job ${job.id}] error: ${msg}`);
    const attempts = Number(job.attempts);
    const finalStatus = attempts >= 3 ? "failed" : "pending";

    await supabase
      .from("dni_jobs")
      .update({
        status: finalStatus,
        last_error: msg.slice(0, 2000),
        finished_at: finalStatus === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", job.id as string);

    if (finalStatus === "failed") {
      const { data: ef } = await supabase
        .from("dni_extractions")
        .select("id")
        .eq("dni_job_id", job.id as string)
        .maybeSingle();
      if (!ef?.id) {
        await supabase.from("dni_extractions").insert({
          batch_id: job.batch_id,
          dni_job_id: job.id,
          created_by: job.created_by,
          numero_documento: null,
          nif_valid: null,
          extraction_confidence: null,
          extraction_raw: null,
          notes: msg.slice(0, 2000),
          status: "failed",
        });
      }
    }
  }
}

Deno.serve(async (_req: Request) => {
  const { data: jobs, error } = await supabase.rpc("claim_dni_jobs", { p_limit: BATCH_SIZE });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  const list = jobs ?? [];
  if (list.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "no pending dni jobs" }), {
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
