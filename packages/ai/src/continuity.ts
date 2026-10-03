import { orderedLessons, type Course, type Lesson } from '@folio/core';

/**
 * What one lesson's materials owe the lessons around it. Each lesson is written in its own call, and a lesson
 * written knowing only the others' titles taught its own version of what they taught: a grade 2 course named a
 * bean plant's stages five ways in one lesson and four in another, and moved the beans students had set
 * sprouting in bags on the window into jars.
 */

/** Room for the earlier lessons in a plan request: a long course keeps the nearest in full. */
const EARLIER_BUDGET = 9000;

function lessonDigest(lesson: Lesson): string {
  const ideas = lesson.keyIdeas.map((k) => `  - ${k}`).join('\n');
  const terms = lesson.vocabulary.map((v) => v.term).join(', ');
  const flow = lesson.segments.map((s) => `  - ${s.title}: ${s.description.split('\n')[0]}`).join('\n');
  return [`"${lesson.title}"`, ideas && ` Key ideas:\n${ideas}`, terms && ` Terms: ${terms}`, flow && ` What students did:\n${flow}`].filter(Boolean).join('\n');
}

/** The lessons before this one that are already planned, nearest last, within the budget. */
export function earlierLessons(course: Course, lesson: Lesson): string {
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id)).filter((l) => l.segments.length);
  const kept: string[] = [];
  let used = 0;
  for (const l of before.reverse()) {
    const digest = lessonDigest(l);
    if (used + digest.length > EARLIER_BUDGET) break;
    kept.unshift(digest);
    used += digest.length;
  }
  if (!kept.length) return '';
  return `The lessons before this one, as already planned:\n${kept.join('\n\n')}\n\nThis lesson follows them: use the same names, terms, stages, examples and classroom setups, build on what they taught rather than teaching it again differently or presenting it as new, and when something they started goes on in this lesson (an experiment, a project, a class chart), continue it as they set it up, on a realistic timeline for how often the class meets (seeds take days to sprout, paint hours to dry). Under vocabulary, list only the terms this lesson introduces: the terms above are already taught, and when this lesson uses them it keeps their meaning.`;
}

/**
 * A graded component set as an assignment in several lessons is shared between them. Told only its name, each
 * lesson wrote the whole component: the same title twice, each claiming the component's full weight.
 */
export function sharedComponent(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  if (!toward) return '';
  const sharing = orderedLessons(course).filter((l) => l.homework.kind === 'assignment' && l.homework.toward.trim() === toward);
  if (sharing.length < 2) return '';
  const place = sharing.findIndex((l) => l.id === lesson.id) + 1;
  return `"${toward}" is set as an assignment in ${sharing.length} lessons, and this is part ${place} of ${sharing.length}: write only the part that belongs to this lesson, title it so it can be told apart from the other parts (for example "${toward}: " followed by this lesson's focus), and never say this part alone carries the component's whole weight.`;
}

/**
 * Writing a plan again after its review left notes: the new plan is told what the old one got wrong. Written
 * afresh without them, a plan made the same mistakes again, or new ones as often as not.
 */
export function earlierNotes(lesson: Lesson): string {
  const notes = (lesson.gen.plan?.flags ?? []).flatMap((f) => (f.code === 'reviewNote' ? [`- ${f.values.where}: ${f.values.text}`] : []));
  if (!notes.length) return '';
  return `A review of the previous version of this plan found these problems. Write the plan so that none of them is in it:\n${notes.join('\n')}`;
}
