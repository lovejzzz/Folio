/**
 * Plain text as a field should receive it: Windows and old Mac line endings
 * become \n, no-break spaces become spaces, trailing spaces and the line
 * breaks that copying a paragraph usually brings are dropped, and a
 * single-line field gets its lines joined with spaces.
 */
export function normalisePaste(text: string, multiline: boolean): string {
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+|\n+$/g, '');
  return multiline ? clean : clean.replace(/\s*\n\s*/g, ' ').trim();
}
