import { typesetDraft } from './typeset';
import { balanceChoices, stripTrueFalsePrefix } from './balance';
import { tidyFaq, tidyFollowUps, tidyLessonNames, tidyPlanSources, tidySlides, tidyTrueFalse } from './tidy';
import {
  checkSessionMinutes,
  lessonSessions,
  sessionIndex,
  answerStandsOut,
  checkQuestion,
  cmd,
  hasModulePages,
  lessonPieces,
  duplicatePrompts,
  type Flag,
  newId,
  type Command,
  type Course,
  type GeneratedKind,
  type Lesson,
  type Question,
  type SlideVisual,
} from '@folio/core';
import type { Inference } from './inference';
import { parsePartialJson } from './partial';
import { newVocabulary } from './continuity';
import { workRun } from './sheetRun';
import type { LineRunner } from './sheetCode';
import { alreadySet, assignments, base, continuedInClass, flagsAt, step, test, type SectionJob } from './workJobs';
import { issuePlace, reviewPlan } from './review';
import { PREPARATION_GRADING, checkRunOfShow, isLiveOnline, isMixedOnline } from './live';
import { FORUM_GRADING, checkModule, moduleJob, type ModuleDraft } from './online';
import { mendModule, mendPlan } from './mend';
import { reviewed, type Mend, type Read, type ReadProgress } from './secondRead';
import { reviewModule } from './moduleReview';
import { placeFigures, running, standing, type RunOptions } from './runCells';
import { stuckClaims } from './stuckCheck';
import { withAnswerChecks } from './answerCheck';
import { codeFaults } from './codeLines';
import { withHandouts } from './handouts';
import { startCommands } from './start';
import { runJob, type Problem } from './jobs';
import { SECTION_EFFORT, courseBackground, numberedPassages, sectionPrompt, systemPrompt } from './prompts';
import {
  DiscussionsDraft,
  FaqDraft,
  PlanDraft,
  QuizDraft,
  SlidesDraft,
  StudyDraft,
  type QuestionDraft,
} from './schemas';

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
  tidy: (v, course, lesson) => newVocabulary(tidyLessonNames(tidyPlanSources(v), course, lesson), course, lesson),
  check: (v, course) => [
    ...checkSessionMinutes(
      v.segments.map((s) => ({ session: s.session - 1, minutes: s.minutes })),
      lessonSessions(course),
    ).map((flag): Problem => ({ index: null, flag })),
    ...(isLiveOnline(course) ? checkRunOfShow(v.segments) : []),
  ],
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'plan',
      flags: flagsAt(problems, null),
      content: {
        keyIdeas: v.keyIdeas,
        segments: v.segments.map((s) => ({ ...s, session: sessionIndex(_course, s.session - 1), id: newId('x') })),
        vocabulary: v.vocabulary.map((t) => ({ ...t, id: newId('x') })),
      },
    }),
  ],
};

type SlideDraft = SlidesDraft['slides'][number];

/** A slide's table or chart as the deck keeps it: rows as long as their headings, a value for every category, or nothing at all. */
function slideVisual(table: SlideDraft['table'], chart: SlideDraft['chart']): { visual?: SlideVisual } {
  // The draft is taken loosely, so one odd chart does not cost the deck; only a sound one is kept.
  if (chart && chart.categories.length >= 2 && chart.series.length >= 1 && chart.series.every((x) => x.values.length === chart.categories.length)) return { visual: { kind: 'chart', ...chart, series: chart.series as [typeof chart.series[number]] } };
  if (table && table.columns.length >= 2 && table.rows.length) return { visual: { kind: 'table', columns: table.columns, rows: table.rows.map((r) => table.columns.map((_, i) => r[i] ?? '')) } };
  return {};
}

const slides: SectionJob<SlidesDraft> = {
  schema: SlidesDraft,
  tidy: (v, course) => tidySlides(v, course.language),
  toCommands: (v, problems, _course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'slides',
      flags: flagsAt(problems, null),
      content: { slides: v.slides.map(({ table, chart, ...s }) => ({ ...s, id: newId('x'), ...slideVisual(table, chart) })) },
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

const discussions: SectionJob<DiscussionsDraft> = {
  schema: DiscussionsDraft,
  // In an online course the forum is graded by one rule all term: added here, so every week states the same one.
  tidy: (v, course) => {
    const tidied = tidyFollowUps(v);
    const rules = isMixedOnline(course) ? PREPARATION_GRADING : FORUM_GRADING;
    const rule = rules[course.language] ?? rules.en!;
    // Said only where posts carry a share of the grade: in a course graded by drafts and a report, "full marks" for posts promised marks that exist nowhere.
    const graded = !course.grading.length || course.grading.some((g) => /forum|discussion|participat|post|engagement|prepar|讨论|参与/i.test(g.item));
    if (hasModulePages(course) && !graded) return { discussions: tidied.discussions.slice(0, 1) };
    return hasModulePages(course) ? { discussions: tidied.discussions.slice(0, 1).map((d) => ({ ...d, prompt: d.prompt.includes(rule) ? d.prompt : `${d.prompt.trim()}\n\n${rule}` })) } : tidied;
  },
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
  tidy: tidyFaq,
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

/** How a section is coming along, for showing it take shape. */
export type SectionProgress =
  | { type: 'partial'; value: unknown }
  | { type: 'checking' }
  /** The page's code is being run. */
  | { type: 'running' }
  /** What the plan's review changed, one reason per fix, and how many problems it left for the teacher. */
  | { type: 'reviewed'; fixes: string[]; notes: number }
  /** One round of mending what the review found. */
  | { type: 'mended'; open: string[]; changed: string[]; found: string[]; kept: boolean };

export interface SectionOptions {
  /** Reads a freshly written lesson plan and corrects it before anything is built on it. */
  reviewer?: Inference;
  onProgress?: (progress: SectionProgress) => void;
  /** Told the plan as first written, before its review: what the next lesson's plan can already be written from. */
  onDraft?: (commands: Command[]) => void;
  /** Runs the Python on a module page, so the page shows what the code really prints. */
  run?: RunOptions;
  /** The course as it stands now, for the readings that come later: the lessons before this one may have been corrected since. */
  latest?: () => Course;
}

/** The answer so far, read as JSON each time more of it arrives. */
function partials(onProgress: ((progress: SectionProgress) => void) | undefined): ((soFar: string) => void) | undefined {
  if (!onProgress) return undefined;
  return (soFar) => {
    const value = parsePartialJson(soFar);
    if (value && typeof value === 'object') onProgress({ type: 'partial', value });
  };
}

const pageNote = (p: Problem): Problem => (p.flag.code === 'schemaIssue' && p.flag.values.path === 'module' ? { index: p.index, flag: { code: 'reviewNote', values: { where: 'The page', text: String(p.flag.values.issue) } } } : p);

/** A revision of a section before it is saved, with any problems it leaves for the teacher. */
type Revision<T> = (value: T) => Promise<{ value: T; problems: Problem[] }>;

/** The second read of a lesson plan, as `reviewed` takes it. */
const readPlan = (reviewer: Inference, course: () => Course, lesson: Lesson, signal?: AbortSignal): Read<PlanDraft> => async (draft, since) => {
  const read = await reviewPlan(reviewer, course(), lesson, draft, { signal, since });
  return { value: read.plan, fixes: read.issues.map((i) => i.why), notes: [...read.notes.map((n) => ({ code: 'reviewNote' as const, values: { where: issuePlace(read.plan, n), text: n.why } })), ...read.over] };
};

/**
 * A plan already written, read and mended again and its sheets written from it. For trying a change to the reading on plans
 * that stand: the outline and the plan's first writing stay as they were, so two readings are compared on the same plans.
 */
export async function planReadAgain(inference: Inference, reviewer: Inference, course: Course, lesson: Lesson, signal?: AbortSignal, r?: LineRunner, onProgress?: (progress: ReadProgress) => void): Promise<{ commands: Command[]; flagged: number }> {
  const draft: PlanDraft = {
    keyIdeas: lesson.keyIdeas,
    vocabulary: lesson.vocabulary.map(({ term, definition }) => ({ term, definition })),
    segments: lesson.segments.map(({ kind, session, title, minutes, description, teacherNotes }) => ({ kind, session: session + 1, title, minutes, description, teacherNotes })),
  };
  const mend: Mend<PlanDraft> = async (value, notes) => {
    const mended = await mendPlan(inference, course, lesson, value, notes, signal);
    return { ...mended, value: plan.tidy!(mended.value, course, lesson) };
  };
  const read = await reviewed(readPlan(reviewer, () => course, lesson, signal), draft, onProgress, mend, codeFaults);
  return withHandouts(inference, course, lesson, { commands: plan.toCommands(read.value, read.problems, course, lesson), flagged: read.problems.length }, signal, r);
}

/**
 * The work a lesson holds, piece by piece: each is written as if it were the lesson's only one, a piece that is
 * the same wherever it is set is taken from where it was first written, and the lesson is filled with all of them
 * at once. Written one piece to a lesson, a seminar's weekly paper gave way whenever a larger piece was set.
 */
async function writeWork(course: Course, lesson: Lesson, write: (piece: Lesson, set: string) => Promise<SectionResult>): Promise<SectionResult> {
  const results: SectionResult[] = [];
  const filled = () => results.flatMap((r) => r.commands).flatMap((c) => (c.type === 'tasks.fill' ? [c.payload] : []));
  // Each piece sees the lesson's quiz and the pieces before it, so no problem is set twice.
  const quiz = (course.lessons[lesson.id]?.taskIds ?? []).flatMap((id) => (course.tasks[id]?.kind === 'question' ? [course.tasks[id]] : []));
  for (const homework of lessonPieces(lesson)) {
    const piece = { ...lesson, homework, also: [] };
    const continued = continuedInClass(course, piece);
    results.push(continued ? { commands: continued, flagged: 0 } : await write(piece, alreadySet([...quiz, ...filled().flatMap((f) => f.tasks)])));
  }
  const fills = filled();
  if (!fills.length) return { commands: [], flagged: 0 };
  const merged = cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: fills.flatMap((f) => f.flags), tasks: fills.flatMap((f) => f.tasks), rubrics: fills.flatMap((f) => f.rubrics ?? []) });
  return { commands: [merged], flagged: results.reduce((n, r) => n + r.flagged, 0) };
}

/** The work with its code run: what stopped is corrected or noted on the piece it stands in. */
async function ranWork(inference: Inference, r: LineRunner | undefined, course: Course, lesson: Lesson, signal: AbortSignal | undefined, written: SectionResult): Promise<SectionResult> {
  if (!r) return written;
  const commands = await Promise.all(written.commands.map(async (c) => (c.type === 'tasks.fill' ? cmd('tasks.fill', { ...c.payload, tasks: await workRun(inference, r, course, lesson, c.payload.tasks, signal) }) : c)));
  return { ...written, commands };
}

/**
 * The first week of an online course is written with the course's Start here page. Written or not, the week
 * stands: a page that could not be had is asked for again the next time the first week is written.
 */
async function withStart(inference: Inference, course: Course, lesson: Lesson, signal: AbortSignal | undefined, page: Promise<SectionResult>): Promise<SectionResult> {
  const first = course.lessonOrder[0] === lesson.id && !course.pages.length;
  // Written from the outline with week 1, the page promised a build every week and left out what later weeks came to need:
  // once the last week is written, it is written again from the weeks themselves.
  const others = course.lessonOrder.filter((id) => id !== lesson.id);
  const last = course.lessonOrder.at(-1) === lesson.id && others.length > 0 && others.every((id) => course.lessons[id]?.page.length) && course.pages.every((p) => p.written === 'outline');
  if (!first && !last) return page;
  if (first) {
    const [written, start] = await Promise.all([page, startCommands(inference, course, signal).catch(() => [])]);
    return { ...written, commands: [...written.commands, ...start] };
  }
  const written = await page;
  // The last week's own page is not in the course yet: the rewrite sees it through its commands being applied first.
  return { ...written, commands: [...written.commands, ...(await startCommands(inference, course, signal, true).catch(() => []))] };
}

interface PageRun {
  /** Who writes: asked, too, to set down the causes the page's notes give, so that they can be tried. */
  writer: Inference;
  reviewer?: Inference;
  now: () => Course;
  lesson: Lesson;
  signal?: AbortSignal;
  options: SectionOptions;
  mendPage: Mend<ModuleDraft>;
}

/** A week's page: its Python run, then read and mended with what the run found, then its figures saved. */
async function pageWithRuns(run: <T>(job: SectionJob<T>, revise?: Revision<T>) => Promise<SectionResult>, job: SectionJob<ModuleDraft>, { writer, reviewer, now, lesson, signal, options, mendPage }: PageRun): Promise<SectionResult> {
  const figures: Record<string, Uint8Array> = {};
  const ranFirst = running(options.run, figures, () => options.onProgress?.({ type: 'running' }), (draft, cells) => stuckClaims(writer, draft, cells, signal));
  const read: Read<ModuleDraft> = async (draft, since) => {
    const page = await ranFirst(draft);
    if (page.ran) options.onProgress?.({ type: 'checking' });
    if (!reviewer) return { value: page.value, fixes: [], notes: page.notes };
    const read = await reviewModule(reviewer, now(), lesson, page.value, signal, since, page.ran);
    return { ...read, notes: [...standing(page.notes, read.value), ...read.notes] };
  };
  const revise: Revision<ModuleDraft> | undefined = reviewer || options.run ? (draft) => reviewed(read, draft, options.onProgress, mendPage, (v) => checkModule(v, now())) : undefined;
  const result = await run(job, revise);
  return { ...result, commands: await placeFigures(result.commands, figures, options.run?.saveFigure) };
}

/** Generate one lesson's section. Pure with respect to the course: returns commands, commits nothing. */
export async function generateSection(
  inference: Inference,
  course: Course,
  lessonId: string,
  kind: GeneratedKind,
  signal?: AbortSignal,
  options: SectionOptions = {},
): Promise<SectionResult> {
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error(`No lesson ${lessonId}`);
  // A module page is several times a plan's length, and is given the room.
  const planTask = (k: GeneratedKind) => (k === 'plan' && hasModulePages(course) ? 'folio_module' : `folio_${k}`);
  const run = async <T>(job: SectionJob<T>, revise?: Revision<T>, of: Lesson = lesson, already = ''): Promise<SectionResult> => {
    const result = await runJob(inference, {
      task: planTask(kind),
      system: systemPrompt(course.language, course.locale),
      context: courseBackground(course),
      prompt: sectionPrompt(course, of, kind, already),
      effort: SECTION_EFFORT[kind],
      write: planTask(kind) === 'folio_module',
      schema: job.schema,
      tidy: job.tidy ? (v) => job.tidy!(v, course, of) : undefined,
      check: job.check ? (v) => job.check!(v, course, of) : undefined,
      repair: !(revise && kind === 'plan' && hasModulePages(course)),
      signal,
      onText: partials(options.onProgress),
    });
    if (revise) options.onDraft?.(job.toCommands(typesetDraft(result.value, course.language), result.problems, course, of));
    const { value, problems } = revise ? await revise(result.value) : { value: result.value, problems: [] };
    // The checks are of the text that is kept: a rewritten plan carried the first draft's flags and none of its own.
    const checked = value !== result.value && job.check ? job.check(value, course, of) : result.problems;
    // What a page's checks still find is said to the teacher in the check's own words, as a note they can have fixed:
    // as "came back in the wrong shape" it told them nothing.
    const all = [...checked.map(pageNote), ...problems];
    return { commands: job.toCommands(typesetDraft(value, course.language), all, course, of), flagged: all.length };
  };
  const { reviewer } = options;
  // What a review leaves is put right where it stands, by the writer, and read again.
  const now = () => options.latest?.() ?? course;
  const mendPage: Mend<ModuleDraft> = (draft, notes) => mendModule(inference, now(), lesson, draft, notes, signal);
  const mendLesson: Mend<PlanDraft> = async (draft, notes) => {
    const mended = await mendPlan(inference, now(), lesson, draft, notes, signal);
    return { ...mended, value: plan.tidy!(mended.value, course, lesson) };
  };
  switch (kind) {
    case 'plan':
      if (hasModulePages(course)) return withStart(inference, course, lesson, signal, pageWithRuns(run, moduleJob, { writer: inference, reviewer, now, lesson, signal, options, mendPage }));
      // The sheets the plan hands out are written from the plan as it stands after its review.
      return withHandouts(inference, now(), lesson, await run(plan, reviewer ? (draft) => reviewed(readPlan(reviewer, now, lesson, signal), draft, options.onProgress, mendLesson, codeFaults) : undefined), signal, options.run?.r);
    case 'slides':
      return run(slides);
    case 'study':
      return run(study);
    // Keys and explanations that can be computed are: what fails is noted on the item for the teacher.
    case 'quiz':
      return withAnswerChecks(inference, options.run?.runner, await run(quiz), signal);
    case 'assignments':
      return withAnswerChecks(inference, options.run?.runner, await ranWork(inference, options.run?.r, now(), lesson, signal, await writeWork(now(), lesson, (piece, set) => (piece.homework.kind === 'test' ? run(test, undefined, piece, set) : piece.homework.kind === 'step' ? run(step, undefined, piece, set) : run(assignments, undefined, piece, set)))), signal);
    case 'discussions':
      return run(discussions);
    case 'faq':
      return run(faq);
  }
}
