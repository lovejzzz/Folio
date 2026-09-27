import { filledTexts, isBlankObjective, isBlankQuestion, statedObjectives } from '../blank';
import { lessonAssignments, lessonDiscussions, lessonNumber, lessonQuestions, orderedObjectives } from '../course';
import type { Block } from '../semantic';
import { lessonsIn, nonEmpty, type Ctx } from './shared';

/** Course map: how objectives, lessons and assessments line up. */
export function projectMap(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const lessons = lessonsIn(ctx);
  const blocks: Block[] = [
    {
      t: 'table',
      head: [l.lessonColumn, l.objectives, l.assessedBy],
      widths: [30, 40, 30],
      rows: lessons.map((lesson) => {
        const n = lessonNumber(course, lesson.id);
        const assessed: string[] = [];
        const qs = lessonQuestions(course, lesson).filter((q) => !isBlankQuestion(q)).length;
        if (qs) assessed.push(l.questionsCount(qs));
        for (const a of lessonAssignments(course, lesson)) assessed.push(a.title);
        if (lessonDiscussions(course, lesson).length) assessed.push(l.materials.discussions);
        return [
          `${l.lesson(n)} · ${lesson.title}`,
          statedObjectives(course, lesson).map((o) => o.text).join('\n') || l.none,
          assessed.join('\n') || l.none,
        ];
      }),
    },
  ];
  const objectives = orderedObjectives(course).filter((o) => !isBlankObjective(o));
  if (objectives.length) {
    blocks.push({ t: 'heading', level: 2, text: l.objectives });
    blocks.push({
      t: 'table',
      head: [l.objectiveColumn, l.coveredIn],
      widths: [70, 30],
      rows: objectives.map((o) => {
        const where = lessons
          .filter((lesson) => lesson.objectiveIds.includes(o.id))
          .map((lesson) => l.lesson(lessonNumber(course, lesson.id)));
        return [o.text, where.join(', ') || l.none];
      }),
    });
  }
  return blocks;
}

export function projectSyllabus(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const lessons = lessonsIn(ctx);
  const blocks: Block[] = [];
  if (nonEmpty(course.summary)) blocks.push({ t: 'para', text: course.summary, tone: 'lead' });
  const meta = [];
  if (course.audience.level) meta.push({ label: l.audience, value: course.audience.level });
  if (course.audience.subject) meta.push({ label: l.subject, value: course.audience.subject });
  const sessions = course.shape.sessions;
  meta.push({
    label: l.length,
    value: sessions.length > 1 ? l.lengthSessions(course.lessonOrder.length, sessions.map((s) => l.sessionPart(l.sessionKinds[s.kind], s.minutes))) : l.lengthValue(course.lessonOrder.length, course.shape.minutesPerLesson),
  });
  blocks.push({ t: 'meta', items: meta });

  const objectives = orderedObjectives(course).filter((o) => !isBlankObjective(o) && lessons.some((x) => x.objectiveIds.includes(o.id)));
  if (objectives.length) {
    blocks.push({ t: 'heading', level: 2, text: l.whatYouLearn });
    blocks.push({ t: 'list', ordered: false, items: objectives.map((o) => o.text) });
  }

  blocks.push({ t: 'heading', level: 2, text: l.schedule });
  const withReadings = lessons.some((lesson) => filledTexts(lesson.readings).length > 0);
  blocks.push({
    t: 'table',
    head: withReadings ? ['#', l.lessonColumn, l.focus, l.reading] : ['#', l.lessonColumn, l.focus],
    widths: withReadings ? [6, 28, 38, 28] : [8, 36, 56],
    rows: lessons.map((lesson) => {
      const row = [String(lessonNumber(course, lesson.id)), lesson.title, lesson.summary || statedObjectives(course, lesson)[0]?.text || ''];
      if (withReadings) row.push(filledTexts(lesson.readings).join('\n'));
      return row;
    }),
  });

  const grading = gradingBlocks(ctx);
  const assessment = assessmentLines(ctx);
  if (grading.length || assessment.length) {
    blocks.push({ t: 'heading', level: 2, text: l.assessment });
    blocks.push(...grading);
    if (assessment.length) blocks.push({ t: 'list', ordered: false, items: assessment });
  }
  if (nonEmpty(course.policies)) {
    blocks.push({ t: 'heading', level: 2, text: l.policies });
    for (const para of course.policies.split(/\n{2,}/)) blocks.push({ t: 'para', text: para.trim() });
  }
  return blocks;
}

/** Grade weights may be fractional; show them without floating-point noise. */
function percent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

/** The grading scheme the teacher stated: one row per component, then the total. */
function gradingBlocks(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const items = course.grading.filter((g) => nonEmpty(g.item));
  if (!items.length) return [];
  const total = Math.round(items.reduce((sum, g) => sum + g.weight, 0) * 10) / 10;
  // No weights stated: what is graded, without a column of zeros.
  if (total === 0) return [{ t: 'table', head: [l.gradeItem], widths: [100], rows: items.map((g) => [g.item]) }];
  const blocks: Block[] = [
    {
      t: 'table',
      head: [l.gradeItem, l.weight],
      widths: [76, 24],
      rows: [...items.map((g) => [g.item, g.weight ? percent(g.weight) : '—']), [l.total, percent(total)]],
    },
  ];
  // A gentle note in the teacher's copy only; students just see the total.
  if (total !== 100 && ctx.teacher) blocks.push({ t: 'para', tone: 'muted', text: l.weightsOff(percent(total)) });
  return blocks;
}

function assessmentLines(ctx: Ctx): string[] {
  const { course, l } = ctx;
  const lessons = lessonsIn(ctx);
  const lines: string[] = [];
  const quizzes = lessons.filter((lesson) => lessonQuestions(course, lesson).some((q) => !isBlankQuestion(q))).length;
  if (course.materials.quiz.enabled && quizzes) lines.push(l.quizzesLine(quizzes, course.shape.quizSize));
  if (course.materials.assignments.enabled) {
    for (const lesson of lessons) {
      for (const a of lessonAssignments(course, lesson)) {
        lines.push(l.assignmentLine(a.title, lessonNumber(course, lesson.id)));
      }
    }
  }
  const discussed = lessons.filter((lesson) => lessonDiscussions(course, lesson).length > 0).length;
  if (course.materials.discussions.enabled && discussed) lines.push(l.discussionsLine(discussed));
  return lines;
}
