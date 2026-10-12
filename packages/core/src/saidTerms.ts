/**
 * What a text says of a piece of work in figures: the length it is written at, the minutes it is given, the points it is
 * out of. Read the same way from a plan, a slide, the piece and its rubric, so that they can be held against each other.
 */

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
const N = `(\\d{1,3}(?:,\\d{3})+|\\d{1,5}|${Object.keys(WORDS).join('|')})`;
const UNIT = '(sentence|word|paragraph|page)s?';
const ASKED = new RegExp(`(?<![\\d.,])\\b(?:${N}\\s*(?:-|–|to|or)\\s*)?${N}[- ](?:(?:short|full|complete|whole)[- ])?${UNIT}\\b`, 'gi');
const MINUTES = new RegExp(`(?<![\\d.,:])\\b${N}[- ]minutes?\\b`, 'gi');
const TOTAL = new RegExp(`\\b(?:out of|total of|totall?ing|worth|for) ${N} points\\b|\\b${N} points (?:in all|in total|total|possible)\\b`, 'gi');

export type LengthUnit = 'sentence' | 'word' | 'paragraph' | 'page';
export interface AskedLength { low: number; high: number; unit: LengthUnit }
export const LENGTH_UNITS = ['sentence', 'word', 'paragraph', 'page'] as const;

const number = (text: string) => WORDS[text.toLowerCase()] ?? Number(text.replace(/,/g, ''));

/** Every length a text asks writing at: "about six sentences", "five or six sentences", "150 to 200 words", "one page". */
export function askedLengths(text: string): AskedLength[] {
  return [...text.matchAll(ASKED)].map((m) => {
    const high = number(m[2]!);
    const low = m[1] ? Math.min(number(m[1]), high) : high;
    return { low, high, unit: m[3]!.toLowerCase() as LengthUnit };
    // A few words are a thing to mark or to say, not a length to write at: "underline one word" stood against a reflection of 60 to 90.
  }).filter((x) => x.unit !== 'word' || x.high >= 10);
}

export const lengthWords = (a: AskedLength) => `${a.low === a.high ? a.high : `${a.low} to ${a.high}`} ${a.unit}${a.high === 1 ? '' : 's'}`;
export const outside = (x: AskedLength, one: AskedLength) => x.high < one.low || x.low > one.high;

/** The one length a text says in a unit, where it says one. */
export function soleLength(text: string, unit: LengthUnit): AskedLength | undefined {
  const said = askedLengths(text).filter((x) => x.unit === unit);
  return said[0] && said.every((x) => x.low === said[0]!.low && x.high === said[0]!.high) ? said[0] : undefined;
}

/** The minutes a text names, each once: "for six minutes", "a 10-minute write". */
export function saidMinutes(text: string): number[] {
  return [...new Set([...text.matchAll(MINUTES)].map((m) => number(m[1]!)))];
}

/** The totals a text says a piece is out of, each once: "out of 12 points", "a total of 12 points", "12 points possible". */
export function saidTotals(text: string): number[] {
  return [...new Set([...text.matchAll(TOTAL)].map((m) => number((m[1] ?? m[2])!)))];
}
