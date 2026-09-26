import { answerText, lessonAssignments, lessonDiscussions, lessonFaq, lessonQuestions } from '../course';
import type { Block } from '../semantic';
import type { Rubric } from '../schema';
import { field, lessonHeading, lessonsIn, questionBlock, type Ctx } from './shared';
import { trimBreak } from './lessonViews';

/** The quiz bank. Only the teacher copy carries answers, inline and as a key. */
export function projectQuiz(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  const key: { n: number; answer: string }[] = [];
  let n = 0;
  for (const lesson of lessonsIn(ctx)) {
    const questions = lessonQuestions(ctx.course, lesson);
    if (!questions.length) continue;
    blocks.push(lessonHeading(ctx, lesson));
    for (const q of questions) {
      n += 1;
      blocks.push(questionBlock(ctx, q, n));
      if (ctx.teacher) key.push({ n, answer: answerText(q) });
    }
  }
  if (ctx.teacher && key.length) {
    blocks.push({ t: 'break' });
    blocks.push({ t: 'answers', title: ctx.l.answerKey, items: key });
  }
  return blocks;
}

export function rubricBlocks(ctx: Ctx, rubric: Rubric): Block[] {
  return [
    {
      t: 'table',
      head: [ctx.l.criterion, ...rubric.levels.map((lv) => `${lv.label} (${ctx.l.points(lv.points)})`)],
      rows: rubric.criteria.map((c) => [c.name, ...rubric.levels.map((lv) => c.descriptors[lv.id] ?? '')]),
    },
  ];
}

export function projectAssignments(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    for (const a of lessonAssignments(course, lesson)) {
      blocks.push(lessonHeading(ctx, lesson));
      blocks.push({ t: 'heading', level: 3, text: field(ctx, a.id, 'title', a.title) });
      blocks.push({ t: 'para', text: field(ctx, a.id, 'prompt', a.prompt) });
      if (a.steps.length) {
        blocks.push({ t: 'heading', level: 3, text: l.steps });
        blocks.push({ t: 'list', ordered: true, items: a.steps });
      }
      const rubric = a.rubricId ? course.rubrics[a.rubricId] : undefined;
      if (rubric) {
        blocks.push({ t: 'para', text: l.gradedWith(rubric.title), tone: 'muted' });
        blocks.push(...rubricBlocks(ctx, rubric));
      }
      blocks.push({ t: 'break' });
    }
  }
  return trimBreak(blocks);
}

export function projectRubrics(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    for (const a of lessonAssignments(ctx.course, lesson)) {
      const rubric = a.rubricId ? ctx.course.rubrics[a.rubricId] : undefined;
      if (!rubric) continue;
      blocks.push(lessonHeading(ctx, lesson));
      blocks.push({ t: 'heading', level: 3, text: rubric.title });
      blocks.push(...rubricBlocks(ctx, rubric));
    }
  }
  return blocks;
}

/** Follow-up prompts are facilitation notes, so they are teacher-only. */
export function projectDiscussions(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    const items = lessonDiscussions(ctx.course, lesson);
    if (!items.length) continue;
    blocks.push(lessonHeading(ctx, lesson));
    items.forEach((d, i) => {
      blocks.push({ t: 'heading', level: 3, text: `${i + 1}. ${field(ctx, d.id, 'prompt', d.prompt)}` });
      if (ctx.teacher && d.followUps.length) {
        blocks.push({ t: 'note', label: ctx.l.followUps, text: d.followUps.map((f) => `• ${f}`).join('\n') });
      }
    });
  }
  return blocks;
}

export function projectFaq(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    const entries = lessonFaq(ctx.course, lesson);
    if (!entries.length) continue;
    blocks.push(lessonHeading(ctx, lesson));
    for (const e of entries) {
      blocks.push({ t: 'heading', level: 3, text: e.question });
      blocks.push({ t: 'para', text: e.answer });
    }
  }
  return blocks;
}
