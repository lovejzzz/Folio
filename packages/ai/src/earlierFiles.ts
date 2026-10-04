import { orderedLessons, type Course, type Lesson } from '@folio/core';

/** How much earlier code a page is shown: the files written last, whole, until this is used up. */
const FILES_BUDGET = 7000;

/** A code block whose caption is a file's name holds that file ("Assets/Scripts/Patrol.cs"), not lines added inside one. */
const FILE_NAME = /^[\w./ -]+\.\w{1,6}$/;

/**
 * The files the student's work holds, as earlier weeks last wrote them. A week was told only what the week before
 * "leaves", in the writer's own words: a field named `speed` under Patrol came back as "Patrol Speed", and a game
 * moved with A, W, S and D was given a hint about the arrow keys. The code itself cannot be paraphrased.
 */
export function filesSoFar(course: Course, lesson: Lesson): string {
  const latest = new Map<string, { code: string; week: number }>();
  orderedLessons(course)
    .slice(0, Math.max(0, course.lessonOrder.indexOf(lesson.id)))
    .forEach((l, i) => {
      for (const b of l.page ?? []) if (b.type === 'code' && FILE_NAME.test(b.caption.trim())) latest.set(b.caption.trim().split('/').pop()!, { code: b.code.trim(), week: i + 1 });
    });
  if (!latest.size) return '';
  const files = [...latest].sort((a, b) => b[1].week - a[1].week);
  const whole: string[] = [];
  const named: string[] = [];
  let used = 0;
  for (const [name, { code, week }] of files) {
    if (used + code.length > FILES_BUDGET) named.push(`${name} (week ${week})`);
    else {
      whole.push(`${name}, as week ${week} wrote it:\n${code}`);
      used += code.length;
    }
  }
  return [
    'Files the student\'s work already holds, as an earlier week last wrote them. Use their names exactly: what a setting is called on screen follows from its name in this code and nothing is added to it, the keys the student presses are the keys this code reads, and a file written again still does what it does here.',
    ...whole,
    named.length ? `Written earlier too: ${named.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
