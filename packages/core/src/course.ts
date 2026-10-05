import { newId } from './ids';
import { MATERIAL_KINDS, TEACHING_ORDER, type MaterialKind } from './materials';
import {
  SCHEMA_VERSION,
  type Assignment,
  type Course,
  type Discussion,
  type FaqEntry,
  type Homework,
  type Language,
  type Lesson,
  type MaterialConfig,
  type Objective,
  type Question,
  type Session,
  type Task,
} from './schema';
import type { Delivery, Online } from './page';

export interface NewCourseInput {
  title: string;
  summary?: string;
  brief?: string;
  language?: Language;
  locale?: string;
  level?: string;
  subject?: string;
  minutesPerLesson?: number;
  sessions?: Session[];
  quizSize?: number;
  materials?: readonly MaterialKind[];
  delivery?: Delivery;
  online?: Online;
}

/** The meetings of each lesson: the sessions when there are several, else one class of the lesson's length. */
export function lessonSessions(course: Course): Session[] {
  return course.shape.sessions.length > 1 ? course.shape.sessions : [{ kind: 'class', minutes: course.shape.minutesPerLesson }];
}

/** The session a segment sits in, kept in range when sessions are taken away. */
export function sessionIndex(course: Course, session: number): number {
  return Math.min(Math.max(0, session), lessonSessions(course).length - 1);
}

export function emptyLesson(idValue: string, title: string, summary = ''): Lesson {
  return {
    id: idValue,
    title,
    summary,
    objectiveIds: [],
    readings: [],
    suggestedReadings: [],
    standards: [],
    homework: { kind: 'assignment', toward: '' },
    also: [],
    segments: [],
    keyIdeas: [],
    vocabulary: [],
    slides: [],
    study: { overview: '', points: [] },
    page: [],
    handouts: [],
    taskIds: [],
    faqIds: [],
    gen: {},
  };
}

export function defaultMaterials(enabled: readonly MaterialKind[] = MATERIAL_KINDS): Course['materials'] {
  const out = {} as Record<MaterialKind, MaterialConfig>;
  for (const kind of MATERIAL_KINDS) out[kind] = { enabled: enabled.includes(kind), options: {} };
  return out;
}

export function createCourse(input: NewCourseInput, now = new Date().toISOString()): Course {
  return {
    id: newId('c'),
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    status: 'planning',
    title: input.title,
    summary: input.summary ?? '',
    brief: input.brief ?? '',
    language: input.language ?? 'en',
    locale: input.locale ?? '',
    audience: { level: input.level ?? '', subject: input.subject ?? '' },
    shape: { minutesPerLesson: input.minutesPerLesson ?? 50, quizSize: input.quizSize ?? 5, sessions: input.sessions ?? [] },
    delivery: input.delivery ?? 'inperson',
    ...(input.online ? { online: input.online } : {}),
    pages: [],
    policies: '',
    grading: [],
    objectives: {},
    lessons: {},
    lessonOrder: [],
    tasks: {},
    rubrics: {},
    faq: {},
    sources: {},
    sourceOrder: [],
    syllabus: null,
    materials: defaultMaterials(input.materials),
    overrides: [],
  };
}

export function orderedLessons(course: Course): Lesson[] {
  return course.lessonOrder.map((id) => course.lessons[id]).filter((l): l is Lesson => Boolean(l));
}

export function lessonNumber(course: Course, lessonId: string): number {
  return course.lessonOrder.indexOf(lessonId) + 1;
}

export function lessonObjectives(course: Course, lesson: Lesson): Objective[] {
  return lesson.objectiveIds.map((id) => course.objectives[id]).filter((o): o is Objective => Boolean(o));
}

/** Objectives in course order: by the first lesson that uses them, then unlinked ones. */
export function orderedObjectives(course: Course): Objective[] {
  const seen = new Set<string>();
  const out: Objective[] = [];
  for (const lesson of orderedLessons(course)) {
    for (const o of lessonObjectives(course, lesson)) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
  }
  for (const o of Object.values(course.objectives)) if (!seen.has(o.id)) out.push(o);
  return out;
}

/** Every piece of work a lesson holds: its main piece first, then the others. */
export function lessonPieces(lesson: Pick<Lesson, 'homework' | 'also'>): Homework[] {
  return [lesson.homework, ...(lesson.also ?? [])].filter((p) => p.kind !== 'none');
}

/**
 * The lessons that set a piece of each graded component, by number: what "four problem sets" comes to in this course.
 * A step toward a piece is not one, and a piece set again each week in the same words is counted each time.
 */
export function componentPieces(course: Pick<Course, 'lessonOrder' | 'lessons'>): Map<string, number[]> {
  const at = new Map<string, number[]>();
  course.lessonOrder.forEach((id, i) => {
    const lesson = course.lessons[id];
    for (const p of lesson ? lessonPieces(lesson) : []) if (p.toward.trim() && p.kind !== 'step') at.set(p.toward.trim(), [...(at.get(p.toward.trim()) ?? []), i + 1]);
  });
  return at;
}

/** The piece an assignment was written for: the one that names its component, else the lesson's main piece. */
export function pieceOf(lesson: Pick<Lesson, 'homework' | 'also'>, assignment: Pick<Assignment, 'toward'>): Homework {
  const toward = (assignment.toward ?? '').trim();
  return (toward && lessonPieces(lesson).find((p) => p.toward.trim() === toward)) || lesson.homework;
}

export function lessonTasks(course: Course, lesson: Lesson): Task[] {
  return lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Task => Boolean(t));
}

export function lessonQuestions(course: Course, lesson: Lesson): Question[] {
  return lessonTasks(course, lesson).filter((t): t is Question => t.kind === 'question');
}

export function lessonAssignments(course: Course, lesson: Lesson): Assignment[] {
  return lessonTasks(course, lesson).filter((t): t is Assignment => t.kind === 'assignment');
}

export function lessonDiscussions(course: Course, lesson: Lesson): Discussion[] {
  return lessonTasks(course, lesson).filter((t): t is Discussion => t.kind === 'discussion');
}

export function lessonFaq(course: Course, lesson: Lesson): FaqEntry[] {
  return lesson.faqIds.map((id) => course.faq[id]).filter((f): f is FaqEntry => Boolean(f));
}

export function enabledKinds(course: Course): MaterialKind[] {
  return MATERIAL_KINDS.filter((k) => course.materials[k].enabled);
}

/** The materials each lesson has, in the order they're taught. The course map and syllabus cover the whole course. */
export function lessonKinds(course: Course): MaterialKind[] {
  return TEACHING_ORDER.filter((k) => course.materials[k].enabled);
}

/** The whole-course documents that are switched on: the course map and the syllabus. */
export function courseKinds(course: Course): MaterialKind[] {
  return MATERIAL_KINDS.filter((k) => !TEACHING_ORDER.includes(k) && course.materials[k].enabled);
}

export function choiceText(question: Question, choiceId: string | null): string {
  if (!choiceId) return '';
  return question.choices.find((c) => c.id === choiceId)?.text ?? '';
}

/** The answer a teacher copy prints: the correct choice, or the model answer. */
export function answerText(question: Question): string {
  if (question.format === 'choice' || question.format === 'truefalse') {
    const index = question.choices.findIndex((c) => c.id === question.correct);
    if (index < 0) return question.answer;
    return `${String.fromCharCode(65 + index)}. ${question.choices[index]?.text ?? ''}`;
  }
  return question.answer;
}

export function countWords(value: string): number {
  const cjk = value.match(/[㐀-鿿豈-﫿]/g)?.length ?? 0;
  const latin = value.replace(/[㐀-鿿豈-﫿]/g, ' ').trim();
  return cjk + (latin ? latin.split(/\s+/).length : 0);
}
