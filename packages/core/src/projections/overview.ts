import { lessonAssignments, lessonDiscussions, lessonNumber, lessonObjectives, lessonQuestions, orderedObjectives } from '../course';
import type { Block } from '../semantic';
import { lessonsIn, nonEmpty, type Ctx } from './shared';

/** Course map: how objectives, lessons and assessments line up. */
export function projectMap(ctx: Ctx): Block[] {
  const { course, l } = ctx;
  const lessons = lessonsIn(ctx);
  const blocks: Block[] = [
    {
      t: 'table',
      head: [l.lessons, l.objectives, l.assessedBy],
      widths: [30, 40, 30],
      rows: lessons.map((lesson) => {
        const n = lessonNumber(course, lesson.id);
        const assessed: string[] = [];
        const qs = lessonQuestions(course, lesson).length;
        if (qs) assessed.push(l.questionsCount(qs));
        for (const a of lessonAssignments(course, lesson)) assessed.push(a.title);
        if (lessonDiscussions(course, lesson).length) assessed.push(l.materials.discussions);
        return [
          `${l.lesson(n)} · ${lesson.title}`,
          lessonObjectives(course, lesson).map((o) => o.text).join('\n') || l.none,
          assessed.join('\n') || l.none,
        ];
      }),
    },
  ];
  const objectives = orderedObjectives(course);
  if (objectives.length) {
    blocks.push({ t: 'heading', level: 2, text: l.objectives });
    blocks.push({
      t: 'table',
      head: [l.objectives, l.coveredIn],
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
  meta.push({ label: l.length, value: l.lengthValue(course.lessonOrder.length, course.shape.minutesPerLesson) });
  blocks.push({ t: 'meta', items: meta });

  const objectives = orderedObjectives(course).filter((o) => lessons.some((x) => x.objectiveIds.includes(o.id)));
  if (objectives.length) {
    blocks.push({ t: 'heading', level: 2, text: l.whatYouLearn });
    blocks.push({ t: 'list', ordered: false, items: objectives.map((o) => o.text) });
  }

  blocks.push({ t: 'heading', level: 2, text: l.schedule });
  blocks.push({
    t: 'table',
    head: ['#', l.lessons, l.focus],
    widths: [8, 36, 56],
    rows: lessons.map((lesson) => [
      String(lessonNumber(course, lesson.id)),
      lesson.title,
      lesson.summary || lessonObjectives(course, lesson)[0]?.text || '',
    ]),
  });

  const assessment = assessmentLines(ctx);
  if (assessment.length) {
    blocks.push({ t: 'heading', level: 2, text: l.assessment });
    blocks.push({ t: 'list', ordered: false, items: assessment });
  }
  if (nonEmpty(course.policies)) {
    blocks.push({ t: 'heading', level: 2, text: l.policies });
    for (const para of course.policies.split(/\n{2,}/)) blocks.push({ t: 'para', text: para.trim() });
  }
  return blocks;
}

function assessmentLines(ctx: Ctx): string[] {
  const { course, l } = ctx;
  const lessons = lessonsIn(ctx);
  const lines: string[] = [];
  const quizzes = lessons.filter((lesson) => lessonQuestions(course, lesson).length > 0).length;
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
