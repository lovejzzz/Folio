import { cmd, type Command, type Course, type Flag, type GeneratedKind, type Lesson, type Task } from '@folio/core';
import { z } from 'zod';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { MATERIALS, lessonView, type MaterialName } from './lessonView';
import { courseBackground, lessonContext, systemPrompt } from './prompts';

/**
 * The last read of a lesson, once all of it is written. The plan is checked before anything is built on it, and
 * each quiz key is computed; but the slides, sheets, guide, FAQ, quiz and graded work are written from the plan
 * side by side, and nothing read them together. In sixteen university lessons read by hand, fifteen had something
 * that would have stopped the class: a deadline given two ways, a histogram "on the board" that no slide held, a
 * poll with no choices, a rubric grading what the brief never asked, a mean worked out twice with two results. One
 * reader given the whole lesson found three in four of those for under three cents; a change of words it is sure
 * of is made where it stands, and the rest is left for the teacher as a note on the material it concerns.
 */

const line = z.string().min(1);

export const LastReadDraft = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(['disagree', 'missing', 'impossible', 'false', 'misplaced']),
        in: z.enum(MATERIALS).describe('The material that must change, by the name on its tag'),
        why: line.describe('For the teacher: what is wrong and what is right, in a sentence or two; when something must be prepared by hand, exactly what'),
        find: z.string().describe('The exact words to replace, copied character for character from that material, where they stand only once; empty when no change of words puts it right'),
        replace: z.string().describe('What stands in their place, complete; empty when "find" is empty'),
      }),
    )
    .max(12)
    .default([]),
});
export type LastReadDraft = z.infer<typeof LastReadDraft>;
export type Finding = LastReadDraft['findings'][number];

const ASK = [
  'You are the last reader of one lesson before a teacher uses it. Its plan was written first; the slides, sheets, study guide, FAQ, quiz, discussion prompts and graded work were then written from the plan, each by a writer who saw none of the others. Below is everything students are shown, tagged by material, then what only the teacher sees. Nothing else exists for this lesson: a figure, text, dataset, form or question that it has someone use and that is not written out here does not exist, unless the teacher is told to prepare it. The course\'s textbook and the readings the lesson was set, what other lessons hold, and the teacher\'s own syllabus are not missing.',
  'Find only what would make the lesson fail in use.',
  'disagree: two materials differ on something a student or the teacher acts on: a deadline, a value, a name, which text is read, what is handed in, when it is collected, how it is graded.',
  'missing: something the lesson depends on is not there: a figure "on the board", a text students must have in hand, the items of an activity, the choices of a poll, the prompt of a piece of writing, the data a task needs; or graded work that sets no task of its own.',
  'impossible: it cannot be done as written: more than a segment\'s minutes hold, a rubric that grades what was never asked or cannot be in the work, preparation asked of students before anyone could have told them.',
  'false: a fact, number, key, worked answer, behaviour of code or explanation that is wrong. Work every number out, and read code as its language runs it today; a choice question with two defensible answers is false.',
  'misplaced: words meant for the writer or the teacher in what students read, or what an edit left behind that changes the meaning.',
  'One finding for each place that must change: what is put right in one place (a deadline, which text is read, when a quiz is sat, a value) is put right in every material that says it, the plan\'s segment, the slide, its speaker note, the guide, the FAQ, the work and its key, or it is a new contradiction. Where materials disagree, what the lesson was set to hold (given above the materials) and then the plan decide which is right, and the other changes. Give "find" and "replace" whenever a change of words puts it right, and write in what is missing when the materials already settle it (the choices of a poll, a prompt, the items of an activity, a task the plan describes): "find" is then the sentence it belongs with and "replace" that sentence with the addition. A picture cannot be added in words: say in "why" what the teacher must draw or bring, with its numbers. Copy "find" from one line of the material as it stands, without the dash, number or letter in front of it and without the labels of this view; what runs over several lines is a finding for each. A fault a change of words can put right is put right that way, never left as advice. Never bring in a date, a policy or a source the materials do not give, never point anyone to a sheet, file or text that is not written out here, and never take away a reading or a material: where one is needed and absent, say so in "why" and change nothing.',
  '"why" stands alone, for a teacher who sees nothing else: where it is, what is wrong, and exactly what to do or what the right value is, with no word of other findings.',
  'Leave out style, preferences, what a teacher might do differently, what is merely thin, and a deadline or a name that says the same thing in other words. A chart shown in brackets is drawn on its slide, a picture or video in brackets is made later from what its brackets say, and the lesson\'s quiz questions stand beside any graded paper: neither is missing or in the way. An empty list is the right answer for a lesson that works.',
].join('\n');

export function lastReadPrompt(course: Course, lesson: Lesson): string {
  const view = lessonView(course, lesson);
  return [`What the lesson was set to hold:\n${lessonContext(course, lesson)}`, ASK, `<students_see>\n${view.students}\n</students_see>`, `<teacher_only>\n${view.teacher}\n</teacher_only>`].join('\n\n');
}

/** Fields that name or place things, never words to read. */
const NOT_WORDS = new Set(['id', 'lessonId', 'rubricId', 'correct', 'objectiveIds', 'sourceRefs', 'kind', 'type', 'layout', 'origin', 'format', 'language', 'href', 'poster', 'ran', 'flags']);

/** A value with the words replaced wherever they stand in it, and how often they stood there. */
function swap<T>(value: T, find: string, replace: string): { value: T; hits: number } {
  if (typeof value === 'string') {
    const hits = value.split(find).length - 1;
    return { value: (hits ? value.split(find).join(replace) : value) as T, hits };
  }
  let hits = 0;
  const inner = <V>(v: V): V => {
    const s = swap(v, find, replace);
    hits += s.hits;
    return s.value;
  };
  if (Array.isArray(value)) return { value: value.map(inner) as T, hits };
  if (value && typeof value === 'object') return { value: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, NOT_WORDS.has(k) ? v : inner(v)])) as T, hits };
  return { value, hits: 0 };
}

/** What the view puts before words that are the material's own: an item's dash, number or letter, a label and its colon, a bracketed kind. */
const LEAD = /^\s*(?:-\s+|\d+\.\s+|[A-H]\.\s+|\[[^\]\n]{1,40}\]\s*|[^:\n]{1,80}:\s+)/;

/** One line's words replaced where they stand once; when they stand nowhere as given, again with what the view put in front taken off both. */
function placedLine<T>(value: T, find: string, replace: string): { value: T; hits: number } {
  let [f, r] = [find, replace];
  for (let tries = 0; tries < 4; tries++) {
    const got = swap(value, f, r);
    const lead = LEAD.exec(f)?.[0];
    if (got.hits || !lead || lead.length >= f.length) return got;
    [f, r] = [f.slice(lead.length), r.startsWith(lead) ? r.slice(lead.length) : r];
  }
  return { value, hits: 0 };
}

/**
 * A change placed in a material. The reader copies what it was shown, labels and all, and often several lines at
 * once: a quarter of its changes were found nowhere and became notes saying what the text should have said. Lines
 * are placed one by one, and all of them or none.
 */
export function placed<T>(value: T, find: string, replace: string): { value: T; hits: number } {
  const [from, to] = [find.split('\n'), replace.split('\n')];
  if (from.length === 1 || from.length !== to.length) return placedLine(value, find, replace);
  let now = value;
  for (const [i, line] of from.entries()) {
    if (line === to[i] || !line.trim()) continue;
    const got = placedLine(now, line, to[i]!);
    if (got.hits !== 1) return { value, hits: 0 };
    now = got.value;
  }
  return { value: now, hits: now === value ? 0 : 1 };
}

/** What each material is kept as, so a change of words can be made in it and written back. */
interface Held {
  plan: Pick<Lesson, 'segments' | 'keyIdeas' | 'vocabulary'>;
  handout: Lesson['handouts'];
  page: Lesson['page'];
  slides: Lesson['slides'];
  study: Lesson['study'];
  faq: Course['faq'][string][];
  quiz: Task[];
  discussions: Task[];
  assignments: { tasks: Task[]; rubrics: Course['rubrics'][string][] };
}

const KIND: Record<MaterialName, GeneratedKind> = { plan: 'plan', handout: 'plan', page: 'plan', slides: 'slides', study: 'study', faq: 'faq', quiz: 'quiz', discussions: 'discussions', assignments: 'assignments' };
const LABEL: Record<MaterialName, string> = { plan: 'The plan', handout: 'A handout', page: 'The page', slides: 'The slides', study: 'The study guide', faq: 'The FAQ', quiz: 'The quiz', discussions: 'The discussion prompts', assignments: 'The graded work' };

function held(course: Course, lesson: Lesson): Held {
  const tasks = lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Task => Boolean(t));
  const work = tasks.filter((t) => t.kind === 'assignment');
  const rubrics = work.flatMap((t) => (t.kind === 'assignment' && t.rubricId && course.rubrics[t.rubricId] ? [course.rubrics[t.rubricId]!] : []));
  return {
    plan: { segments: lesson.segments, keyIdeas: lesson.keyIdeas, vocabulary: lesson.vocabulary },
    handout: lesson.handouts,
    page: lesson.page,
    slides: lesson.slides,
    study: lesson.study,
    faq: lesson.faqIds.map((id) => course.faq[id]).filter((f): f is Course['faq'][string] => Boolean(f)),
    quiz: tasks.filter((t) => t.kind === 'question'),
    discussions: tasks.filter((t) => t.kind === 'discussion'),
    assignments: { tasks: work, rubrics },
  };
}

/** The commands that write a kind's materials back as they now stand, with what is left to look at. */
function refill(lesson: Lesson, kind: GeneratedKind, h: Held, flags: Flag[]): Command {
  switch (kind) {
    case 'plan':
      return cmd('section.fill', { lessonId: lesson.id, kind, flags, content: { ...h.plan, page: lesson.page.length ? h.page : undefined, facilitation: lesson.facilitation, handouts: h.handout } });
    case 'slides':
      return cmd('section.fill', { lessonId: lesson.id, kind, flags, content: { slides: h.slides } });
    case 'study':
      return cmd('section.fill', { lessonId: lesson.id, kind, flags, content: h.study });
    case 'faq':
      return cmd('faq.fill', { lessonId: lesson.id, entries: h.faq, flags });
    case 'quiz':
      return cmd('tasks.fill', { lessonId: lesson.id, kind, flags, tasks: h.quiz });
    case 'discussions':
      return cmd('tasks.fill', { lessonId: lesson.id, kind, flags, tasks: h.discussions });
    default:
      return cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags, tasks: h.assignments.tasks, rubrics: h.assignments.rubrics });
  }
}

export interface LessonRead {
  commands: Command[];
  /** Changes of words made, and notes left for the teacher. */
  fixed: number;
  noted: number;
}

/**
 * The findings carried out: a change of words is made when its words stand exactly once in a material the teacher
 * has not edited; anything else becomes a note on that material.
 */
export function applyLastRead(course: Course, lesson: Lesson, findings: Finding[]): LessonRead {
  const now = held(course, lesson);
  const notes = new Map<GeneratedKind, Flag[]>();
  const touched = new Set<GeneratedKind>();
  let fixed = 0;
  for (const f of findings) {
    const kind = KIND[f.in];
    if (!lesson.gen[kind]) continue;
    const swapped = f.find.trim() && !lesson.gen[kind].edited ? placed(now[f.in], f.find, f.replace) : null;
    if (swapped?.hits === 1) {
      // A question whose words changed is no longer the one whose key was computed.
      const settled = f.in === 'quiz' ? (swapped.value as Task[]).map((t, i) => (JSON.stringify(t) === JSON.stringify(now.quiz[i]) ? t : { ...t, checked: false })) : swapped.value;
      (now[f.in] as unknown) = settled;
      touched.add(kind);
      fixed += 1;
    } else notes.set(kind, [...(notes.get(kind) ?? []), { code: 'reviewNote', values: { where: LABEL[f.in], text: f.why } }]);
  }
  const kinds = [...new Set([...touched, ...notes.keys()])];
  const commands = kinds.map((kind) => refill(lesson, kind, now, [...(lesson.gen[kind]?.flags ?? []), ...(notes.get(kind) ?? [])]));
  return { commands, fixed, noted: [...notes.values()].flat().length };
}

/** Read a finished lesson whole. A read that cannot be had changes nothing: the lesson stands as it was written. */
export async function lastRead(reviewer: Inference, course: Course, lessonId: string, signal?: AbortSignal): Promise<LessonRead> {
  const lesson = course.lessons[lessonId];
  const none: LessonRead = { commands: [], fixed: 0, noted: 0 };
  if (!lesson || !lesson.gen.plan) return none;
  try {
    const result = await runJob(reviewer, { task: 'folio_last_read', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: lastReadPrompt(course, lesson), effort: 'low', schema: LastReadDraft, repair: false, signal });
    return applyLastRead(course, lesson, result.value.findings);
  } catch (error) {
    if (signal?.aborted) throw error;
    return none;
  }
}
