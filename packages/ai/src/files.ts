import { clip, shield } from './prompts';

/** A file's title as a model may give it back: with its extension, in quotes, or with the "##" it was shown after. */
const bareTitle = (title: string) => title.trim().replace(/^#+\s*/, '').replace(/^["'“‘]+|["'”’]+$/g, '').replace(/\.(pdf|docx?|md|markdown|txt|rtf)$/i, '').trim().toLowerCase();
export const sameTitle = (a: string, b: string): boolean => bareTitle(a) === bareTitle(b);

/** What every other file keeps of its start when the syllabus is long: enough to see what it is. */
const FLOOR = 3000;

/**
 * How much of each file a prompt can show, out of one budget. A short file is shown whole and leaves its room to
 * the rest, which share what is left evenly, so a long reading no longer cuts a syllabus as short as itself. The
 * file at `first` (the syllabus) is shown whole when it fits, after every other file keeps at least its start.
 */
export function shareBudget(lengths: number[], budget: number, first = -1): number[] {
  const shares = lengths.map(() => 0);
  let left = budget;
  if (lengths[first] !== undefined) {
    const kept = lengths.reduce((sum, n, i) => (i === first ? sum : sum + Math.min(n, FLOOR)), 0);
    shares[first] = Math.max(0, Math.min(lengths[first], budget - kept));
    left -= shares[first];
  }
  const rest = lengths.map((n, i) => ({ n, i })).filter(({ i }) => i !== first).sort((a, b) => a.n - b.n);
  rest.forEach(({ n, i }, k) => {
    shares[i] = Math.min(n, Math.floor(left / (rest.length - k)));
    left -= shares[i];
  });
  return shares;
}

/** The teacher's files as a prompt shows them: each under its title, cut to its share of the budget. */
export function filesBlock(sources: { title: string; text: string }[], budget: number, syllabus = ''): string {
  const texts = sources.map((s) => shield(s.text));
  const first = syllabus ? sources.findIndex((s) => sameTitle(s.title, syllabus)) : -1;
  const shares = shareBudget(texts.map((t) => t.length), budget, first);
  return sources.map((s, i) => `## ${shield(s.title)}\n${clip(texts[i]!, shares[i]!)}`).join('\n\n');
}
