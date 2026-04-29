/** Slug estable para contratos sin localidad (BD null o texto vacío/ solo espacios). */
export const SIN_LOCALIDAD_SLUG = "sin-localidad";

/** Construye el segmento de URL para una localidad guardada tras trim. */
export function localidadToSlug(localidadTrimmedNonEmpty: string): string {
  return encodeURIComponent(localidadTrimmedNonEmpty.trim());
}

/**
 * Interpreta params.slug de `/contracts/localidades/[slug]`.
 * - `""` = bucket sin localidad (`sin-localidad`).
 * - `null` = URI inválida (p. ej. % mal escapado).
 */
export function slugToLocalidadValue(slug: string): "" | string | null {
  if (!slug) return null;
  if (slug === SIN_LOCALIDAD_SLUG) return "";
  try {
    return decodeURIComponent(slug);
  } catch {
    return null;
  }
}
