/**
 * Validación del dígito/letra de control para DNI y NIE (España), algoritmo módulo 23.
 */

const MOD23_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function niePrefixToDigit(c: string): string {
  if (c === "X") return "0";
  if (c === "Y") return "1";
  if (c === "Z") return "2";
  return "";
}

/** DNI numérico 8 dígitos + letra (sin guiones/espacios, ya normalizado). */
function isValidDni(normalized: string): boolean {
  if (!/^\d{8}[A-Z]$/.test(normalized)) return false;
  const num = parseInt(normalized.slice(0, 8), 10);
  const letter = normalized[8];
  return MOD23_LETTERS[num % 23] === letter;
}

/** NIE X|Y|Z + 7 dígitos + letra. */
function isValidNie(normalized: string): boolean {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(normalized)) return false;
  const mapped = niePrefixToDigit(normalized[0]) + normalized.slice(1, 8);
  const num = parseInt(mapped, 10);
  const letter = normalized[8];
  return MOD23_LETTERS[num % 23] === letter;
}

export type NifValidation = {
  /** null si no hay NIF; true/false si hay cadena no vacía */
  valid: boolean | null;
  /** formato reconocido como DNI o NIE (con letra coherentemente comprobada) */
  format: "dni" | "nie" | null;
};

/**
 * Espera cadena ya normalizada (mayúsculas, sin espacios), como guarda BD.
 */
export function validateSpanishPersonalId(normalizedUpper: string | null | undefined): NifValidation {
  const s = normalizedUpper?.trim() ?? "";
  if (!s) return { valid: null, format: null };
  if (isValidDni(s)) return { valid: true, format: "dni" };
  if (isValidNie(s)) return { valid: true, format: "nie" };
  if (/^\d{8}[A-Z]$/.test(s) || /^[XYZ]\d{7}[A-Z]$/.test(s)) return { valid: false, format: null };
  return { valid: false, format: null };
}
