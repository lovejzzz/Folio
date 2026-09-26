import { lessonObjectives, lessonQuestions } from '../course';
import type { Block } from '../semantic';
import { field, lessonHeading, lessonsIn, nonEmpty, questionBlock, type Ctx } from './shared';

/** Lesson plans. The student copy is a lesson outline without teacher notes. */
export function projectPlan(ctx: Ctx): Block[] {
  const { course, l, teacher } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    blocks.push(lessonHeading(ctx, lesson));
    if (nonEmpty(lesson.summary)) blocks.push({ t: 'para', text: lesson.summary, tone: 'lead' });
    const objectives = lessonObjectives(course, lesson);
    if (objectives.length) {
      blocks.push({ t: 'heading', level: 3, text: l.objectives });
      blocks.push({ t: 'list', ordered: false, items: objectives.map((o) => o.text) });
    }
    if (lesson.keyIdeas.length) {
      blocks.push({ t: 'heading', level: 3, text: l.keyIdeas });
      blocks.push({ t: 'list', ordered: false, items: lesson.keyIdeas });
    }
    if (lesson.segments.length) {
      blocks.push({
        t: 'table',
        head: [l.time, l.activity, l.details],
        widths: [12, 28, 60],
        rows: lesson.segments.map((s) => [
          l.minutes(s.minutes),
          field(ctx, s.id, 'title', s.title),
          teacher && s.teacherNotes ? `${s.description}\n${l.teacherNote}: ${s.teacherNotes}` : s.description,
        ]),
      });
    }
    if (lesson.vocabulary.length) {
      blocks.push({ t: 'heading', level: 3, text: l.vocabulary });
      blocks.push({ t: 'terms', items: lesson.vocabulary.map(({ term, definition }) => ({ term, definition })) });
    }
    blocks.push({ t: 'break' });
  }
  return trimBreak(blocks);
}

export function projectSlides(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  let n = 0;
  for (const lesson of lessonsIn(ctx)) {
    const lessonLabel = ctx.l.lesson(ctx.course.lessonOrder.indexOf(lesson.id) + 1);
    for (const slide of lesson.slides) {
      n += 1;
      blocks.push({
        t: 'slide',
        n,
        layout: slide.layout,
        title: field(ctx, slide.id, 'title', slide.title),
        bullets: slide.bullets,
        lesson: `${lessonLabel} · ${lesson.title}`,
        ...(ctx.teacher && slide.notes ? { notes: slide.notes } : {}),
      });
    }
  }
  return blocks;
}

/** Study guides: overview, explanations, vocabulary, and a short self-check. */
export function projectStudy(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    blocks.push(lessonHeading(ctx, lesson));
    if (nonEmpty(lesson.study.overview)) blocks.push({ t: 'para', text: lesson.study.overview, tone: 'lead' });
    for (const point of lesson.study.points) {
      blocks.push({ t: 'heading', level: 3, text: point.heading });
      blocks.push({ t: 'para', text: point.explanation });
    }
    if (lesson.vocabulary.length) {
      blocks.push({ t: 'heading', level: 3, text: l.vocabulary });
      blocks.push({ t: 'terms', items: lesson.vocabulary.map(({ term, definition }) => ({ term, definition })) });
    }
    const check = lessonQuestions(course, lesson).slice(0, 3);
    if (check.length) {
      blocks.push({ t: 'heading', level: 3, text: l.checkYourself });
      check.forEach((q, i) => blocks.push(questionBlock(ctx, q, i + 1)));
    }
    blocks.push({ t: 'break' });
  }
  return trimBreak(blocks);
}

export function trimBreak(blocks: Block[]): Block[] {
  return blocks.at(-1)?.t === 'break' ? blocks.slice(0, -1) : blocks;
}
