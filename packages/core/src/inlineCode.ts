/**
 * Course text stays plain strings, marked the way teachers already type:
 * code as `lm(y ~ x)`, and a subscript or superscript that Unicode has no
 * character for as β̂_educ, t_{n−k−1} or e^{0.092}. The pages, the slides and
 * the exports set each marked run in its own style. A lone backtick is just a
 * backtick, and snake_case words are left alone: a subscript hangs off a
 * single letter.
 */
export interface TextRun {
  text: string;
  code: boolean;
  /** Set only on a subscript or superscript run. */
  script?: 'sub' | 'sup';
}

const CODE = /`([^`\n]+)`/g;
// Not global: test() on a global pattern moves its lastIndex, and matchAll starts from there.
const ANY_CODE = /`[^`\n]+`/;
/** "_educ" after a lone letter (β̂_educ, x_ik); "^2" after a letter, digit or bracket (R^2, e^{0.092}). */
const SCRIPT = /(?:(?<=(?:^|[^\p{L}\p{N}_])\p{L}\p{M}*)_|(?<=(?:[\p{L}\p{N})\]]|\p{M}))\^)(?:\{([^{}\n]{1,24})\}|([−-]?[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:\.\p{N}+)?))/gu;
const ANY_SCRIPT = new RegExp(SCRIPT.source, 'u');

/** One run with where it sits in the stored text: `inner` is where its shown text starts. */
interface Span extends TextRun {
  at: number;
  inner: number;
  end: number;
}

function scripts(text: string, from: number, to: number, out: Span[]): void {
  const segment = text.slice(from, to);
  let at = 0;
  for (const m of segment.matchAll(SCRIPT)) {
    if (m.index > at) out.push({ text: segment.slice(at, m.index), code: false, at: from + at, inner: from + at, end: from + m.index });
    const braced = m[1] !== undefined;
    out.push({
      text: (m[1] ?? m[2])!,
      code: false,
      script: m[0][0] === '_' ? 'sub' : 'sup',
      at: from + m.index,
      inner: from + m.index + (braced ? 2 : 1),
      end: from + m.index + m[0].length,
    });
    at = m.index + m[0].length;
  }
  if (at < segment.length) out.push({ text: segment.slice(at), code: false, at: from + at, inner: from + at, end: to });
}

function spans(text: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(CODE)) {
    scripts(text, at, m.index, out);
    out.push({ text: m[1]!, code: true, at: m.index, inner: m.index + 1, end: m.index + m[0].length });
    at = m.index + m[0].length;
  }
  scripts(text, at, text.length, out);
  return out;
}

export function hasCode(text: string): boolean {
  return ANY_CODE.test(text);
}

/** Whether any of the text is marked: code, a subscript or a superscript. */
export function hasMarks(text: string): boolean {
  return ANY_CODE.test(text) || ANY_SCRIPT.test(text);
}

/** The text in runs, in order. Plain text comes back as one run. */
export function textRuns(text: string): TextRun[] {
  const runs = spans(text).map(({ text: t, code, script }): TextRun => (script ? { text: t, code, script } : { text: t, code }));
  return runs.length ? runs : [{ text: '', code: false }];
}

/** The text without the code marks: for speaker notes and other plain text. Sub- and superscripts keep theirs, which read as maths. */
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
  for (const s of spans(text)) {
    if (shown < seen + s.text.length) return s.inner + (shown - seen);
    seen += s.text.length;
  }
  return text.length;
}
