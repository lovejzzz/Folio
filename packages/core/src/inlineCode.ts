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
  /** Set on a maths token (β̂, x̄, Σ): it takes the reading face, which has the Greek and sets hats on their letters. */
  math?: true;
  /**
   * A combining mark over a Greek letter (β̂, σ̂, θ̄), kept apart: no face we ship
   * anchors marks on Greek, so the page draws it centred over the letter. The
   * run's text is the letter; exporters write text + accent.
   */
  accent?: string;
  /** The letter rises above the x-height (β, δ, θ, capitals), so its accent sits higher. */
  tall?: true;
}

const CODE = /`([^`\n]+)`/g;
// Not global: test() on a global pattern moves its lastIndex, and matchAll starts from there.
const ANY_CODE = /`[^`\n]+`/;
/** "_educ" after a lone letter (β̂_educ, x_ik); "^2" after a letter, digit or bracket (R^2, e^{0.092}). */
const MARKED = String.raw`(?:(?<=(?:^|[^\p{L}\p{N}_])\p{L}\p{M}*)_|(?<=(?:[\p{L}\p{N})\]]|\p{M}))\^)(?:\{([^{}\n]{1,24})\}|([−-]?[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:\.\p{N}+)?))`;

/**
 * Unicode's own sub- and superscript characters (x₁, xᵢ, R², X⁻¹). The web
 * fonts have few of them, so a page mixed faces and sizes; drawn as ordinary
 * letters in a sub or sup they match β̂_educ and the text around them.
 */
const SUB: Record<string, string> = {
  ...Object.fromEntries([...'₀₁₂₃₄₅₆₇₈₉'].map((c, i) => [c, String(i)])),
  '₊': '+', '₋': '−', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
  'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v', 'ᵦ': 'β', 'ᵧ': 'γ', 'ᵨ': 'ρ', 'ᵩ': 'φ', 'ᵪ': 'χ', 'ⱼ': 'j',
};
const SUP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i',
};
const chars = (map: Record<string, string>) => Object.keys(map).join('');
const SCRIPT = new RegExp(String.raw`${MARKED}|([${chars(SUB)}]+)|([${chars(SUP)}]+)`, 'gu');
const ANY_SCRIPT = new RegExp(SCRIPT.source, 'u');
/** A word holding Greek or a combining mark. */
const MATH = /[^\s]*[\p{Script=Greek}\u0300-\u036f][^\s]*/gu;
const ANY_MATH = /[\p{Script=Greek}\u0300-\u036f]/u;

const GREEK_ACCENT = /(\p{Script=Greek})([\u0302\u0303\u0304\u0307\u0308])/gu;
const TALL = /[βδζθλξφψϑϕ\p{Lu}]/u;

/** One run with where it sits in the stored text: `inner` is where its shown text starts. */
interface Span extends TextRun {
  at: number;
  inner: number;
  end: number;
}

/** Plain text, its maths words split out and flagged. */
function plain(text: string, from: number, to: number, out: Span[]): void {
  const segment = text.slice(from, to);
  let at = 0;
  for (const m of segment.matchAll(MATH)) {
    if (m.index > at) out.push({ text: segment.slice(at, m.index), code: false, at: from + at, inner: from + at, end: from + m.index });
    accents(m[0], from + m.index, out);
    at = m.index + m[0].length;
  }
  if (at < segment.length) out.push({ text: segment.slice(at), code: false, at: from + at, inner: from + at, end: to });
}

/** A maths word, each accented Greek letter in it split out. */
function accents(word: string, from: number, out: Span[]): void {
  let at = 0;
  for (const m of word.matchAll(GREEK_ACCENT)) {
    if (m.index > at) out.push({ text: word.slice(at, m.index), code: false, math: true, at: from + at, inner: from + at, end: from + m.index });
    const [, letter, mark] = m;
    out.push({ text: letter!, code: false, math: true, accent: mark!, ...(TALL.test(letter!) ? { tall: true as const } : {}), at: from + m.index, inner: from + m.index, end: from + m.index + m[0].length });
    at = m.index + m[0].length;
  }
  if (at < word.length) out.push({ text: word.slice(at), code: false, math: true, at: from + at, inner: from + at, end: from + word.length });
}

/** An email or web address: its underscores and carets are part of it, never a sub- or superscript. */
const ADDRESS = /(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/giu;

function scripts(text: string, from: number, to: number, out: Span[]): void {
  const segment = text.slice(from, to);
  const addresses = segment.includes('@') || /https?:|www\./i.test(segment) ? [...segment.matchAll(ADDRESS)].map((m) => [m.index, m.index + m[0].length] as const) : [];
  let at = 0;
  for (const m of segment.matchAll(SCRIPT)) {
    if (addresses.some(([start, end]) => m.index >= start && m.index < end)) continue;
    if (m.index > at) plain(text, from + at, from + m.index, out);
    const [, braced, word, sub, sup] = m;
    const unicode = sub ?? sup;
    const before = out.at(-1);
    out.push({
      text: unicode ? [...unicode].map((c) => (sub ? SUB : SUP)[c]).join('') : (braced ?? word)!,
      code: false,
      script: m[0][0] === '_' || sub ? 'sub' : 'sup',
      // A script hanging off a maths word (β₀, β̂_educ) is set in the same face.
      ...(before?.math && before.end === from + m.index ? { math: true as const } : {}),
      at: from + m.index,
      inner: from + m.index + (unicode ? 0 : braced !== undefined ? 2 : 1),
      end: from + m.index + m[0].length,
    });
    at = m.index + m[0].length;
  }
  if (at < segment.length) plain(text, from + at, to, out);
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

/** Whether any of the text is drawn apart: code, a sub- or superscript, or a maths word. */
export function hasMarks(text: string): boolean {
  return ANY_CODE.test(text) || ANY_SCRIPT.test(text) || ANY_MATH.test(text);
}

/** The text in runs, in order. Plain text comes back as one run. */
export function textRuns(text: string): TextRun[] {
  const runs = spans(text).map(
    ({ text: t, code, script, math, accent, tall }): TextRun => ({ text: t, code, ...(script ? { script } : {}), ...(math ? { math } : {}), ...(accent ? { accent } : {}), ...(tall ? { tall } : {}) }),
  );
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
