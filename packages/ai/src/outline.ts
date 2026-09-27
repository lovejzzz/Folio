import { createCourse, createSource, emptyLesson, newId, type Course, type Language, type MaterialKind, type Session } from '@folio/core';
import type { Inference } from './inference';
import { runJob, type Problem } from './jobs';
import { outlinePrompt, systemPrompt, type OutlineInput } from './prompts';
import { OutlineDraft } from './schemas';
import { tidyOutline } from './tidy';

export interface NewCourseRequest {
  brief: string;
  lessonCount: number;
  minutesPerLesson: number;
  /** Two or more when each lesson meets more than once, as the brief says (a lecture and a seminar). */
  sessions?: Session[];
  quizSize: number;
  level: string;
  language: Language;
  /** The teacher's locale, e.g. "en-GB". */
  locale?: string;
  materials: readonly MaterialKind[];
  sources: { title: string; text: string }[];
}

/** First model call: an outline only. Nothing else is generated until the teacher agrees to it. */
export async function generateOutline(inference: Inference, req: NewCourseRequest, signal?: AbortSignal): Promise<OutlineDraft> {
  const input: OutlineInput = { ...req };
  const result = await runJob(inference, {
    task: 'folio_outline',
    system: systemPrompt(req.language, req.locale),
    prompt: outlinePrompt(input),
    schema: OutlineDraft,
    tidy: tidyOutline,
    check: (v): Problem[] =>
      v.lessons.length === req.lessonCount
        ? []
        : [{ index: null, flag: { code: 'lessonCount', values: { got: v.lessons.length, want: req.lessonCount } } }],
    signal,
  });
  return result.value;
}

/** Turn an agreed outline into a course in the planning state. */
export function courseFromOutline(req: NewCourseRequest, outline: OutlineDraft): Course {
  const course = createCourse({
    title: outline.title,
    summary: outline.summary,
    brief: req.brief,
    language: req.language,
    locale: req.locale ?? '',
    level: req.level || outline.level,
    subject: outline.subject,
    minutesPerLesson: req.sessions && req.sessions.length > 1 ? req.sessions.reduce((a, s) => a + s.minutes, 0) : req.minutesPerLesson,
    sessions: req.sessions && req.sessions.length > 1 ? req.sessions : [],
    quizSize: req.quizSize,
    materials: req.materials,
  });
  // One general textbook suggested for every lesson is noise: each work is suggested once, and never when assigned.
  // A reading is a list item, not a sentence: "Goldberger, A course in econometrics." loses its full stop.
  const clean = (r: string) => r.trim().replace(/(?<!\b(?:al|ed|eds|ch|vol|pp|p|no|n\.d))\.$/i, '');
  const key = (r: string) => r.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const seen = new Set(outline.lessons.flatMap((d) => d.readings.map(key)));
  for (const draft of outline.lessons) {
    const lesson = emptyLesson(newId('l'), draft.title, draft.summary);
    lesson.readings = draft.readings.map(clean).filter(Boolean);
    lesson.homework = { kind: draft.homework, toward: draft.homework === 'none' ? '' : draft.homeworkToward.trim() };
    lesson.suggestedReadings = draft.suggestedReadings
      .map(clean)
      .filter((r) => r && !seen.has(key(r)) && seen.add(key(r)));
    for (const text of draft.objectives) {
      const id = newId('o');
      course.objectives[id] = { id, text };
      lesson.objectiveIds.push(id);
    }
    course.lessons[lesson.id] = lesson;
    course.lessonOrder.push(lesson.id);
  }
  course.grading = outline.grading.filter((g) => g.item.trim()).map((g) => ({ id: newId('g'), item: g.item.trim(), weight: g.weight ?? 0 }));
  for (const s of req.sources) {
    const source = createSource(s.title, s.text, 'file');
    course.sources[source.id] = source;
    course.sourceOrder.push(source.id);
  }
  return course;
}
