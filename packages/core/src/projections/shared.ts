import { isBlankQuestion, withoutBlankChoices } from '../blank';
import { answerText, lessonNumber, lessonQuestions, orderedLessons } from '../course';
import { courseLabels, type DocLabels } from '../docLabels';
import type { MaterialKind } from '../materials';
import type { Course, Lesson, Question } from '../schema';
import type { Block, ProjectOptions } from '../semantic';

export interface Ctx {
  course: Course;
  kind: MaterialKind;
  opts: ProjectOptions;
  l: DocLabels;
  teacher: boolean;
}

export function makeCtx(course: Course, kind: MaterialKind, opts: ProjectOptions): Ctx {
  return { course, kind, opts, l: courseLabels(course), teacher: opts.audience === 'teacher' };
}

export function lessonsIn(ctx: Ctx): Lesson[] {
  const all = orderedLessons(ctx.course);
  if (!ctx.opts.lessonIds) return all;
  const wanted = new Set(ctx.opts.lessonIds);
  return all.filter((l) => wanted.has(l.id));
}

/** A field as this material shows it: the material-local override if there is one. */
export function field(ctx: Ctx, entityId: string, name: string, value: string): string {
  const override = ctx.course.overrides.find((o) => o.view === ctx.kind && o.entityId === entityId && o.field === name);
  return override ? override.value : value;
}

export function lessonHeading(ctx: Ctx, lesson: Lesson, level: 1 | 2 = 2): Block {
  const n = lessonNumber(ctx.course, lesson.id);
  const text = nonEmpty(lesson.title) ? `${ctx.l.lesson(n)} · ${lesson.title}` : ctx.l.lesson(n);
  return { t: 'heading', level, text, anchor: lesson.id };
}

/** A lesson's questions as printed: blank ones left out, and blank choices dropped from the rest. */
export function shownQuestions(course: Course, lesson: Lesson): Question[] {
  return lessonQuestions(course, lesson)
    .filter((q) => !isBlankQuestion(q))
    .map(withoutBlankChoices);
}

export function questionBlock(ctx: Ctx, q: Question, n: number): Block {
  const block: Block = {
    t: 'question',
    n,
    format: q.format,
    prompt: field(ctx, q.id, 'prompt', q.prompt),
    choices: q.choices.map((c) => c.text),
  };
  if (ctx.teacher) {
    block.answer = answerText(q);
    if (q.explanation) block.explanation = q.explanation;
  }
  return block;
}

export function nonEmpty(text: string): boolean {
  return text.trim().length > 0;
}
