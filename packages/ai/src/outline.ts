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

const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * A reading is kept only when the words said to name it are in the brief or an attached source. Asked to leave the
 * readings empty when the brief names none, models still wrote "Textbook chapter on …"; a claim that can be checked
 * against the teacher's own words doesn't depend on the model keeping to the instruction.
 */
export function groundedIn(req: Pick<NewCourseRequest, 'brief' | 'sources'>): (namedIn: string) => boolean {
  const haystacks = [req.brief, ...req.sources.flatMap((s) => [s.title, s.text])].map(plain);
  return (namedIn) => {
    const needle = plain(namedIn);
    return needle.length >= 3 && haystacks.some((h) => ` ${h} `.includes(` ${needle} `));
  };
}

/**
 * Homework counts toward one of the course's graded components or toward nothing. A model asked to name the
 * component "as under grading" still made one up ("Water cycle diagram quiz" for a course graded by lesson quizzes).
 */
function towardGraded(outline: OutlineDraft): (toward: string) => string {
  const items = outline.grading.map((g) => plain(g.item)).filter(Boolean);
  return (toward) => {
    const t = plain(toward);
    const hit = t && items.find((item) => item === t || ` ${item} `.includes(` ${t} `) || ` ${t} `.includes(` ${item} `));
    return hit ? toward.trim() : '';
  };
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
  const named = groundedIn(req);
  const counts = towardGraded(outline);
  const readings = outline.lessons.map((d) => d.readings.filter((r) => named(r.namedIn)).map((r) => clean(r.work)).filter(Boolean));
  const seen = new Set(readings.flat().map(key));
  for (const [i, draft] of outline.lessons.entries()) {
    const lesson = emptyLesson(newId('l'), draft.title, draft.summary);
    lesson.readings = readings[i] ?? [];
    lesson.homework = { kind: draft.homework, toward: draft.homework === 'none' ? '' : counts(draft.homeworkToward) };
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
  const graded = outline.grading.filter((g) => g.item.trim());
  // A course graded one way only is graded 100% that way; with several, a missing weight stays for the teacher to give.
  const whole = graded.length === 1 && graded[0]!.weight === null;
  course.grading = graded.map((g) => ({ id: newId('g'), item: g.item.trim(), weight: whole ? 100 : (g.weight ?? 0) }));
  for (const s of req.sources) {
    const source = createSource(s.title, s.text, 'file');
    course.sources[source.id] = source;
    course.sourceOrder.push(source.id);
  }
  return course;
}
