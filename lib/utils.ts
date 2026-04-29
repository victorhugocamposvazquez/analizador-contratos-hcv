export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return d;
  }
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

/** Nombre mostrable: nombre en `contracts` o último segmento del path en bucket. */
export function displayFilename(
  originalFilename: string | null | undefined,
  storagePath: string
): string {
  const t = originalFilename?.trim();
  if (t) return t;
  const last = storagePath.split("/").filter(Boolean).pop();
  return last || storagePath;
}

/** `original_filename` devuelto al embebido `jobs(...)` en la query de Supabase. */
export function originalFilenameFromJobEmbed(jobsField: unknown): string | null {
  if (jobsField == null) return null;
  if (Array.isArray(jobsField)) {
    const row = jobsField[0] as
      | { original_filename?: string | null }
      | undefined;
    return row?.original_filename?.trim() ?? null;
  }
  return (
    (jobsField as { original_filename?: string | null }).original_filename?.trim() ??
    null
  );
}

/** Fila contrato+jobs embebidos: muestra nombre real incluso si aún no hay columna rellena en BD. */
export function displayFilenameResolved(row: {
  original_filename?: string | null;
  storage_path: string;
  jobs?: unknown;
}): string {
  const merged =
    row.original_filename?.trim() ||
    originalFilenameFromJobEmbed(row.jobs) ||
    null;
  return displayFilename(merged, row.storage_path);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
