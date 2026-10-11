import type { Course, Homework } from '@folio/core';
import type { StatedItem } from './gradingIn';

/**
 * Where a course's recurring work and its tests fall, lesson by lesson, by rule. Decided by the outline each time, three
 * outlines of one brief agreed on what each lesson holds in 137 lessons of 307: "weekly programming labs" were work done in
 * class in two and homework in the third, a recitation's problems were in every lesson in two and only the first in one,
 * a midterm moved a lesson either way. What recurs every lesson and what is sat as a test are read from the brief's own
 * words for each component and placed the same way every time; where a paper or a project is set and due stays the
 * outline's to say, since that follows what the lessons teach.
 */

export interface Form {
  kind: 'test' | 'assignment' | 'inclass';
  /** Every lesson holds a piece of it. */
  every: boolean;
  /** One brief for the whole course. */
  standing: boolean;
  /** Not in the first lesson: nothing can be asked on reading nobody was told to do. */
  fromSecond: boolean;
  /** Sat at the last lesson. */
  last: boolean;
  /** Its lessons are the outline's to name (a paper, a project, a counted assignment). */
  nominated: boolean;
}

const OFTEN = /\bweekly\b|\beach\b|\bevery\b|\bmost\b|\bdaily\b|\bpre-?lab\b/i;

/** What kind of work a component is and how often it comes, from the brief's words for it. */
export function formOf(st: StatedItem): Form {
  const said = `${st.item} ${st.said}`;
  const base = { every: false, standing: false, fromSecond: false, last: false, nominated: false };
  // (every lesson holds it, so every lesson's writers are told of it: held by the first lesson only, a later lesson made up
  // how taking part was observed, or said nothing of the rotation)
  if (/\bparticipation\b|\battendance\b|\bclickers?\b/i.test(said)) return { ...base, kind: 'inclass', every: true, standing: true };
  if (/\bpresentations?\b|\bleadership\b|\bdebates?\b/i.test(said)) return { ...base, kind: 'inclass', every: true, standing: true };
  // (a "final proposal" is a paper: only a final that is the last word of its name, or an exam, is sat)
  if (/\bquiz(?:zes)?\b|\bexams?\b|\bmidterms?\b|\bfinal$|\btests?\b/i.test(st.item)) {
    // Taken at home or online, it is homework with a deadline, not a paper sat in the room.
    if (/\btake-?home\b|\bonline\b/i.test(said)) return { ...base, kind: 'assignment', every: /\bquiz/i.test(st.item) && !st.count, fromSecond: false, nominated: !/\bquiz/i.test(st.item) || Boolean(st.count) };
    const quiz = /\bquiz/i.test(st.item);
    return { ...base, kind: 'test', every: quiz && !st.count && !/\d$/.test(st.item), fromSecond: true, last: /\bfinal\b/i.test(st.item) || /\blast week\b/i.test(said) };
  }
  if (/\breports?\b|\bassignments?\b|\bproblem sets?\b|\bhomework\b|\bpapers?\b|\bessays?\b|\bprojects?\b|\bproposal\b|\bbibliography\b|\bdrafts?\b|\bsection\b|\banalysis\b|\bportfolio\b/i.test(st.item)) {
    const every = !st.count && !/\d$/.test(st.item) && (OFTEN.test(said) || /\bproblem sets\b|\bhomework\b|\bassignments\b/i.test(st.item)) && !/\bevery (?:two|three|other)\b/i.test(said);
    return { ...base, kind: 'assignment', every, standing: every && /\bresponse\b|\bjournals?\b|\bmemos?\b|\breflections?\b/i.test(st.item), nominated: !every };
  }
  if (/\bin-class\b|\brecitation\b|\blabs?\b|\bworksheets?\b|\bnotebook\b|\bworkshops?\b|\bstudio\b/i.test(said)) return { ...base, kind: 'inclass', every: true };
  return { ...base, kind: 'assignment', nominated: true };
}

/** The lessons of `n` that hold the k tests of a run, evenly through the course, never the first lesson or the last. */
function spaced(count: number, n: number): number[] {
  return Array.from({ length: count }, (_, k) => Math.min(Math.max(2, Math.round(((k + 1) * n) / (count + 1))), Math.max(2, n - 1)));
}

/** The pieces the rules place, for each lesson in order. */
export function placedWork(stated: StatedItem[], n: number, tests = true, often = false): Homework[][] {
  const lessons: Homework[][] = Array.from({ length: n }, () => []);
  const forms = stated.map((st) => ({ st, form: formOf(st) }));
  // Tests that are not the last one, a run at a time: "Midterm 1" and "Midterm 2" are one run, the four of "four quizzes"
  // another, each spread through the course on its own; two that fall on one lesson, the later moves on by one.
  const runs = new Map<string, string[]>();
  for (const { st, form } of forms) if (tests && form.kind === 'test' && !form.every && !form.last) runs.set(st.item.replace(/\s+\d+$/, ''), [...(runs.get(st.item.replace(/\s+\d+$/, '')) ?? []), ...Array.from({ length: st.count ?? 1 }, () => st.item)]);
  const taken = new Set<number>();
  for (const run of [...runs.values()].sort((a, b) => a.length - b.length))
    spaced(run.length, n).forEach((at, k) => {
      let free = at;
      while (taken.has(free) && free < n - 1) free += 1;
      taken.add(free);
      lessons[free - 1]!.push({ kind: 'test', toward: run[k]! });
    });
  for (const { st, form } of forms) if (tests && form.kind === 'test' && form.last) lessons[n - 1]!.push({ kind: 'test', toward: st.item });
  for (const { st, form } of forms) {
    if (form.kind === 'inclass' && form.standing && !form.every) lessons[0]!.push({ kind: 'inclass', toward: st.item, standing: true });
    if (!form.every) continue;
    lessons.forEach((held, i) => {
      // (a lesson that is a week of several meetings can sit a quiz at its last meeting on its first ones: left out of the
      // first week, a recitation's quiz was run by the plan from the teacher's notes, and students had no paper)
      if (form.fromSecond && i === 0 && !often) return;
      // A quiz gives way to an exam sat in the same lesson.
      if (form.kind === 'test' && held.some((p) => p.kind === 'test')) return;
      held.push({ kind: form.kind, toward: st.item, ...(form.kind === 'inclass' ? { standing: form.standing } : form.standing ? { standing: true } : {}) });
    });
  }
  return lessons;
}

const ORDER = { test: 0, inclass: 1, assignment: 2, step: 3, none: 4 } as const;

/**
 * The course with its recurring work and tests placed by rule, and the outline's own pieces kept only for the components
 * whose lessons are its to name. A weekly assignment is due at the next lesson.
 */
export function withPlacement(course: Course, stated: StatedItem[], tests: boolean): void {
  const n = course.lessonOrder.length;
  if (!stated.length || n < 2) return;
  const placed = placedWork(stated, n, tests, course.shape.sessions.length > 1);
  // Where the outline was not told the tests' lessons beforehand (its count of lessons was its own), its tests stand.
  const nominated = new Set(stated.filter((st) => formOf(st).nominated || (!tests && formOf(st).kind === 'test' && !formOf(st).every)).map((st) => st.item));
  // A paper is not due in the lesson of a test, nor in the one before it: the week students sit an exam is the week a
  // teacher most often moves a deadline out of. It moves on to the first lesson that is clear.
  const sat = new Set(placed.flatMap((held, i) => (held.some((p) => p.kind === 'test' && !formOf(stated.find((st) => st.item === p.toward)!).every) ? [i] : [])));
  const clear = (at: number) => {
    let to = at;
    while ((sat.has(to) || sat.has(to + 1)) && to < n - 1) to += 1;
    return to;
  };
  course.lessonOrder.forEach((id, i) => {
    const lesson = course.lessons[id]!;
    for (const p of [lesson.homework, ...lesson.also]) if (tests && p.due && nominated.has(p.toward)) p.due = course.lessonOrder[clear(course.lessonOrder.indexOf(p.due))] ?? p.due;
    const kept = [lesson.homework, ...lesson.also].filter((p) => p.kind !== 'none' && (nominated.has(p.toward) || !p.toward.trim() || p.kind === 'step'));
    const ruled = placed[i]!.map((p) => (p.kind === 'assignment' && course.lessonOrder[i + 1] ? { ...p, due: course.lessonOrder[i + 1]! } : p));
    const all = [...ruled, ...kept].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
    lesson.homework = all[0] ?? { kind: 'none', toward: '' };
    lesson.also = all.slice(1, 5);
  });
}

/** Told to the outline's writer before it orders the lessons, so what is taught fits around what is placed. */
export function placementLine(stated: StatedItem[], n: number | null, often = false): string {
  if (!stated.length || !n || n < 2) return '';
  const placed = placedWork(stated, n, true, often);
  const every = stated.filter((st) => formOf(st).every).map((st) => `"${st.item}"`);
  const sat = placed.flatMap((held, i) => held.filter((p) => p.kind === 'test' && !formOf(stated.find((st) => st.item === p.toward)!).every).map((p) => `lesson ${i + 1}: "${p.toward}"`));
  const named = stated.filter((st) => formOf(st).nominated).map((st) => `"${st.item}"${st.count ? ` (${st.count} of them)` : ''}`);
  return [
    'Some of the graded work is placed already, and is not yours to place:',
    every.length ? `every lesson holds ${every.join(', ')};` : '',
    sat.length ? `the tests are sat in these lessons, and nowhere else: ${sat.join('; ')}. Order what is taught so each test comes after what it covers, and give a lesson that holds a long test little else.` : '',
    named.length ? `Under "homework" and "also" you place only ${named.join(', ')}: the lesson that sets each, and the lesson it is due at.` : 'Leave "homework" as "none" and "also" empty.',
  ].filter(Boolean).join(' ');
}
