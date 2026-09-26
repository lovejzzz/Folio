/** Short, stable, prefixed IDs: `l_3f9a1c2e` for a lesson, `q_…` for a task. */
export type IdPrefix = 'c' | 'l' | 'o' | 't' | 'r' | 'f' | 's' | 'p' | 'x';

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return `${prefix}_${out}`;
}

/** FNV-1a 32-bit hash of a string, as 8 hex characters. Stable across runs. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function hashValue(value: unknown): string {
  return hashString(JSON.stringify(value));
}
