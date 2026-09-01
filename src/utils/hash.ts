import { createHash } from 'node:crypto';

/**
 * Serializa con las claves ordenadas en todos los niveles, para que
 * {"a":1,"b":2} y {"b":2,"a":1} produzcan el mismo hash. Sin esto, un cliente
 * que reordene el JSON al reintentar parecería estar enviando otro cuerpo.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);

  return `{${entries.join(',')}}`;
}

/** SHA-256 en hexadecimal (64 caracteres) del cuerpo de la peticion. */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body ?? {})).digest('hex');
}
