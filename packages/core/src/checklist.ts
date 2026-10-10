import { TO_CONFIRM, groundsOf, unsourcedLocators } from './locators';
import type { Course, Lesson, Task } from './schema';

/**
 * What a teacher can take as checked in a lesson, and what is theirs to look at before class. A lesson is a dozen
 * pages, and with few notes left on it "no note" had come to look like "no problem": Folio knows which answers a program
 * worked out and which it never reached, which chapters the teacher gave and which it guessed, and said none of it.
 * Made from what the lesson already holds, with no reading of it by a model: facts only, never "correct".
 */

/**
 * Whether an item holds something a program can work out: code, or a few numbers. Asked of every item, a form for an essay
 * prompt cost a call and bound to nothing.
 */
export function worthChecking(task: Task): boolean {
  if (task.kind === 'discussion') return false;
  const text = task.kind === 'question' ? [task.prompt, ...task.choices.map((c) => c.text), task.answer, task.explanation].join(' ') : [...task.steps, task.answerKey].join(' ');
  if (task.kind === 'assignment' && !task.answerKey.trim()) return false;
  return /`[^`]+`|\b(print|def|import|return)\b|[=<>]=|\w\(.*\)/.test(text) || (text.match(/\d+(\.\d+)?/g) ?? []).length >= 4;
}

export type CheckItem =
  /** Answers of quiz questions and graded work that a program worked out and found as written. */
  | { kind: 'answersHeld'; count: number }
  /** Keys to sheets worked out the same way; `fixed` names the sheets whose key was wrong and was put right. */
  | { kind: 'keysHeld'; count: number; fixed: string[] }
  /** Answers with numbers or code in them that no program reached. */
  | { kind: 'answersUnchecked'; titles: string[]; more: number }
  | { kind: 'keysUnchecked'; titles: string[]; more: number }
  /** Chapters, pages and addresses that are not in the teacher's brief or files. */
  | { kind: 'toConfirm'; found: string[] }
  /** Notes Folio left on the lesson. */
  | { kind: 'notes'; count: number };

export interface Checklist {
  checked: CheckItem[];
  look: CheckItem[];
}

const numbers = (text: string) => (text.match(/\d+(?:\.\d+)?/g) ?? []).length;
const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);

export function lessonChecklist(course: Course, lesson: Lesson): Checklist {
  const tasks = lesson.taskIds.flatMap((id) => (course.tasks[id] ? [course.tasks[id]] : []));
  const held = tasks.filter((t) => t.checked).length;
  const unreached = tasks.filter((t) => !t.checked && !t.flags.length && worthChecking(t));
  const keyed = lesson.handouts.filter((h) => h.key.trim());
  const keysHeld = keyed.filter((h) => h.keyChecked);
  // A key with a few numbers in it that nothing worked out: the same test of "worth checking" as for a piece of work.
  const keysUnreached = keyed.filter((h) => !h.keyChecked && numbers(h.key) >= 4);
  const grounds = groundsOf(course);
  const all = JSON.stringify([lesson.readings, lesson.segments, lesson.slides, lesson.study, lesson.handouts, tasks, lesson.faqIds.map((id) => course.faq[id])]);
  // Each as it is written, whether marked or (in what only the teacher reads, and for addresses) not, and with the name
  // that stands right before it, so the teacher sees whose chapter it is: "OpenStax Statistics, ch. 3". Only a name: taken
  // with any words before it, a line read "ch. 2; , sections 2.1–2.5".
  const clean = all.split(` ${TO_CONFIRM}`).join('');
  const named = (f: string) => new RegExp(`((?:[A-Z][\\p{L}\\d’'&-]*\\s+(?:(?:of|and|the|in|to|for)\\s+)*){1,6}?[A-Z][\\p{L}\\d’'&-]*),?\\s+${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').exec(clean)?.[1]?.replace(/^(?:(?:Read|Reread|See|Skim|Review|Finish|Open|Use|From|In|And|Then)\s+)+/, '').replace(/^(?:Read|Reread|See|Skim|Review|Finish|Open|Use|From|In|And|Then)$/, '');
  const toConfirm = [...new Set(unsourcedLocators(clean, grounds).map((f) => (/^(?:https?:|www\.)/i.test(f) ? f : named(f) ? `${named(f)}, ${f}` : f)).map((f) => (f.length > 70 ? `${f.slice(0, 67)}…` : f)))];
  const notes = tasks.reduce((n, t) => n + t.flags.length, 0) + Object.values(lesson.gen).reduce((n, g) => n + (g?.flags.length ?? 0), 0);
  const titleOf = (t: (typeof tasks)[number]) => short(t.kind === 'assignment' ? t.title : t.prompt);
  return {
    checked: [
      ...(held ? [{ kind: 'answersHeld' as const, count: held }] : []),
      ...(keysHeld.length ? [{ kind: 'keysHeld' as const, count: keysHeld.length, fixed: keysHeld.filter((h) => h.keyChecked === 'fixed').map((h) => h.title) }] : []),
    ],
    look: [
      ...(notes ? [{ kind: 'notes' as const, count: notes }] : []),
      // Three by name and the rest by number: a list of every question is not read.
      ...(unreached.length ? [{ kind: 'answersUnchecked' as const, titles: unreached.slice(0, 3).map(titleOf), more: Math.max(0, unreached.length - 3) }] : []),
      ...(keysUnreached.length ? [{ kind: 'keysUnchecked' as const, titles: keysUnreached.slice(0, 3).map((h) => h.title), more: Math.max(0, keysUnreached.length - 3) }] : []),
      ...(toConfirm.length ? [{ kind: 'toConfirm' as const, found: toConfirm.slice(0, 8) }] : []),
    ],
  };
}

/** The list in plain English, a line an item: for an export, and for readers who measure what it points at. */
export function checklistLines(list: Checklist): { checked: string[]; look: string[] } {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const say = (item: CheckItem): string => {
    switch (item.kind) {
      case 'answersHeld':
        return `${n(item.count, 'answer', 'answers')} in the quiz and graded work worked out by a program, as written.`;
      case 'keysHeld':
        return `${n(item.count, 'sheet key', 'sheet keys')} worked out by a program${item.fixed.length ? `; corrected in ${item.fixed.map((t) => `“${t}”`).join(', ')}` : ''}.`;
      case 'notes':
        return `${n(item.count, 'note', 'notes')} from Folio on this lesson, at the top of the part each is about.`;
      case 'answersUnchecked':
        return `Answers no program worked out: ${item.titles.map((t) => `“${t}”`).join('; ')}${item.more ? `, and ${item.more} more` : ''}.`;
      case 'keysUnchecked':
        return `Sheet keys no program worked out: ${item.titles.map((t) => `“${t}”`).join('; ')}${item.more ? `, and ${item.more} more` : ''}.`;
      case 'toConfirm':
        return `Not in your brief or files, to confirm: ${item.found.join('; ')}.`;
    }
  };
  return { checked: list.checked.map(say), look: list.look.map(say) };
}
