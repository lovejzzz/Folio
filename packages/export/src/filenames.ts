const MAX_BASE = 120;

/** Characters Windows or macOS refuse in file names, plus control characters. */
function clean(part: string): string {
  return part
    .normalize('NFC')
    .replace(/[\\/|]/g, '-')
    .replace(/[:*?"<>]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

/**
 * A readable, filesystem-safe file name that keeps CJK and other letters:
 * "Course — Part (Teacher copy).docx". Empty parts are left out and the
 * course title is shortened first when the name runs long.
 */
export function slugFilename(courseTitle: string, part: string, audienceLabel: string, ext: string): string {
  const title = clean(courseTitle) || 'Folio';
  const cleanPart = clean(part);
  const audience = clean(audienceLabel);
  const tail = `${cleanPart ? ` — ${cleanPart}` : ''}${audience ? ` (${audience})` : ''}`;
  const room = Math.max(20, MAX_BASE - Array.from(tail).length);
  const base = truncate(`${truncate(title, room)}${tail}`, MAX_BASE).replace(/[. ]+$/, '');
  const extension = ext.replace(/^\.+/, '').replace(/[^A-Za-z0-9]/g, '');
  return extension ? `${base}.${extension}` : base;
}
