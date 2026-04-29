/** URL segment cuando la clave normalizada está vacía (sin datos de localidad). */
export const SIN_LOCALIDAD_SLUG = "sin-localidad";

/** Construye segmento para `/contracts/locality/[...]`. */
export function urlSegmentForNormalizedLocality(localidadNorm: string): string {
  const n = localidadNorm ?? "";
  if (n === "") return SIN_LOCALIDAD_SLUG;
  return encodeURIComponent(n);
}

/**
 * Segmento de ruta (Next lo decodifica) → parámetro `p_localidad_norm` de la BD.
 */
export function normFromUrlSegment(segment: string): string | null {
  if (!segment) return null;
  if (segment === SIN_LOCALIDAD_SLUG) return "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Muestra amigable: primera letra de cada palabra (es). */
export function formatLocalidadDisplayLabel(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "Sin localidad";
  return s
    .split(/\s+/u)
    .map((word) => {
      if (!word.length) return word;
      const lower = word.toLocaleLowerCase("es");
      return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
    })
    .join(" ");
}
