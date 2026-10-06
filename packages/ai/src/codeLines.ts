import type { Problem } from './jobs';

/**
 * Code a lesson in a room shows is written a line to a pair of backticks. Asked for several lines in a note or a
 * sheet, the writer saved room: every level of indentation became one space and the lines ran on after each other,
 * and a handout asked second-year students which line of a Python function was at fault when none of it could be
 * read. What opens a block in Python must be followed by a line set further in, on a line of its own.
 */
const OPENS = /^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b.*:\s*$/;
const indent = (line: string) => line.length - line.trimStart().length;

/** The first line that opens a block and is not followed by its body, further in and on its own line; or null. */
function squeezedAt(text: string): string | null {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)];
  for (const [i, span] of spans.entries()) {
    const next = spans[i + 1];
    if (!next || !OPENS.test(span[1]!)) continue;
    const between = text.slice(span.index + span[0].length, next.index);
    // Only code that follows at once: a lone `else:` in a sentence is not a listing.
    if (between.trim()) continue;
    if (!between.includes('\n') || indent(next[1]!) <= indent(span[1]!)) return span[1]!.trim();
  }
  return null;
}

/** Every string anywhere in a value, with the items of a list joined as the lines they are. */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string') ? [value.join('\n')] : value.flatMap(texts);
  return value && typeof value === 'object' ? Object.values(value).flatMap(texts) : [];
}

/** What is wrong with the code in a plan or a sheet, as its writer can put it right; at most one, the first found. */
export function codeFaults(value: unknown): Problem[] {
  const at = texts(value).map(squeezedAt).find(Boolean);
  if (!at) return [];
  const issue = `code is written with its indentation squeezed or its lines run together (after \`${at}\`): give each line of code a line of its own, in its own backticks, with its indentation inside them exactly as the code is typed, four spaces to a level`;
  return [{ index: null, flag: { code: 'schemaIssue', values: { path: 'code', issue } } }];
}
