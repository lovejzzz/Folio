import { filledTexts, isBlankCriterion, isBlankDiscussion, isBlankFaq } from '../blank';
import { answerText, lessonAssignments, lessonDiscussions, lessonFaq } from '../course';
import { setsWork } from '../ripple';
import type { Block } from '../semantic';
import type { Rubric } from '../schema';
import { field, lessonHeading, lessonsIn, questionBlock, shownQuestions, type Ctx } from './shared';
import { trimBreak } from './lessonViews';

/** The quiz bank. Only the teacher copy carries answers, inline and as a key. */
export function projectQuiz(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  const key: { n: number; answer: string }[] = [];
  let n = 0;
  for (const lesson of lessonsIn(ctx)) {
    const questions = shownQuestions(ctx.course, lesson);
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
      rows: rubric.criteria.filter((c) => !isBlankCriterion(c)).map((c) => [c.name, ...rubric.levels.map((lv) => c.descriptors[lv.id] ?? '')]),
    },
  ];
}

export function projectAssignments(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    // An assignment the lesson no longer sets (kept from before its homework changed) isn't handed out.
    if (!setsWork(lesson, 'assignments')) continue;
    for (const a of lessonAssignments(course, lesson)) {
      blocks.push(lessonHeading(ctx, lesson));
      blocks.push({ t: 'heading', level: 3, text: field(ctx, a.id, 'title', a.title) });
      blocks.push({ t: 'para', text: field(ctx, a.id, 'prompt', a.prompt) });
      const toward = lesson.homework.toward.trim();
      const { kind } = lesson.homework;
      if (kind === 'step' && toward) blocks.push({ t: 'para', text: l.buildsToward(toward), tone: 'muted' });
      if (kind === 'test' || kind === 'inclass') blocks.push({ t: 'para', text: kind === 'test' ? l.takenInClass : l.gradedInClass, tone: 'muted' });
      const due = lesson.homework.due ? course.lessons[lesson.homework.due] : undefined;
      if (due && (kind === 'assignment' || kind === 'step')) blocks.push({ t: 'para', text: l.dueAt(due.title), tone: 'muted' });
      const steps = filledTexts(a.steps);
      if (steps.length) {
        blocks.push({ t: 'heading', level: 3, text: kind === 'test' ? l.questions : l.steps });
        blocks.push({ t: 'list', ordered: true, items: steps });
      }
      // The key is the teacher's: a student copy of a test or a problem set never carries it.
      if (ctx.teacher && a.answerKey.trim()) blocks.push({ t: 'note', label: l.answerKey, text: a.answerKey.trim() });
      const rubric = a.rubricId && setsWork(lesson, 'rubrics') ? course.rubrics[a.rubricId] : undefined;
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
    if (!setsWork(lesson, 'rubrics')) continue;
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
    const items = lessonDiscussions(ctx.course, lesson).filter((d) => !isBlankDiscussion(d));
    if (!items.length) continue;
    blocks.push(lessonHeading(ctx, lesson));
    items.forEach((d, i) => {
      blocks.push({ t: 'heading', level: 3, text: `${i + 1}. ${field(ctx, d.id, 'prompt', d.prompt)}` });
      const followUps = filledTexts(d.followUps);
      if (ctx.teacher && followUps.length) {
        blocks.push({ t: 'note', label: ctx.l.followUps, text: followUps.map((f) => `• ${f}`).join('\n') });
      }
    });
  }
  return blocks;
}

export function projectFaq(ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  for (const lesson of lessonsIn(ctx)) {
    const entries = lessonFaq(ctx.course, lesson).filter((e) => !isBlankFaq(e));
    if (!entries.length) continue;
    blocks.push(lessonHeading(ctx, lesson));
    for (const e of entries) {
      blocks.push({ t: 'heading', level: 3, text: e.question });
      blocks.push({ t: 'para', text: e.answer });
    }
  }
  return blocks;
}
