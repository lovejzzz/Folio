/**
 * A sheet that asks students to find the mistake carries statements that are wrong on purpose. The writer of the keys,
 * told to correct a number or statement it works out as wrong, corrected the three statements of a review sheet ("Each
 * statement below contains one typical error") into true ones: students were handed true statements and asked for the
 * error in each, while the plan and the teacher's notes went on correcting the originals. A correction whose words stand
 * on such a sheet, or in the segment that runs it, is not applied.
 */
const HUNT =
  /\b(?:find|catch|spot|identify|fix|locate|circle|underline)\b[^.?!\n]{0,40}\b(?:mistakes?|errors?|bugs?|slips?|flaws?)\b|\bwhich (?:mistake|error|bug)\b|\bwhat(?:'s| is) wrong\b|\b(?:contains?|has|have|with) (?:one|a|an|exactly one|at least one) (?:\w+ )?(?:mistake|error|bug)s?\b|\bwrong on purpose\b|\bdeliberate(?:ly)? (?:wrong|false|broken|incorrect)\b|\b(?:mistakes?|errors?|bugs?) (?:to|for you to) (?:find|catch|spot|fix|correct)\b/i;

/** Whether words ask students to find what is wrong. */
export const huntsErrors = (text: string): boolean => HUNT.test(text);

const textOf = (value: unknown): string => (typeof value === 'string' ? value : value && typeof value === 'object' ? Object.values(value as Record<string, unknown>).map(textOf).join('\n') : '');

/** The corrections whose words stand on a sheet, or in a segment, that asks students to find the mistake: wrong on purpose, not slips. */
export function wrongOnPurpose(corrections: { find: string }[], sheets: { title: string; blocks: unknown[] }[], segments: { title: string; description: string; shown?: string[] }[]): Set<string> {
  const hunting = [...sheets.map((h) => `${h.title}\n${textOf(h.blocks)}`), ...segments.map((s) => [s.title, s.description, ...(s.shown ?? [])].join('\n'))].filter(huntsErrors);
  return new Set(corrections.filter((c) => c.find.trim() && hunting.some((t) => t.includes(c.find))).map((c) => c.find));
}
