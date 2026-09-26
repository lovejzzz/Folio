import {
  checkMinutes,
  checkQuestion,
  cmd,
  duplicatePrompts,
  newId,
  type Command,
  type Course,
  type GeneratedKind,
  type Lesson,
  type Question,
  type Rubric,
  type Task,
} from '@folio/core';
import type { Inference } from './inference';
import { runJob, type JobSpec, type Problem } from './jobs';
import { numberedPassages, sectionPrompt, systemPrompt } from './prompts';
import {
  AssignmentDraft,
  DiscussionsDraft,
  FaqDraft,
  PlanDraft,
  QuizDraft,
  SlidesDraft,
  StudyDraft,
  type QuestionDraft,
} from './schemas';

/** Everything one generated section needs: its schema, its checks and how it becomes commands. */
interface SectionJob<T> {
  schema: JobSpec<T>['schema'];
  check?: (value: T, course: Course, lesson: Lesson) => Problem[];
  toCommands: (value: T, problems: Problem[], course: Course, lesson: Lesson) => Command[];
}

function sectionFlag(problems: Problem[]): string | null {
  const messages = problems.filter((p) => p.index === null).map((p) => p.message);
  return messages.length ? messages.join(' ') : null;
}

function itemFlag(problems: Problem[], index: number): string | null {
  const messages = problems.filter((p) => p.index === index).map((p) => p.message);
  return messages.length ? messages.join(' ') : null;
}

const base = (lesson: Lesson) => ({ lessonId: lesson.id, sourceRefs: [], origin: 'ai' as const, edited: false });

function toQuestion(draft: QuestionDraft, course: Course, lesson: Lesson, flag: string | null): Question {
  const graded = draft.format === 'choice' || draft.format === 'truefalse';
  const choices = graded ? draft.choices.map((text) => ({ id: newId('x'), text: text.trim() })) : [];
  const correct = choices.find((c) => c.text.toLowerCase() === draft.answer.trim().toLowerCase())?.id ?? null;
  const objectiveId = lesson.objectiveIds[draft.objective - 1];
  const passage = draft.sourcePassage ? numberedPassages(course)[draft.sourcePassage - 1] : undefined;
  return {
    ...base(lesson),
    id: newId('t'),
    kind: 'question',
    objectiveIds: objectiveId ? [objectiveId] : [],
    sourceRefs: passage ? [{ sourceId: passage.sourceId, passageId: passage.passageId }] : [],
    flag,
    format: draft.format,
    prompt: draft.prompt,
    choices,
    correct,
    answer: graded ? '' : draft.answer,
    explanation: draft.explanation,
    difficulty: Math.min(3, Math.max(1, draft.difficulty)) as 1 | 2 | 3,
  };
}

const plan: SectionJob<PlanDraft> = {
  schema: PlanDraft,
  check: (v, course) =>
    checkMinutes(
      v.segments.map((s) => s.minutes),
      course.shape.minutesPerLesson,
    ).map((message) => ({ index: null, message })),
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'plan',
      flag: sectionFlag(problems),
      content: {
        keyIdeas: v.keyIdeas,
        segments: v.segments.map((s) => ({ ...s, id: newId('x') })),
        vocabulary: v.vocabulary.map((t) => ({ ...t, id: newId('x') })),
      },
    }),
  ],
};

const slides: SectionJob<SlidesDraft> = {
  schema: SlidesDraft,
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'slides',
      flag: sectionFlag(problems),
      content: { slides: v.slides.map((s) => ({ ...s, id: newId('x') })) },
    }),
  ],
};

const study: SectionJob<StudyDraft> = {
  schema: StudyDraft,
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'study',
      flag: sectionFlag(problems),
      content: { overview: v.overview, points: v.points.map((p) => ({ ...p, id: newId('x') })) },
    }),
  ],
};

const quiz: SectionJob<QuizDraft> = {
  schema: QuizDraft,
  check: (v, course, lesson) => {
    const problems: Problem[] = [];
    v.questions.forEach((q, index) => {
      for (const message of checkQuestion(q)) problems.push({ index, message });
      if (q.objective > Math.max(1, lesson.objectiveIds.length)) {
        problems.push({ index, message: `It refers to objective ${q.objective}, which does not exist.` });
      }
    });
    const dupes = new Set(duplicatePrompts(v.questions.map((q) => q.prompt)));
    v.questions.forEach((q, index) => {
      if (dupes.has(q.prompt)) problems.push({ index, message: 'It repeats an earlier question.' });
    });
    if (v.questions.length !== course.shape.quizSize) {
      problems.push({ index: null, message: `There are ${v.questions.length} questions instead of ${course.shape.quizSize}.` });
    }
    return problems;
  },
  toCommands: (v, problems, course, lesson) => [
    cmd('tasks.fill', {
      lessonId: lesson.id,
      kind: 'quiz',
      flag: sectionFlag(problems),
      tasks: v.questions.map((q, i) => toQuestion(q, course, lesson, itemFlag(problems, i))),
    }),
  ],
};

const assignments: SectionJob<AssignmentDraft> = {
  schema: AssignmentDraft,
  check: (v) =>
    v.rubric.criteria
      .filter((c) => c.descriptors.length !== v.rubric.levels.length)
      .map((c) => ({ index: null, message: `The rubric criterion "${c.name}" does not describe every level.` })),
  toCommands: (v, problems, _course, lesson) => {
    const levels = v.rubric.levels.map((lv) => ({ id: newId('x'), label: lv.label, points: lv.points }));
    const rubric: Rubric = {
      id: newId('r'),
      title: v.title,
      levels,
      criteria: v.rubric.criteria.map((c) => ({
        id: newId('x'),
        name: c.name,
        descriptors: Object.fromEntries(levels.map((lv, i) => [lv.id, c.descriptors[i] ?? ''])),
      })),
    };
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flag: null,
      title: v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: rubric.id,
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flag: sectionFlag(problems), tasks: [task], rubrics: [rubric] })];
  },
};

const discussions: SectionJob<DiscussionsDraft> = {
  schema: DiscussionsDraft,
  toCommands: (v, problems, _course, lesson) => [
    cmd('tasks.fill', {
      lessonId: lesson.id,
      kind: 'discussions',
      flag: sectionFlag(problems),
      tasks: v.discussions.map((d) => ({
        ...base(lesson),
        id: newId('t'),
        kind: 'discussion' as const,
        objectiveIds: [...lesson.objectiveIds],
        flag: null,
        prompt: d.prompt,
        followUps: d.followUps,
      })),
    }),
  ],
};

const faq: SectionJob<FaqDraft> = {
  schema: FaqDraft,
  toCommands: (v, problems, _course, lesson) => [
    cmd('faq.fill', {
      lessonId: lesson.id,
      flag: sectionFlag(problems),
      entries: v.entries.map((e) => ({
        id: newId('f'),
        lessonId: lesson.id,
        question: e.question,
        answer: e.answer,
        origin: 'ai' as const,
        edited: false,
        flag: null,
      })),
    }),
  ],
};

export interface SectionResult {
  commands: Command[];
  /** How many problems remain after the one allowed repair. */
  flagged: number;
}

/** Generate one lesson's section. Pure with respect to the course: returns commands, commits nothing. */
export async function generateSection(
  inference: Inference,
  course: Course,
  lessonId: string,
  kind: GeneratedKind,
  signal?: AbortSignal,
): Promise<SectionResult> {
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error(`No lesson ${lessonId}`);
  const run = async <T>(job: SectionJob<T>): Promise<SectionResult> => {
    const result = await runJob(inference, {
      task: `folio_${kind}`,
      system: systemPrompt(course.language),
      prompt: sectionPrompt(course, lesson, kind),
      schema: job.schema,
      check: job.check ? (v) => job.check!(v, course, lesson) : undefined,
      signal,
    });
    return { commands: job.toCommands(result.value, result.problems, course, lesson), flagged: result.problems.length };
  };
  switch (kind) {
    case 'plan':
      return run(plan);
    case 'slides':
      return run(slides);
    case 'study':
      return run(study);
    case 'quiz':
      return run(quiz);
    case 'assignments':
      return run(assignments);
    case 'discussions':
      return run(discussions);
    case 'faq':
      return run(faq);
  }
}
