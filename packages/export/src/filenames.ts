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

/**
 * A readable, filesystem-safe file name that keeps CJK and other letters:
 * "Course — Part (Teacher copy).docx", or with a scope such as one lesson,
 * "Course — Lesson 2 · Samples and bias — Part (Teacher copy).docx". Empty
 * parts are left out, and the course title is shortened first when the name
 * runs long.
 */
export function slugFilename(courseTitle: string, part: string, audienceLabel: string, ext: string, scope = ''): string {
  const title = clean(courseTitle) || 'Folio';
  const cleanScope = truncate(clean(scope), MAX_SCOPE);
  const cleanPart = clean(part);
  const audience = clean(audienceLabel);
  const tail = `${cleanScope ? ` — ${cleanScope}` : ''}${cleanPart ? ` — ${cleanPart}` : ''}${audience ? ` (${audience})` : ''}`;
  const room = Math.max(20, MAX_BASE - Array.from(tail).length);
  const base = truncate(`${truncate(title, room)}${tail}`, MAX_BASE).replace(/[. ]+$/, '');
  const extension = ext.replace(/^\.+/, '').replace(/[^A-Za-z0-9]/g, '');
  return extension ? `${base}.${extension}` : base;
}
