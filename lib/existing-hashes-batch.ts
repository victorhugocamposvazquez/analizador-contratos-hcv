/** Límite de hashes por una petición (evita abuso y tamaños absurdos del body). */
export const MAX_HASHES_PER_REQUEST = 60000;

/** Troceo de `.in()` para PostgREST/Postgres con listas grandes. */
export const QUERY_IN_CHUNK_SIZE = 1000;
