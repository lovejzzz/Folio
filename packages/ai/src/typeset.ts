/**
 * Models write straight quotes ("like this", it's); a printed page uses curly
 * ones. English text from the model is set with “ ” ‘ ’ before it is stored.
 * Primes after digits (5' 3") and anything in an `expression` stay as written.
 */
export function smartQuotes(text: string): string {
  return (
    text
      // Apostrophes inside or at the end of words: it's, students', '90s stays below.
      .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
      .replace(/(\p{L}s)'(?=[\s.,;:!?)]|$)/gu, '$1’')
      // Double quotes: opening after a start, space or bracket; otherwise closing. Primes after digits stay.
      .replace(/(^|[\s([{—–-])"/gu, '$1“')
      .replace(/(?<!\d)"/g, '”')
      // Single quotes used as quotation marks.
      .replace(/(^|[\s([{—–-])'/gu, '$1‘')
      .replace(/(?<!\d)'/g, '’')
  );
}

/** Apply `smartQuotes` to every string in a model's answer (English only), leaving calculations alone. */
export function typesetDraft<T>(value: T, language: string): T {
  if (language !== 'en') return value;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key === 'expression' ? v : smartQuotes(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}
