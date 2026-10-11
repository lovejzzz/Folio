import type { Lesson } from '@folio/core';
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
  const words = plain([slide.title, ...slide.bullets, ...(slide.table ? [...slide.table.columns, ...slide.table.rows.flat()] : [])].join(' '));
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
