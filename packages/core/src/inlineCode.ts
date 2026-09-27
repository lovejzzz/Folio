/**
 * Code in course text is marked the way teachers already type it: `lm(y ~ x)`.
 * Fields stay plain strings; the pages, the slides and the exports set each
 * marked run in a monospace face. A lone backtick is just a backtick.
 */
export interface TextRun {
  text: string;
  code: boolean;
}

const CODE = /`([^`\n]+)`/g;
// Not global: test() on a global pattern moves its lastIndex, and matchAll starts from there.
const ANY_CODE = /`[^`\n]+`/;

export function hasCode(text: string): boolean {
  return ANY_CODE.test(text);
}

/** The text in runs, code and not, in order. Plain text comes back as one run. */
export function textRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let at = 0;
  for (const m of text.matchAll(CODE)) {
    if (m.index > at) runs.push({ text: text.slice(at, m.index), code: false });
    runs.push({ text: m[1]!, code: true });
    at = m.index + m[0].length;
  }
  if (at < text.length || !runs.length) runs.push({ text: text.slice(at), code: false });
  return runs;
}

/** The text as it reads, without the marks: for plain-text exports and length checks. */
export function plainText(text: string): string {
  return text.replace(CODE, '$1');
}

/**
 * Where an offset in the text as shown (marks hidden) falls in the text as
 * stored, so a caret placed on the page lands on the same letter once the
 * marks show for editing.
 */
export function storedOffset(text: string, shown: number): number {
  let seen = 0;
  let at = 0;
  for (const m of text.matchAll(CODE)) {
    const before = m.index - at;
    if (shown < seen + before) return at + (shown - seen);
    seen += before;
    const inner = m[1]!.length;
    if (shown < seen + inner) return m.index + 1 + (shown - seen);
    seen += inner;
    at = m.index + m[0].length;
  }
  return Math.min(text.length, at + (shown - seen));
}
