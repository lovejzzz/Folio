import { SHEET, type Drawn } from './program';

/**
 * What Folio looks for in a drawn card before a slide shows it. The skill's own checker looks at the page in a
 * browser; these read the SVG the card wrote, so they run the same in the drawing frame and on the command line.
 * Each fault is said as the writer can act on it, and goes back to the writer once.
 *
 * Beside the skill's checks (nothing drew, NaN in the drawing, no part to touch, a long note, writing past the edge)
 * there are two of Folio's own. A drawing says only the numbers its slide gives, or ones worked from two of them:
 * a made-up figure in a picture reads as a fact. And a drawing for a slide that asks a question does not answer it:
 * a pilot drawing for a multiple-choice slide wrote the right choice under its last balance.
 */

export interface SlideWords {
  /** Everything the slide says: its title, its points and its visual's words. */
  text: string;
  /** The choices of a question the slide asks, without their letters: none of them may appear in the drawing. */
  choices: string[];
}

const NOTE_MAX = 150;
const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export interface Writing {
  text: string;
  x: number;
  y: number;
  size: number;
  anchor: string;
  cap: boolean;
  turned: boolean;
}

/** Every line of writing the card put on its sheet, with where it stands. */
export function writingOf(body: string): Writing[] {
  return [...body.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const attr = (name: string): string => m[1]!.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
    return { text: unescape(m[2]!), x: Number(attr('x')), y: Number(attr('y')), size: Number(attr('font-size')) || 17, anchor: attr('text-anchor') || 'start', cap: /\bcap\b/.test(attr('class')), turned: attr('transform') !== '' };
  });
}

/** The kit's own estimate of a line's width (`textW`), so the check agrees with where the card placed its labels. */
const widthOf = (w: Writing): number => w.text.length * w.size * (w.cap ? 0.65 : 0.557);

function pastTheEdge(w: Writing): boolean {
  if (w.turned || !w.text.trim()) return false;
  const width = widthOf(w);
  const left = w.anchor === 'middle' ? w.x - width / 2 : w.anchor === 'end' ? w.x - width : w.x;
  return left < -2 || left + width > SHEET.w + 2 || w.y - w.size * 0.75 < -2 || w.y > SHEET.h + 2;
}

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const numbersIn = (s: string): number[] => (s.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, '')));

/** Numbers that may stand in a drawing: the slide's, and what two of them make by one step of arithmetic. */
function allowedNumbers(slide: string): Set<string> {
  const given = [...new Set(numbersIn(slide))].slice(0, 60);
  const ok = new Set<number>(given);
  // Parts of a whole: the sum of them all, and each one's share of it.
  const total = given.reduce((s, v) => s + v, 0);
  ok.add(total);
  if (total) for (const a of given) ok.add(Math.round(((100 * a) / total) * 100) / 100);
  for (const a of given)
    for (const b of given) {
      for (const v of [a + b, a - b, a * b, b ? a / b : NaN, b ? (100 * a) / b : NaN]) if (Number.isFinite(v) && v >= 0) ok.add(Math.round(v * 100) / 100);
    }
  return new Set([...ok].flatMap((v) => [String(v), String(Math.round(v)), v.toFixed(1), v.toFixed(2)]));
}

/** A number in the drawing that the slide does not give: a single digit is a count or a step and is let be. */
function madeUp(words: string[], slide: string): string[] {
  const ok = allowedNumbers(slide);
  const seen = words.flatMap((s) => s.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ''));
  return [...new Set(seen.filter((n) => n.replace('.', '').length > 1 && !ok.has(n) && !ok.has(String(Number(n)))))];
}

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

/** The faults of one drawn card, for a slide that says what `slide` holds. None means it may be shown. */
export function drawingFaults(drawn: Drawn, slide: SlideWords): string[] {
  const faults: string[] = [];
  const writing = writingOf(drawn.body);
  const words = [...writing.map((w) => w.text), drawn.note, ...drawn.parts, drawn.of];
  if (/NaN|undefined/.test(drawn.body)) faults.push('NaN or undefined is in the drawing: a value was missing where a number or a word was needed.');
  if (!drawn.parts.length) faults.push('Nothing in the drawing can be touched: wrap every mark that carries the slide’s content in PT(note, fn).');
  const long = [drawn.note, ...drawn.parts].filter((n) => n.length > NOTE_MAX);
  if (long.length) faults.push(`Notes over ${NOTE_MAX} characters: ${long.map((n) => `“${n.slice(0, 50)}…”`).join(', ')}.`);
  const out = writing.filter(pastTheEdge).map((w) => w.text);
  if (out.length) faults.push(`Writing runs past the edge of the 520 × 420 sheet: ${out.slice(0, 6).map((t) => `“${t}”`).join(', ')}. Keep 14 px clear at every edge.`);
  const invented = madeUp(words, slide.text);
  if (invented.length) faults.push(`Numbers the slide does not give: ${invented.slice(0, 8).join(', ')}. Use only the slide’s numbers, or ones worked from two of them.`);
  const all = plain(words.join(' '));
  const told = slide.choices.map(plain).filter((c) => c.length >= 8 && all.includes(c));
  if (told.length || (slide.choices.length && /\([A-F]\)|\banswer\b/i.test(words.join(' ')))) faults.push('The slide asks a question and the drawing answers it or lists its choices: draw only what the question gives, and leave the choosing to the students.');
  return faults;
}
