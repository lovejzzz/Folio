import {
  cellState,
  filledTexts,
  lessonAssignments,
  lessonDiscussions,
  lessonFaq,
  lessonObjectives,
  lessonQuestions,
  sectionFor,
  staleReasons,
  itemFlags,
  type Course,
  type Lesson,
  type MaterialKind,
} from '@folio/core';
import { flagText, type Messages } from '../../i18n';
import type { CellRun } from '../../state/build';

export type CellView = 'none' | 'empty' | 'queued' | 'building' | 'error' | 'ready' | 'attention' | 'stale';

export function cellView(course: Course, lesson: Lesson, kind: MaterialKind, run: CellRun | undefined): CellView {
  if (run) return run;
  const state = cellState(course, lesson, kind);
  return state === 'off' ? 'empty' : state;
}

/** One short fact about a cell: a count of the thing a teacher would count. */
export function cellMetric(course: Course, lesson: Lesson, kind: MaterialKind, t: Messages): string {
  switch (kind) {
    case 'map':
      return t.common.objectives(lesson.objectiveIds.length);
    case 'syllabus': {
      const readings = filledTexts(lesson.readings).length;
      return readings ? t.map.readings(readings) : t.map.scheduled;
    }
    case 'plan':
      return t.common.minutes(lesson.segments.reduce((a, s) => a + s.minutes, 0));
    case 'slides':
      return t.common.slides(lesson.slides.length);
    case 'assignments':
    case 'rubrics': {
      const a = lessonAssignments(course, lesson)[0];
      if (!a) return '';
      if (kind === 'rubrics') {
        const r = a.rubricId ? course.rubrics[a.rubricId] : undefined;
        return r ? t.map.rubricSize(r.criteria.length, r.levels.length) : '';
      }
      return t.map.steps(filledTexts(a.steps).length);
    }
    case 'discussions':
      return t.map.prompts(lessonDiscussions(course, lesson).length);
    case 'quiz':
      return t.common.questions(lessonQuestions(course, lesson).length);
    case 'study':
      return t.map.points(lesson.study.points.length);
    case 'faq':
      return t.common.questions(lessonFaq(course, lesson).length);
  }
}

/**
 * The opening words of what a cell holds, so the map reads as the course: the
 * plan's stages, the slide titles, the first question. Grey bars in the shape
 * of the content looked like a page still loading.
 */
export function cellPreview(course: Course, lesson: Lesson, kind: MaterialKind): string {
  const joined = (texts: string[]) => filledTexts(texts).join(' · ');
  switch (kind) {
    case 'map':
      return joined(lessonObjectives(course, lesson).map((o) => o.text));
    case 'syllabus':
      return joined(lesson.readings);
    case 'plan':
      return joined(lesson.segments.map((s) => s.title));
    case 'slides':
      // The first slide repeats the lesson title beside it.
      return joined(lesson.slides.slice(1).map((s) => s.title));
    case 'assignments':
      return lessonAssignments(course, lesson)[0]?.title ?? '';
    case 'rubrics': {
      const a = lessonAssignments(course, lesson)[0];
      const r = a?.rubricId ? course.rubrics[a.rubricId] : undefined;
      return r ? joined(r.criteria.map((c) => c.name)) : '';
    }
    case 'discussions':
      return lessonDiscussions(course, lesson)[0]?.prompt ?? '';
    case 'quiz':
      return lessonQuestions(course, lesson)[0]?.prompt ?? '';
    case 'study':
      return lesson.study.overview || joined(lesson.study.points.map((p) => p.heading));
    case 'faq':
      return lessonFaq(course, lesson)[0]?.question ?? '';
  }
}

/** Why a cell has a mark, as a sentence for its tooltip and screen readers. */
export function cellReason(course: Course, lesson: Lesson, kind: MaterialKind, view: CellView, t: Messages, error?: string): string {
  if (view === 'error') return error ?? t.map.failed;
  if (view === 'none') return kind === 'rubrics' ? t.homework.noRubricShort : t.homework.kinds.none;
  const section = sectionFor(kind);
  if (view === 'stale' && section) {
    const reasons = staleReasons(course, lesson, section).map((r) => t.changes.reasons[r]);
    return `${t.map.stale}${t.common.period}${t.changes.because(t.changes.reasonList(reasons))}`;
  }
  if (view === 'attention' && section) {
    // The first note is enough for a tooltip; the lesson shows them all.
    const flags = [lesson.gen[section]?.flags ?? [], ...itemFlags(course, lesson, kind).map((f) => f.flags)].find((f) => f.length > 0);
    return flags ? `${t.map.attention}${t.common.period}${flagText(flags, t)}` : t.map.attention;
  }
  return t.map[view === 'ready' ? 'ready' : view === 'empty' ? 'notBuilt' : view === 'queued' ? 'queued' : 'building'];
}

type Loose = Record<string, unknown>;
const list = (v: unknown, key: string): Loose[] => {
  const items = (v as Loose | null)?.[key];
  return Array.isArray(items) ? items.filter((x): x is Loose => typeof x === 'object' && x !== null) : [];
};
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * What a cell shows while its section is written: the same opening words and count as once it is done,
 * read from the answer so far, so the text grows in place and never jumps when it settles.
 */
export function livePreview(kind: MaterialKind, value: unknown, t: Messages): { text: string; metric: string } {
  const joined = (texts: string[]) => texts.filter(Boolean).join(' · ');
  switch (kind) {
    case 'plan': {
      const segments = list(value, 'segments');
      const minutes = segments.reduce((a, s) => a + (typeof s.minutes === 'number' ? s.minutes : 0), 0);
      return { text: joined(segments.map((s) => text(s.title))), metric: minutes ? t.common.minutes(minutes) : '' };
    }
    case 'slides': {
      const slides = list(value, 'slides');
      return { text: joined(slides.slice(1).map((s) => text(s.title))), metric: slides.length ? t.common.slides(slides.length) : '' };
    }
    case 'study': {
      const points = list(value, 'points');
      return { text: text((value as Loose).overview) || joined(points.map((p) => text(p.heading))), metric: points.length ? t.map.points(points.length) : '' };
    }
    case 'quiz': {
      const questions = list(value, 'questions');
      return { text: text(questions[0]?.prompt), metric: questions.length ? t.common.questions(questions.length) : '' };
    }
    case 'assignments': {
      const steps = (value as Loose).steps;
      const n = Array.isArray(steps) ? steps.length : 0;
      return { text: text((value as Loose).title), metric: n ? t.map.steps(n) : '' };
    }
    case 'rubrics': {
      const rubric = (value as Loose).rubric;
      const criteria = list(rubric, 'criteria');
      return { text: joined(criteria.map((c) => text(c.name))), metric: criteria.length ? t.map.rubricSize(criteria.length, list(rubric, 'levels').length) : '' };
    }
    case 'discussions': {
      const discussions = list(value, 'discussions');
      return { text: text(discussions[0]?.prompt), metric: discussions.length ? t.map.prompts(discussions.length) : '' };
    }
    case 'faq': {
      const entries = list(value, 'entries');
      return { text: text(entries[0]?.question), metric: entries.length ? t.common.questions(entries.length) : '' };
    }
    default:
      return { text: '', metric: '' };
  }
}
