/**
 * Models write straight quotes ("like this", it's); a printed page uses curly
 * ones. English text from the model is set with “ ” ‘ ’ before it is stored.
 * Primes after digits (5' 3"), code between backticks and anything in an `expression` stay as written.
 */
export function smartQuotes(text: string): string {
  // Code between backticks stays exactly as written: `c('a', 'b')` with curly quotes does not run. Over several
  // lines too, and in a fence of three: a quiz choice that is a whole function had its quotes curled, in the right
  // answer as in the wrong ones, and none of the four would run.
  if (text.includes('`')) return text.split(/(```[\s\S]*?```|`[^`]*`)/).map((part, i) => (i % 2 ? part : curl(part))).join('');
  return curl(text);
}

// A single character between single quotes is a character of code as often as a quotation ('B' in Java, 'a' in C): it stays as typed.
const CHAR = /(^|[\s([{=,:])'(\\?[^\s'])'(?![\p{L}\d])/gu;

function curl(text: string): string {
  return (
    text
      .replace(CHAR, '$1\uE000$2\uE000')
      // Apostrophes inside or at the end of words: it's, students', '90s stays below.
      .replace(/(\p{L})'(?=\p{L})/gu, '$1’')
      .replace(/(\p{L}s)'(?=[\s.,;:!?)]|$)/gu, '$1’')
      // Double quotes: opening after a start, space or bracket; otherwise closing. Primes after digits stay.
      .replace(/(^|[\s([{—–-])"/gu, '$1“')
      .replace(/(?<!\d)"/g, '”')
      // Single quotes used as quotation marks.
      .replace(/(^|[\s([{—–-])'/gu, '$1‘')
      .replace(/(?<!\d)'/g, '’')
      .replace(/\uE000/g, "'")
  );
}

/** Apply `smartQuotes` to every string in a model's answer (English only), leaving calculations alone. */
export function typesetDraft<T>(value: T, language: string): T {
  if (language !== 'en') return value;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key === 'expression' ? v : smartQuotes(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    // A block of code is kept as typed: curly quotes do not compile.
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (v as { type?: unknown }).type === 'code' && k === 'text' ? x : walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}
