import { newId, type Lesson } from '@folio/core';
import type { SlidesDraft } from './schemas';

/**
 * A deck in step with its plan. Slides had no tie to the plan's segments, and two faults of a reading of twelve
 * lessons came of it: a week of four meetings was given one meeting's ten slides, and the close of one meeting stood
 * on a slide with the opening of the next; and a segment worked from a sheet had no slide, so the slide before it
 * stayed on the screen through it. Each slide now says its segment, and what follows is checked or made by rule.
 */

type Draft = SlidesDraft['slides'][number];
const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The segments whose items for the screen a slide carries, by number from 1. */
function carried(slide: Draft, lesson: Lesson): number[] {
  const words = plain([slide.title, ...slide.bullets, ...(slide.table ? [...slide.table.columns, ...slide.table.rows.flat()] : []), ...(slide.steps?.steps.flatMap((x) => [x.title, x.detail]) ?? []), ...(slide.compare ? [...slide.compare.sides.flatMap((x) => [x.title, ...x.points]), slide.compare.ask] : [])].join(' '));
  return lesson.segments.flatMap((s, i) => ((s.shown ?? []).some((item) => plain(item).length >= 12 && words.includes(plain(item).slice(0, 40))) ? [i + 1] : []));
}

/** What is out of step, each as the slides' writer can put it right: asked for once, as the deck's other faults are. */
export function outOfStep(v: SlidesDraft, lesson: Lesson): string[] {
  const out: string[] = [];
  const given = v.slides.map((s) => s.segment).filter((n) => n > 0);
  if (given.some((n, i) => i > 0 && n < given[i - 1]!)) out.push('The slides are not in the order of the plan\'s segments: put each where its segment comes');
  for (const slide of v.slides) {
    const meetings = new Set(carried(slide, lesson).map((n) => lesson.segments[n - 1]!.session));
    if (meetings.size > 1) out.push(`The slide "${slide.title}" carries what two meetings show: give each meeting's items a slide of their own, in that meeting's place`);
  }
  return out;
}

/**
 * A slide for every segment that is worked from a sheet and has none: it names the sheet, so the screen says what the
 * room is doing and the slide before it is not left up. Made by rule from the lesson's own sheets; only in a deck whose
 * slides say their segments, since without them there is no saying where it goes.
 */
export function withSheetSlides(slides: Draft[], lesson: Lesson, lead: (sheets: string[]) => string, withSlides: (session: number) => boolean = () => true): Draft[] {
  if (!slides.some((s) => s.segment > 0)) return slides;
  let out = slides;
  lesson.segments.forEach((seg, i) => {
    const n = i + 1;
    const sheets = lesson.handouts.filter((h) => same(h.usedIn, seg.title)).map((h) => h.title);
    // A meeting that runs without slides (a recitation, a lab) is given none.
    if (!sheets.length || !withSlides(seg.session) || out.some((s) => s.segment === n)) return;
    // After the last slide of an earlier segment: before a closing slide, which has no segment.
    const before = out.reduce((at, s, k) => (s.segment > 0 && s.segment < n ? k : at), 0);
    const made: Draft = { layout: 'bullets', title: seg.title, bullets: [lead(sheets)], notes: '', segment: n };
    out = [...out.slice(0, before + 1), made, ...out.slice(before + 1)];
  });
  return out;
}

/**
 * A plan written again keeps the id of every segment that keeps its title: slides say which segment they are shown in
 * by its id, and a plan written again with new ids throughout left every slide of the deck tied to nothing. A segment
 * that is new, renamed, or one of two of a name gets a new id, and what was tied to the old one is then tied to nothing,
 * which the deck's own "needs updating" already says.
 */
export function keptIds<T extends { title: string }>(written: T[], before: readonly { id: string; title: string }[]): (T & { id: string })[] {
  const key = (title: string) => title.trim().toLowerCase();
  const once = (list: readonly { title: string }[], title: string) => list.filter((x) => key(x.title) === key(title)).length === 1;
  return written.map((s) => {
    const old = once(written, s.title) && once(before, s.title) ? before.find((x) => key(x.title) === key(s.title)) : undefined;
    return { ...s, id: old?.id ?? newId('x') };
  });
}


/**
 * The cases of a lesson written without a plan that no slide of its deck teaches. A real deck of a week on units,
 * vectors and the dot product had eight slides, all on units, and the quiz written from the same facts asked for
 * components and a dot product nobody had been shown. A case is taught where a slide carries its name, its question,
 * or most of its own numbers. Asked for once more, and said on the deck if still missing.
 */
export function untaught(v: SlidesDraft, lesson: Lesson): string[] {
  if (lesson.segments.length || !lesson.cases.length) return [];
  const deck = v.slides.map((s) => [s.title, ...s.bullets, s.notes, ...(s.table ? [...s.table.columns, ...s.table.rows.flat()] : [])].join(' ')).join('\n');
  const words = plain(deck);
  const numbers = (text: string) => [...new Set(text.match(/\d+(?:\.\d+)?/g) ?? [])].filter((n) => n.length >= 2);
  return lesson.cases
    .filter((c) => {
      const own = numbers(c.known);
      const shown = own.filter((n) => deck.includes(n)).length;
      // Or most of the words of its name, a plural apart: "Two candidate fall-time formulas" is taught by "Which fall-time formula can be correct?".
      const named = [...new Set(c.title.toLowerCase().match(/\p{L}{4,}/gu) ?? [])].map((w) => w.replace(/s$/, ''));
      const said = named.filter((w) => deck.toLowerCase().includes(w)).length;
      return !words.includes(plain(c.title)) && !words.includes(plain(c.question).slice(0, 40)) && !(own.length >= 2 && shown / own.length >= 0.6) && !(named.length >= 3 && said / named.length >= 0.75);
    })
    .map((c) => c.title);
}

/**
 * Meetings of the lesson that put things on the screen and have no slide of the deck's own. A real deck of a week of
 * three lectures and a recitation had nine slides, all for the first lecture: the others' equations, worked examples
 * and prompts were on no slide, and only the slides that send students to a sheet stood for those meetings.
 */
export function meetingsUnshown(v: SlidesDraft, lesson: Lesson): number[] {
  // A deck that names no segment at all is out of step as a whole, which is said elsewhere: here, only one that names some.
  if (!v.slides.some((x) => x.segment > 0)) return [];
  const session = (n: number) => lesson.segments[n - 1]?.session;
  const drawn = new Set(v.slides.map((s) => session(s.segment)).filter((x) => x !== undefined));
  const showing = new Set(lesson.segments.filter((s) => (s.shown ?? []).some((item) => plain(item).length >= 12)).map((s) => s.session));
  return [...showing].filter((s) => !drawn.has(s)).sort((a, b) => a - b).map((s) => s + 1);
}

/**
 * What is wrong with a deck against its lesson, each as its writer can put it right. Out of step with the plan is
 * asked for once and let be; a case with no slide is kept on the deck when a second writing still leaves it out, so a
 * teacher is told what is not taught.
 */
export function deckFaults(v: SlidesDraft, lesson: Lesson): { issue: string; kept: boolean }[] {
  return [
    ...untaught(v, lesson).map((title) => ({ kept: true, issue: `The lesson's case "${title}" has no slide: the deck teaches every case the lesson was settled with, each on a slide of its own, however many slides that takes` })),
    ...meetingsUnshown(v, lesson).map((n) => ({ kept: true, issue: `Meeting ${n} of this lesson puts things on the screen and the deck has no slide for it: every meeting's on-screen items have slides, each given the number of its own segment` })),
    ...outOfStep(v, lesson).map((issue) => ({ kept: false, issue })),
  ];
}
