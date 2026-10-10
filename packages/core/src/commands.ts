import type { Draft } from 'immer';
import { emptyLesson } from './course';
import type { Flag } from './flags';
import type { GeneratedKind, MaterialKind } from './materials';
import { computeBasis } from './ripple';
import type { CoursePage, Facilitation, Handout, Online, PageBlock } from './page';
import type {
  Course,
  CourseStatus,
  FaqEntry,
  GradeItem,
  Language,
  Lesson,
  Objective,
  Override,
  Rubric,
  Segment,
  Slide,
  Source,
  StudyPoint,
  SyllabusIssue,
  Task,
  Term,
} from './schema';

/**
 * Every change to a course, typed by the teacher or proposed by AI, is a
 * command. Commands are plain data so they can be logged, previewed as
 * proposals and replayed.
 */

type Fields<T, K extends keyof T> = Partial<Pick<T, K>>;

export type LessonFields = Fields<Lesson, 'title' | 'summary' | 'objectiveIds' | 'readings' | 'suggestedReadings' | 'standards' | 'homework' | 'also'>;
export type PlanFields = Fields<Lesson, 'segments' | 'keyIdeas' | 'vocabulary' | 'page' | 'facilitation' | 'handouts'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type TaskFields = Partial<DistributiveOmit<Task, 'id' | 'kind' | 'lessonId'>>;

export interface SectionContent {
  plan: { segments: Segment[]; keyIdeas: string[]; vocabulary: Term[]; page?: PageBlock[]; facilitation?: Facilitation; handouts?: Handout[] };
  slides: { slides: Slide[] };
  study: { overview: string; points: StudyPoint[] };
}

export type CommandMap = {
  'course.update': {
    title?: string;
    summary?: string;
    policies?: string;
    grading?: GradeItem[];
    language?: Language;
    status?: CourseStatus;
    audience?: Partial<Course['audience']>;
    shape?: Partial<Course['shape']>;
    online?: Partial<Online>;
  };
  'objective.add': { objective: Objective; lessonId: string | null };
  'objective.update': { objectiveId: string; text: string };
  'objective.remove': { objectiveId: string };
  'lesson.insert': { lesson: Pick<Lesson, 'id' | 'title' | 'summary'>; afterId: string | null; objectives?: Objective[] };
  'lesson.update': { lessonId: string } & LessonFields;
  /** Set what students hand in. None also takes away the assignment already written, so nothing exports it. */
  'lesson.homework': { lessonId: string; homework: Lesson['homework'] };
  'lesson.remove': { lessonId: string };
  'lesson.move': { lessonId: string; toIndex: number };
  'section.fill': {
    [K in keyof SectionContent]: { lessonId: string; kind: K; content: SectionContent[K]; flags: Flag[] };
  }[keyof SectionContent];
  'plan.update': { lessonId: string } & PlanFields;
  'slides.update': { lessonId: string; slides: Slide[] };
  'study.update': { lessonId: string; overview?: string; points?: StudyPoint[] };
  'tasks.fill': {
    lessonId: string;
    kind: 'quiz' | 'assignments' | 'discussions';
    tasks: Task[];
    rubrics?: Rubric[];
    flags: Flag[];
  };
  'task.add': { task: Task; afterId: string | null };
  'task.update': { taskId: string; fields: TaskFields };
  'task.remove': { taskId: string };
  'rubric.update': { rubricId: string; rubric: Omit<Rubric, 'id'> };
  'faq.fill': { lessonId: string; entries: FaqEntry[]; flags: Flag[] };
  'faq.add': { entry: FaqEntry };
  'faq.update': { faqId: string; question?: string; answer?: string };
  'faq.remove': { faqId: string };
  'material.set': { kind: MaterialKind; enabled: boolean };
  /** The pages that belong to no week, written when an online course is built. */
  'pages.set': { pages: CoursePage[] };
  'source.add': { source: Source };
  'source.remove': { sourceId: string };
  /** The teacher's own syllabus is this source, or none. */
  'syllabus.own': { sourceId: string | null };
  'syllabus.checked': { issues: SyllabusIssue[]; checkedAt: string };
  'review.keep': { lessonId: string; kind: GeneratedKind };
  /** Settles what a check found on a section or one of its items: all of it, or the one note at `index`. */
  'review.resolve': { lessonId: string; kind: GeneratedKind; itemId: string | null; index?: number };
  'override.set': { override: Override };
  'override.clear': { overrideId: string };
};

export type CommandType = keyof CommandMap;
export type Command = { [K in CommandType]: { type: K; payload: CommandMap[K] } }[CommandType];

export function cmd<K extends CommandType>(type: K, payload: CommandMap[K]): Command {
  return { type, payload } as Command;
}

type Handler<K extends CommandType> = (draft: Draft<Course>, payload: CommandMap[K], at: string) => void;

export class CommandError extends Error {}

function lessonOf(draft: Draft<Course>, lessonId: string): Draft<Lesson> {
  const lesson = draft.lessons[lessonId];
  if (!lesson) throw new CommandError(`No lesson ${lessonId}`);
  return lesson;
}

function markEdited(lesson: Draft<Lesson>, kind: GeneratedKind): void {
  const meta = lesson.gen[kind];
  if (meta) meta.edited = true;
}

function sectionOfTask(task: Task): GeneratedKind {
  return task.kind === 'question' ? 'quiz' : task.kind === 'assignment' ? 'assignments' : 'discussions';
}

function stamp(draft: Draft<Course>, lesson: Draft<Lesson>, kind: GeneratedKind, flags: Flag[], at: string): void {
  lesson.gen[kind] = { basis: computeBasis(draft as Course, lesson as Lesson, kind), at, edited: false, flags };
}

function removeTaskEntity(draft: Draft<Course>, taskId: string): void {
  const task = draft.tasks[taskId];
  if (!task) return;
  if (task.kind === 'assignment' && task.rubricId) delete draft.rubrics[task.rubricId];
  delete draft.tasks[taskId];
}

const handlers: { [K in CommandType]: Handler<K> } = {
  'course.update': (draft, p) => {
    if (p.title !== undefined) draft.title = p.title;
    if (p.summary !== undefined) draft.summary = p.summary;
    if (p.policies !== undefined) draft.policies = p.policies;
    if (p.grading !== undefined) draft.grading = p.grading.map((g) => ({ ...g }));
    if (p.language !== undefined) draft.language = p.language;
    if (p.status !== undefined) draft.status = p.status;
    if (p.audience) Object.assign(draft.audience, p.audience);
    if (p.shape) Object.assign(draft.shape, p.shape);
    if (p.online && draft.online) Object.assign(draft.online, p.online);
  },
  'objective.add': (draft, p) => {
    draft.objectives[p.objective.id] = { ...p.objective };
    if (p.lessonId) lessonOf(draft, p.lessonId).objectiveIds.push(p.objective.id);
  },
  'objective.update': (draft, p) => {
    const objective = draft.objectives[p.objectiveId];
    if (!objective) throw new CommandError(`No objective ${p.objectiveId}`);
    objective.text = p.text;
  },
  'objective.remove': (draft, p) => {
    delete draft.objectives[p.objectiveId];
    for (const lesson of Object.values(draft.lessons)) {
      const i = lesson.objectiveIds.indexOf(p.objectiveId);
      if (i >= 0) lesson.objectiveIds.splice(i, 1);
    }
    for (const task of Object.values(draft.tasks)) {
      const i = task.objectiveIds.indexOf(p.objectiveId);
      if (i >= 0) task.objectiveIds.splice(i, 1);
    }
  },
  'lesson.insert': (draft, p) => {
    if (draft.lessons[p.lesson.id]) throw new CommandError(`Lesson ${p.lesson.id} exists`);
    const lesson = emptyLesson(p.lesson.id, p.lesson.title, p.lesson.summary);
    for (const o of p.objectives ?? []) {
      draft.objectives[o.id] = { ...o };
      lesson.objectiveIds.push(o.id);
    }
    draft.lessons[lesson.id] = lesson;
    const at = p.afterId === null ? 0 : draft.lessonOrder.indexOf(p.afterId) + 1;
    draft.lessonOrder.splice(at < 0 ? draft.lessonOrder.length : at, 0, lesson.id);
  },
  'lesson.homework': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    lesson.homework = { ...p.homework };
    if (p.homework.kind !== 'none' || lesson.also.length) return;
    lesson.taskIds = lesson.taskIds.filter((id) => {
      if (draft.tasks[id]?.kind !== 'assignment') return true;
      removeTaskEntity(draft, id);
      return false;
    });
    delete lesson.gen.assignments;
  },
  'lesson.update': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    if (p.title !== undefined) lesson.title = p.title;
    if (p.summary !== undefined) lesson.summary = p.summary;
    if (p.objectiveIds !== undefined) lesson.objectiveIds = [...p.objectiveIds];
    if (p.readings !== undefined) lesson.readings = [...p.readings];
    if (p.suggestedReadings !== undefined) lesson.suggestedReadings = [...p.suggestedReadings];
    if (p.standards !== undefined) lesson.standards = [...p.standards];
    if (p.homework !== undefined) lesson.homework = { ...p.homework };
    if (p.also !== undefined) lesson.also = p.also.map((x) => ({ ...x }));
  },
  'lesson.remove': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    for (const id of lesson.taskIds) removeTaskEntity(draft, id);
    for (const id of lesson.faqIds) delete draft.faq[id];
    const stillUsed = new Set(
      Object.values(draft.lessons)
        .filter((l) => l.id !== lesson.id)
        .flatMap((l) => l.objectiveIds),
    );
    for (const id of lesson.objectiveIds) if (!stillUsed.has(id)) delete draft.objectives[id];
    delete draft.lessons[p.lessonId];
    draft.lessonOrder.splice(draft.lessonOrder.indexOf(p.lessonId), 1);
  },
  'lesson.move': (draft, p) => {
    const from = draft.lessonOrder.indexOf(p.lessonId);
    if (from < 0) throw new CommandError(`No lesson ${p.lessonId}`);
    draft.lessonOrder.splice(from, 1);
    const to = Math.max(0, Math.min(p.toIndex, draft.lessonOrder.length));
    draft.lessonOrder.splice(to, 0, p.lessonId);
  },
  'section.fill': (draft, p, at) => {
    const lesson = lessonOf(draft, p.lessonId);
    if (p.kind === 'plan') {
      lesson.segments = p.content.segments;
      lesson.keyIdeas = p.content.keyIdeas;
      lesson.vocabulary = p.content.vocabulary;
      lesson.page = p.content.page ?? [];
      lesson.facilitation = p.content.facilitation;
      // Only when the fill brings them: a note put right on the plan fills it again, and must not take its sheets away.
      if (p.content.handouts !== undefined) lesson.handouts = p.content.handouts;
    } else if (p.kind === 'slides') {
      lesson.slides = p.content.slides;
    } else {
      lesson.study = { overview: p.content.overview, points: p.content.points };
    }
    stamp(draft, lesson, p.kind, p.flags, at);
  },
  'plan.update': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    if (p.segments !== undefined) lesson.segments = p.segments;
    if (p.keyIdeas !== undefined) lesson.keyIdeas = p.keyIdeas;
    if (p.vocabulary !== undefined) lesson.vocabulary = p.vocabulary;
    if (p.page !== undefined) lesson.page = p.page;
    if (p.facilitation !== undefined) lesson.facilitation = p.facilitation;
    // What was worked out is the key and the sheet as they were: changed by hand, the key is unchecked again.
    if (p.handouts !== undefined) {
      const was = new Map(lesson.handouts.map((h) => [h.id, JSON.stringify([h.key, h.blocks])]));
      lesson.handouts = p.handouts.map((h) => (h.keyChecked && was.get(h.id) !== JSON.stringify([h.key, h.blocks]) ? { ...h, keyChecked: undefined } : h));
    }
    markEdited(lesson, 'plan');
  },
  'slides.update': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    lesson.slides = p.slides;
    markEdited(lesson, 'slides');
  },
  'study.update': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    if (p.overview !== undefined) lesson.study.overview = p.overview;
    if (p.points !== undefined) lesson.study.points = p.points;
    markEdited(lesson, 'study');
  },
  'tasks.fill': (draft, p, at) => {
    const lesson = lessonOf(draft, p.lessonId);
    const want = p.kind === 'quiz' ? 'question' : p.kind === 'assignments' ? 'assignment' : 'discussion';
    const keep: string[] = [];
    for (const id of lesson.taskIds) {
      const task = draft.tasks[id];
      if (task && task.kind === want) removeTaskEntity(draft, id);
      else keep.push(id);
    }
    for (const rubric of p.rubrics ?? []) draft.rubrics[rubric.id] = rubric;
    for (const task of p.tasks) draft.tasks[task.id] = task;
    lesson.taskIds = [...keep, ...p.tasks.map((t) => t.id)];
    stamp(draft, lesson, p.kind, p.flags, at);
  },
  'task.add': (draft, p) => {
    const lesson = lessonOf(draft, p.task.lessonId);
    draft.tasks[p.task.id] = p.task;
    const i = p.afterId ? lesson.taskIds.indexOf(p.afterId) : -1;
    if (i >= 0) lesson.taskIds.splice(i + 1, 0, p.task.id);
    else lesson.taskIds.push(p.task.id);
    markEdited(lesson, sectionOfTask(p.task));
  },
  'task.update': (draft, p) => {
    const task = draft.tasks[p.taskId];
    if (!task) throw new CommandError(`No task ${p.taskId}`);
    // What was checked is the item as it was: changed, it is unchecked again.
    Object.assign(task, p.fields, { edited: true, checked: false });
    const lesson = draft.lessons[task.lessonId];
    if (lesson) markEdited(lesson, sectionOfTask(task as Task));
  },
  'task.remove': (draft, p) => {
    const task = draft.tasks[p.taskId];
    if (!task) return;
    const lesson = draft.lessons[task.lessonId];
    if (lesson) {
      lesson.taskIds.splice(lesson.taskIds.indexOf(p.taskId), 1);
      markEdited(lesson, sectionOfTask(task as Task));
    }
    removeTaskEntity(draft, p.taskId);
  },
  'rubric.update': (draft, p) => {
    if (!draft.rubrics[p.rubricId]) throw new CommandError(`No rubric ${p.rubricId}`);
    draft.rubrics[p.rubricId] = { id: p.rubricId, ...p.rubric };
    for (const task of Object.values(draft.tasks)) {
      if (task.kind === 'assignment' && task.rubricId === p.rubricId) {
        const lesson = draft.lessons[task.lessonId];
        if (lesson) markEdited(lesson, 'assignments');
      }
    }
  },
  'faq.fill': (draft, p, at) => {
    const lesson = lessonOf(draft, p.lessonId);
    for (const id of lesson.faqIds) delete draft.faq[id];
    for (const entry of p.entries) draft.faq[entry.id] = entry;
    lesson.faqIds = p.entries.map((e) => e.id);
    stamp(draft, lesson, 'faq', p.flags, at);
  },
  'faq.add': (draft, p) => {
    draft.faq[p.entry.id] = p.entry;
    if (p.entry.lessonId) {
      const lesson = lessonOf(draft, p.entry.lessonId);
      lesson.faqIds.push(p.entry.id);
      markEdited(lesson, 'faq');
    }
  },
  'faq.update': (draft, p) => {
    const entry = draft.faq[p.faqId];
    if (!entry) throw new CommandError(`No FAQ entry ${p.faqId}`);
    if (p.question !== undefined) entry.question = p.question;
    if (p.answer !== undefined) entry.answer = p.answer;
    entry.edited = true;
    if (entry.lessonId && draft.lessons[entry.lessonId]) markEdited(lessonOf(draft, entry.lessonId), 'faq');
  },
  'faq.remove': (draft, p) => {
    const entry = draft.faq[p.faqId];
    if (!entry) return;
    if (entry.lessonId && draft.lessons[entry.lessonId]) {
      const lesson = lessonOf(draft, entry.lessonId);
      lesson.faqIds.splice(lesson.faqIds.indexOf(p.faqId), 1);
      markEdited(lesson, 'faq');
    }
    delete draft.faq[p.faqId];
  },
  'material.set': (draft, p) => {
    draft.materials[p.kind].enabled = p.enabled;
  },
  'pages.set': (draft, p) => {
    draft.pages = p.pages;
  },
  'source.add': (draft, p) => {
    draft.sources[p.source.id] = p.source;
    draft.sourceOrder.push(p.source.id);
  },
  'source.remove': (draft, p) => {
    delete draft.sources[p.sourceId];
    const i = draft.sourceOrder.indexOf(p.sourceId);
    if (i >= 0) draft.sourceOrder.splice(i, 1);
    for (const task of Object.values(draft.tasks)) {
      task.sourceRefs = task.sourceRefs.filter((r) => r.sourceId !== p.sourceId);
    }
    if (draft.syllabus?.sourceId === p.sourceId) draft.syllabus = null;
  },
  'syllabus.own': (draft, p) => {
    draft.syllabus = p.sourceId && draft.sources[p.sourceId] ? { sourceId: p.sourceId, check: null } : null;
  },
  'syllabus.checked': (draft, p) => {
    if (draft.syllabus) draft.syllabus.check = { issues: p.issues.map((i) => ({ ...i })), checkedAt: p.checkedAt };
  },
  'review.keep': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    const meta = lesson.gen[p.kind];
    if (meta) meta.basis = computeBasis(draft as Course, lesson as Lesson, p.kind);
  },
  'review.resolve': (draft, p) => {
    const lesson = lessonOf(draft, p.lessonId);
    const holder = p.itemId === null ? lesson.gen[p.kind] : (draft.tasks[p.itemId] ?? draft.faq[p.itemId]);
    if (holder) holder.flags = p.index === undefined ? [] : holder.flags.filter((_, i) => i !== p.index);
  },
  'override.set': (draft, p) => {
    const i = draft.overrides.findIndex(
      (o) => o.view === p.override.view && o.entityId === p.override.entityId && o.field === p.override.field,
    );
    if (i >= 0) draft.overrides.splice(i, 1);
    draft.overrides.push(p.override);
  },
  'override.clear': (draft, p) => {
    const i = draft.overrides.findIndex((o) => o.id === p.overrideId);
    if (i >= 0) draft.overrides.splice(i, 1);
  },
};

export function applyCommand(draft: Draft<Course>, command: Command, at: string): void {
  const handler = handlers[command.type] as Handler<CommandType>;
  handler(draft, command.payload, at);
}
