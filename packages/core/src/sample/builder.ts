import { computeBasis } from '../ripple';
import { createCourse, emptyLesson, type NewCourseInput } from '../course';
import { newId } from '../ids';
import { GENERATED_KINDS } from '../materials';
import type { Course, Lesson, Question, QuestionFormat, SegmentKind, SlideLayout } from '../schema';

/**
 * A compact way to write a hand-authored course. Used for the bundled
 * sample course and for tests; nothing here is generated.
 */

export interface QuestionSpec {
  f: QuestionFormat;
  p: string;
  c?: string[];
  a: string;
  e: string;
  d: 1 | 2 | 3;
}

export interface LessonSpec {
  title: string;
  summary: string;
  objectives: string[];
  keyIdeas: string[];
  segments: [SegmentKind, string, number, string, string][];
  vocabulary: [string, string][];
  slides: [SlideLayout, string, string[], string][];
  study: { overview: string; points: [string, string][] };
  quiz: QuestionSpec[];
  assignment: { title: string; prompt: string; steps: string[]; criteria: [string, string[]][] };
  discussions: [string, string[]][];
  faq: [string, string][];
}

export interface CourseSpec extends NewCourseInput {
  policies: string;
  levels: [string, number][];
  lessons: LessonSpec[];
}

function question(spec: QuestionSpec, lessonId: string, objectiveIds: string[]): Question {
  const choices = (spec.c ?? []).map((text) => ({ id: newId('x'), text }));
  const correct = choices.find((c) => c.text === spec.a)?.id ?? null;
  const graded = spec.f === 'choice' || spec.f === 'truefalse';
  return {
    id: newId('t'),
    kind: 'question',
    lessonId,
    objectiveIds,
    sourceRefs: [],
    origin: 'teacher',
    edited: false,
    flags: [],
    format: spec.f,
    prompt: spec.p,
    choices,
    correct,
    answer: graded ? '' : spec.a,
    explanation: spec.e,
    difficulty: spec.d,
  };
}

function fillLesson(course: Course, lesson: Lesson, spec: LessonSpec, levels: CourseSpec['levels']): void {
  lesson.keyIdeas = spec.keyIdeas;
  lesson.segments = spec.segments.map(([kind, title, minutes, description, teacherNotes]) => ({
    id: newId('x'),
    session: 0,
    kind,
    title,
    minutes,
    description,
    teacherNotes,
  }));
  lesson.vocabulary = spec.vocabulary.map(([term, definition]) => ({ id: newId('x'), term, definition }));
  lesson.slides = spec.slides.map(([layout, title, bullets, notes]) => ({ id: newId('x'), layout, title, bullets, notes }));
  lesson.study = {
    overview: spec.study.overview,
    points: spec.study.points.map(([heading, explanation]) => ({ id: newId('x'), heading, explanation })),
  };
  const objectiveIds = lesson.objectiveIds;
  const base = { lessonId: lesson.id, objectiveIds, sourceRefs: [], origin: 'teacher' as const, edited: false, flags: [] };
  const tasks = spec.quiz.map((q) => question(q, lesson.id, objectiveIds));
  const levelRows = levels.map(([label, points]) => ({ id: newId('x'), label, points }));
  const rubricId = newId('r');
  course.rubrics[rubricId] = {
    id: rubricId,
    title: `${spec.assignment.title} rubric`,
    levels: levelRows,
    criteria: spec.assignment.criteria.map(([name, descriptors]) => ({
      id: newId('x'),
      name,
      descriptors: Object.fromEntries(levelRows.map((lv, i) => [lv.id, descriptors[i] ?? ''])),
    })),
  };
  const { title, prompt, steps } = spec.assignment;
  const all = [
    ...tasks,
    { ...base, id: newId('t'), kind: 'assignment' as const, title, prompt, steps, rubricId, answerKey: '' },
    ...spec.discussions.map(([p, followUps]) => ({ ...base, id: newId('t'), kind: 'discussion' as const, prompt: p, followUps })),
  ];
  for (const task of all) course.tasks[task.id] = task;
  lesson.taskIds = all.map((t) => t.id);
  for (const [q, a] of spec.faq) {
    const id = newId('f');
    course.faq[id] = { id, lessonId: lesson.id, question: q, answer: a, origin: 'teacher', edited: false, flags: [] };
    lesson.faqIds.push(id);
  }
}

export function buildCourse(spec: CourseSpec): Course {
  const course = createCourse(spec);
  course.policies = spec.policies;
  course.status = 'ready';
  for (const ls of spec.lessons) {
    const lesson = emptyLesson(newId('l'), ls.title, ls.summary);
    for (const text of ls.objectives) {
      const id = newId('o');
      course.objectives[id] = { id, text };
      lesson.objectiveIds.push(id);
    }
    course.lessons[lesson.id] = lesson;
    course.lessonOrder.push(lesson.id);
    fillLesson(course, lesson, ls, spec.levels);
  }
  const at = course.createdAt;
  for (const lesson of Object.values(course.lessons)) {
    for (const kind of GENERATED_KINDS) {
      lesson.gen[kind] = { basis: computeBasis(course, lesson, kind), at, edited: false, flags: [] };
    }
  }
  return course;
}
