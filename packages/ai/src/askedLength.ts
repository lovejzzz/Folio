import { draftTop, lessonPieces, pieceSides, segmentsFor, sidesApart, type Apart, type Course, type Lesson, type PieceSides } from '@folio/core';
import type { Problem } from './jobs';

/**
 * A part being written, held to what the lesson's other materials already say of the same piece of work: its length, its
 * minutes, its points. A reading of sixteen fresh lessons found a paragraph the plan and its slide asked "in about six
 * sentences" and the piece and its rubric "of about three": each was written from the other's words, and nothing compared
 * them. The part being written is asked once more; what stands, the teacher's own included, is never changed from here,
 * and what cannot be told to be about this piece is left for the lesson's list (`termsApart`), not asked for.
 */

const SIDE = { plan: 'the plan', slides: 'the slide', piece: 'the piece', rubric: 'its rubric' } as const;
const TERM = { length: 'length', minutes: 'time', points: 'points' } as const;

function problem(x: Apart, path: string, keeps: string): Problem {
  const both = `${SIDE[x.a.side]} says ${x.a.says} and ${SIDE[x.b.side]} ${x.b.says}`;
  return {
    index: null,
    flag: { code: 'schemaIssue', values: { path, issue: `Of "${x.toward}", ${both}: ${keeps} ${x.a.says}` } },
    left: { code: 'reviewNote', values: { where: x.toward, text: `${both[0]!.toUpperCase()}${both.slice(1)} (${TERM[x.term]}). Students should be told one: change one of them.` } },
  };
}

const inClass = (lesson: Lesson) => lesson.homework.kind === 'inclass' && Boolean(lesson.homework.toward.trim()) && lesson.homework.standing !== true;

/**
 * A piece that says, or whose rubric scores, another length, time or total than it is held to. A piece done in class is
 * held to the plan that runs it; any piece's rubric to what the piece itself asks.
 */
export function otherLength(v: { prompt: string; steps: string[]; rubric: { levels: { points: number }[]; criteria: { descriptors: string[] }[] } }, course: Course, lesson: Lesson): Problem[] {
  const segments = inClass(lesson) ? segmentsFor(course, lesson, lesson.segments) : [];
  const sides: PieceSides = {
    toward: lesson.homework.toward.trim(),
    plan: segments.map((s) => s.description).join('\n'),
    planMinutes: segments.reduce((n, s) => n + s.minutes, 0),
    slides: '',
    task: v,
    rubric: v.rubric.criteria.length ? draftTop(v.rubric) : undefined,
  };
  return sidesApart(sides).filter((x) => x.sure).slice(0, 1).map((x) => problem(x, x.b.side === 'rubric' || x.a.side === 'rubric' ? 'rubric' : 'steps', 'the piece and every level of its rubric keep to'));
}

/**
 * A plan written again where the lesson's piece already stands: the piece is what students were given and what its rubric
 * scores, so the plan says its length and its time.
 */
export function planOtherLength(segments: readonly { title: string; description: string; minutes: number }[], course: Course, lesson: Lesson): Problem[] {
  const standing = new Map(pieceSides(course, lesson).map((s) => [s.toward, s]));
  return lessonPieces(lesson).flatMap((homework): Problem[] => {
    const was = standing.get(homework.toward.trim());
    if (!was?.task) return [];
    const mine = segmentsFor(course, { homework }, segments);
    const sides: PieceSides = { ...was, slides: '', rubric: undefined, plan: mine.map((s) => s.description).join('\n'), planMinutes: mine.reduce((n, s) => n + s.minutes, 0) };
    // Said from the piece's side: the piece stands, and the plan is what is being written.
    return sidesApart(sides).filter((x) => x.sure && x.a.side === 'plan' && x.b.side === 'piece').slice(0, 1)
      .map((x) => problem({ ...x, a: x.b, b: x.a }, 'segments', 'the piece is already written, so the segment that runs it says'));
  });
}

/** A deck whose slides for a piece say another length, time or total than the piece, or than the plan where no piece is written. */
export function slidesOther(v: { slides: { title: string; bullets: string[]; segment: number }[] }, course: Course, lesson: Lesson): Problem[] {
  const standing = pieceSides(course, lesson);
  return lessonPieces(lesson).flatMap((homework): Problem[] => {
    const was = standing.find((s) => s.toward === homework.toward.trim());
    if (!was) return [];
    // A draft's slide names its segment by its number in the plan.
    const mine = new Set(segmentsFor(course, { homework }, lesson.segments).map((s) => lesson.segments.indexOf(s) + 1));
    const slides = v.slides.filter((s) => mine.has(s.segment)).map((s) => JSON.stringify([s.title, s.bullets])).join('\n');
    return sidesApart({ ...was, slides }).filter((x) => x.sure && x.b.side === 'slides').slice(0, 1).map((x) => problem(x, 'slides', 'the slides of that segment say'));
  });
}
