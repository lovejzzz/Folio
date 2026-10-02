import { cmd, newId, orderedLessons, type Command, type Course } from '@folio/core';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { typesetDraft } from './typeset';
import { checkOperations, type SkippedOperation } from './planCheck';
import { coursePlanPrompt, systemPrompt, textActionPrompt, type TextAction, type WritingLanguage } from './prompts';
import { CoursePlanDraft, ExplanationDraft, TextDraft, type PlanOperation } from './schemas';

export type { TextAction };

/** Selection toolbar: rewrite, simplify, harder, easier, translate, explain. */
export async function runTextAction(
  inference: Inference,
  /** `language`: the selection's, which is Spanish where a translation put Spanish into an English course. */
  args: { action: TextAction; selection: string; context: string; language: WritingLanguage; signal?: AbortSignal },
): Promise<string> {
  const prompt = textActionPrompt(args.action, args.selection, args.context, args.language);
  // English goes into Spanish, the other language of many North American classrooms; Spanish, or Chinese from
  // older courses, back into English. Any other action keeps the selection's own language.
  const out: WritingLanguage = args.action === 'translate' ? (args.language === 'en' ? 'es' : 'en') : args.language;
  const system = systemPrompt(out);
  if (args.action === 'explain') {
    const r = await runJob(inference, { task: 'folio_explain', system, prompt, effort: 'low', schema: ExplanationDraft, signal: args.signal });
    return typesetDraft(r.value.explanation, out);
  }
  const r = await runJob(inference, { task: 'folio_text', system, prompt, effort: 'low', schema: TextDraft, signal: args.signal });
  return typesetDraft(r.value.text.trim(), out);
}

/** A proposal: commands prepared against one revision of the course. */
export interface Proposal {
  basisRevision: number;
  /** One sentence on what will change; it labels the history entry. */
  rationale: string;
  /** Why the plan departs from the literal request, when it does. The preview shows this, not the rationale, which repeats the changes listed. */
  note: string;
  commands: Command[];
  /** Human-readable lines for the preview, in the order they will happen. */
  preview: PlanOperation[];
  /** Steps the model proposed that can't be done here, or would change nothing, with why. */
  skipped: SkippedOperation[];
}

/** ⌘K course-level requests become a typed plan the teacher previews before applying. */
export async function planCourseChange(
  inference: Inference,
  course: Course,
  request: string,
  signal?: AbortSignal,
): Promise<Proposal> {
  const r = await runJob(inference, {
    task: 'folio_course_plan',
    system: systemPrompt(course.language, course.locale),
    prompt: coursePlanPrompt(course, request),
    schema: CoursePlanDraft,
    signal,
  });
  const plan = typesetDraft(r.value, course.language);
  const { operations, skipped } = checkOperations(course, plan.operations);
  return {
    basisRevision: course.revision,
    rationale: plan.summary,
    note: plan.note.trim(),
    commands: operationsToCommands(course, operations),
    preview: operations,
    skipped,
  };
}

/**
 * Lesson numbers in a plan refer to the course as it was when the plan was
 * made, so they are resolved to IDs up front, before any operation runs.
 * Expects operations that passed checkOperations.
 */
export function operationsToCommands(course: Course, operations: PlanOperation[]): Command[] {
  const ids = orderedLessons(course).map((l) => l.id);
  const at = (n: number): string | undefined => ids[n - 1];
  const commands: Command[] = [];
  for (const op of operations) {
    switch (op.op) {
      case 'addLesson': {
        const objectives = op.objectives.map((text) => ({ id: newId('o'), text }));
        const afterId = op.after === 0 ? null : (at(op.after) ?? ids.at(-1) ?? null);
        commands.push(cmd('lesson.insert', { lesson: { id: newId('l'), title: op.title, summary: op.summary }, afterId, objectives }));
        break;
      }
      case 'removeLesson': {
        const id = at(op.lesson);
        if (id) commands.push(cmd('lesson.remove', { lessonId: id }));
        break;
      }
      case 'renameLesson': {
        const id = at(op.lesson);
        if (id) commands.push(cmd('lesson.update', { lessonId: id, title: op.title }));
        break;
      }
      case 'moveLesson': {
        const id = at(op.lesson);
        if (id) commands.push(cmd('lesson.move', { lessonId: id, toIndex: op.to - 1 }));
        break;
      }
      case 'addObjective': {
        const id = at(op.lesson);
        if (id) commands.push(cmd('objective.add', { objective: { id: newId('o'), text: op.text }, lessonId: id }));
        break;
      }
      case 'setQuizSize':
        commands.push(cmd('course.update', { shape: { quizSize: op.size } }));
        break;
      case 'setMinutes':
        // One length for the whole lesson: a lecture-and-seminar pattern gives way to a single class.
        commands.push(cmd('course.update', { shape: { minutesPerLesson: op.minutes, sessions: [] } }));
        break;
      case 'setLevel':
        commands.push(cmd('course.update', { audience: { level: op.level } }));
        break;
      case 'setMaterial':
        commands.push(cmd('material.set', { kind: op.material, enabled: op.enabled }));
        break;
    }
  }
  return commands;
}
