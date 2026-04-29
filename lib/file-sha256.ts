/** SHA-256 del buffer en hexadecimal minúscula (64 caracteres). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash de un `File` del navegador (para deduplicar subidas). */
export async function fileSha256Hex(file: File): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}
