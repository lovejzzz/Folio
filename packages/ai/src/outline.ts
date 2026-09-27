import { createCourse, createSource, emptyLesson, newId, type Course, type Language, type MaterialKind } from '@folio/core';
import type { Inference } from './inference';
import { runJob, type Problem } from './jobs';
import { outlinePrompt, systemPrompt, type OutlineInput } from './prompts';
import { OutlineDraft } from './schemas';

export interface NewCourseRequest {
  brief: string;
  lessonCount: number;
  minutesPerLesson: number;
  quizSize: number;
  level: string;
  language: Language;
  materials: readonly MaterialKind[];
  sources: { title: string; text: string }[];
}

/** First model call: an outline only. Nothing else is generated until the teacher agrees to it. */
export async function generateOutline(inference: Inference, req: NewCourseRequest, signal?: AbortSignal): Promise<OutlineDraft> {
  const input: OutlineInput = { ...req };
  const result = await runJob(inference, {
    task: 'folio_outline',
    system: systemPrompt(req.language),
    prompt: outlinePrompt(input),
    schema: OutlineDraft,
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
    level: req.level || outline.level,
    subject: outline.subject,
    minutesPerLesson: req.minutesPerLesson,
    quizSize: req.quizSize,
    materials: req.materials,
  });
  for (const draft of outline.lessons) {
    const lesson = emptyLesson(newId('l'), draft.title, draft.summary);
    for (const text of draft.objectives) {
      const id = newId('o');
      course.objectives[id] = { id, text };
      lesson.objectiveIds.push(id);
    }
    course.lessons[lesson.id] = lesson;
    course.lessonOrder.push(lesson.id);
  }
  for (const s of req.sources) {
    const source = createSource(s.title, s.text, 'file');
    course.sources[source.id] = source;
    course.sourceOrder.push(source.id);
  }
  return course;
}
