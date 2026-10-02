const MAX_BASE = 120;

/** Characters Windows or macOS refuse in file names, plus control characters. */
function clean(part: string): string {
  return part
    .normalize('NFC')
    .replace(/[\\/|]/g, '-')
    .replace(/[:*?"<>]/g, '')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

const MAX_SCOPE = 60;
/** Most file systems hold a name of 255 bytes; CJK letters take three each. */
const MAX_BYTES = 200;
const bytes = (text: string) => new TextEncoder().encode(text).length;
/** Names Windows keeps for devices: a file can't be called one. */
const RESERVED = /^(?:con|prn|aux|nul|com\d|lpt\d)$/i;

/** Shortened to fit both a count of letters and of bytes. */
function fit(text: string, max: number, maxBytes: number): string {
  let out = truncate(text, max);
  for (let n = Array.from(out).length; bytes(out) > maxBytes && n > 1; n--) out = truncate(text, n - 1);
  return out;
}

/**
 * A readable, filesystem-safe file name that keeps CJK and other letters:
 * "Course — Part (Teacher copy).docx", or with a scope such as one lesson,
 * "Course — Lesson 2 · Samples and bias — Part (Teacher copy).docx". Empty
 * parts are left out. When the name runs long the course title is shortened
 * first, then the part; whose copy it is always stays, so a teacher's copy
 * with the answers is never named like the students'.
 */
export function slugFilename(courseTitle: string, part: string, audienceLabel: string, ext: string, scope = ''): string {
  const title = clean(courseTitle).replace(/^[. ]+/, '') || 'Folio';
  const audience = clean(audienceLabel);
  const suffix = audience ? ` (${audience})` : '';
  const room = MAX_BASE - Array.from(suffix).length;
  const cleanScope = truncate(clean(scope), MAX_SCOPE);
  const scopePart = cleanScope ? ` — ${cleanScope}` : '';
  const cleanPart = clean(part) ? ` — ${truncate(clean(part), Math.max(12, room - 23 - Array.from(scopePart).length))}` : '';
  const tail = `${scopePart}${cleanPart}`;
  const named = `${truncate(title, Math.max(20, room - Array.from(tail).length))}${tail}`;
  const base = fit(named, room, MAX_BYTES - bytes(suffix)).replace(/[. ]+$/, '') || 'Folio';
  const extension = ext.replace(/^\.+/, '').replace(/[^A-Za-z0-9]/g, '');
  const whole = `${RESERVED.test(base) && !suffix ? `${base}_` : base}${suffix}`.replace(/[. ]+$/, '');
  return extension ? `${whole}.${extension}` : whole;
}
