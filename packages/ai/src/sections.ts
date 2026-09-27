import { typesetDraft } from './typeset';
import { balanceChoices, stripTrueFalsePrefix } from './balance';
import { tidyFollowUps, tidySlides, tidySteps, tidyTrueFalse } from './tidy';
import {
  checkMinutes,
  answerStandsOut,
  checkQuestion,
  cmd,
  duplicatePrompts,
  type Flag,
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
import { SECTION_EFFORT, courseBackground, numberedPassages, sectionPrompt, systemPrompt } from './prompts';
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
  tidy?: (value: T, course: Course) => T;
  check?: (value: T, course: Course, lesson: Lesson) => Problem[];
  toCommands: (value: T, problems: Problem[], course: Course, lesson: Lesson) => Command[];
}

/** The flags for one item, or for the whole section when index is null. */
function flagsAt(problems: Problem[], index: number | null): Flag[] {
  return problems.filter((p) => p.index === index).map((p) => p.flag);
}

const base = (lesson: Lesson) => ({ lessonId: lesson.id, sourceRefs: [], origin: 'ai' as const, edited: false });

function toQuestion(draft: QuestionDraft, course: Course, lesson: Lesson, flags: Flag[]): Question {
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
    flags,
    format: draft.format,
    prompt: draft.format === 'truefalse' ? stripTrueFalsePrefix(draft.prompt) : draft.prompt,
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
    ).map((flag) => ({ index: null, flag })),
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'plan',
      flags: flagsAt(problems, null),
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
  tidy: (v, course) => tidySlides(v, course.language),
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'slides',
      flags: flagsAt(problems, null),
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
      flags: flagsAt(problems, null),
      content: { overview: v.overview, points: v.points.map((p) => ({ ...p, id: newId('x') })) },
    }),
  ],
};

/**
 * One question too many is dropped here rather than asked for again: a repair
 * call resends the whole request and answer. The dropped one is a middling
 * question, so the easy and hard ones that give the quiz its spread stay.
 */
export function trimQuiz(v: QuizDraft, size: number): QuizDraft {
  const questions = [...v.questions];
  while (questions.length > size) {
    const hard = questions.filter((q) => q.difficulty === 3).length;
    let drop = questions.findLastIndex((q) => q.difficulty === 2);
    if (drop < 0) drop = questions.findLastIndex((q) => q.difficulty !== 3 || hard > 1);
    questions.splice(drop < 0 ? questions.length - 1 : drop, 1);
  }
  return { ...v, questions };
}

const quiz: SectionJob<QuizDraft> = {
  schema: QuizDraft,
  tidy: (v, course) => trimQuiz({ questions: v.questions.map((q) => tidyTrueFalse(q, course.language)) }, course.shape.quizSize),
  check: (v, course, lesson) => {
    const problems: Problem[] = [];
    v.questions.forEach((q, index) => {
      for (const flag of checkQuestion(q)) problems.push({ index, flag });
      if (q.objective > Math.max(1, lesson.objectiveIds.length)) {
        problems.push({ index, flag: { code: 'unknownObjective', values: { objective: q.objective } } });
      }
    });
    const dupes = new Set(duplicatePrompts(v.questions.map((q) => q.prompt)));
    v.questions.forEach((q, index) => {
      if (dupes.has(q.prompt)) problems.push({ index, flag: { code: 'repeatsQuestion' } });
      if (answerStandsOut(q)) problems.push({ index, flag: { code: 'answerStandsOut' }, advisory: true });
    });
    if (v.questions.length !== course.shape.quizSize) {
      problems.push({ index: null, flag: { code: 'questionCount', values: { got: v.questions.length, want: course.shape.quizSize } } });
    }
    return problems;
  },
  toCommands: (v, problems, course, lesson) => [
    cmd('tasks.fill', {
      lessonId: lesson.id,
      kind: 'quiz',
      flags: flagsAt(problems, null),
      tasks: balanceChoices(v.questions.map((q, i) => toQuestion(q, course, lesson, flagsAt(problems, i)))),
    }),
  ],
};

const assignments: SectionJob<AssignmentDraft> = {
  schema: AssignmentDraft,
  tidy: tidySteps,
  check: (v) =>
    v.rubric.criteria
      .filter((c) => c.descriptors.length !== v.rubric.levels.length)
      .map((c) => ({ index: null, flag: { code: 'criterionLevels', values: { criterion: c.name } } })),
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
      flags: [],
      title: v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: rubric.id,
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [rubric] })];
  },
};

const discussions: SectionJob<DiscussionsDraft> = {
  schema: DiscussionsDraft,
  tidy: tidyFollowUps,
  toCommands: (v, problems, _course, lesson) => [
    cmd('tasks.fill', {
      lessonId: lesson.id,
      kind: 'discussions',
      flags: flagsAt(problems, null),
      tasks: v.discussions.map((d) => ({
        ...base(lesson),
        id: newId('t'),
        kind: 'discussion' as const,
        objectiveIds: [...lesson.objectiveIds],
        flags: [],
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
      flags: flagsAt(problems, null),
      entries: v.entries.map((e) => ({
        id: newId('f'),
        lessonId: lesson.id,
        question: e.question,
        answer: e.answer,
        origin: 'ai' as const,
        edited: false,
        flags: [],
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
      system: systemPrompt(course.language, course.locale),
      context: courseBackground(course),
      prompt: sectionPrompt(course, lesson, kind),
      effort: SECTION_EFFORT[kind],
      schema: job.schema,
      tidy: job.tidy ? (v) => job.tidy!(v, course) : undefined,
      check: job.check ? (v) => job.check!(v, course, lesson) : undefined,
      signal,
    });
    return { commands: job.toCommands(typesetDraft(result.value, course.language), result.problems, course, lesson), flagged: result.problems.length };
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
