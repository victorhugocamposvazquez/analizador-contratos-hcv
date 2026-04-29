/** Misma lógica que lib/spanish-id.ts — mantener alineadas. */

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

export function validateSpanishPersonalId(normalizedUpper: string | null | undefined): boolean | null {
  const s = normalizedUpper?.trim() ?? "";
  if (!s) return null;
  if (isValidDni(s) || isValidNie(s)) return true;
  return false;
}
