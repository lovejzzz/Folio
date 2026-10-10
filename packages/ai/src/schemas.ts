import { z } from 'zod';

/**
 * What the model is asked to return. These are deliberately flat and plain:
 * strings and small arrays, no IDs. Mappers turn them into course entities.
 */

const line = z.string().min(1);

export const OutlineDraft = z.object({
  title: line.describe('Course title, specific to the subject'),
  summary: line.describe('Two or three sentences describing the course for a syllabus'),
  subject: line,
  level: line.describe('Grade or level, e.g. "Grade 11" or "First-year university"'),
  lessons: z
    .array(
      z.object({
        title: line.describe('Lesson title naming the actual content, never "Lesson 1" or "Session 1 topic"'),
        summary: line.describe('One sentence on what this lesson covers'),
        objectives: z.array(line).min(1).max(3).describe('Measurable objectives starting with a verb'),
        standards: z.array(z.string()).max(8).default([]).describe('The codes of the standards this lesson serves, copied exactly from the brief or the sources; empty when they name none'),
        readings: z
          .array(
            z.object({
              work: line.describe('One reading, e.g. "Hobbes, Leviathan, ch. 13–17"'),
              namedIn: z.string().describe('The words in the brief, or the title of an attached source, that name this work, copied exactly'),
            }),
          )
          .max(6)
          .default([])
          .describe('What students read before this lesson; empty if the brief and sources name nothing to read'),
        homework: z
          .enum(['assignment', 'step', 'test', 'inclass', 'none'])
          .default('assignment')
          .describe('The graded or handed-in work this lesson holds, following how the brief says the course is assessed'),
        homeworkToward: z.string().default('').describe('The graded component the homework counts toward, named as under "grading"; empty if none'),
        homeworkDue: z.number().int().min(1).nullable().default(null).describe('The number of the lesson at whose start this work is handed in; null when it is done in class, nothing is handed in, or it is due after the last lesson'),
        homeworkStanding: z.boolean().default(false).describe('True only when the same instructions, word for word, serve every time this piece is set: a weekly response paper, a preparation memo, a reading journal (never a problem set, worksheet, lab assignment or quiz, which has its own questions each time); and for work done in class, when it is one piece taken by part of the class in each of several lessons (an oral interview in two groups, a presentation in turns). False when lessons hold different pieces of one component (an organizer in one, a draft in another)'),
        also: z
          .array(
            z.object({
              kind: z.enum(['assignment', 'step', 'test', 'inclass']),
              toward: z.string().default('').describe('The graded component it counts toward, named as under "grading"'),
              due: z.number().int().min(1).nullable().default(null).describe('The number of the lesson at whose start it is handed in, as for "homeworkDue"'),
              standing: z.boolean().default(false).describe('As for "homeworkStanding"'),
            }),
          )
          .max(4)
          .default([])
          .describe('Other work this lesson holds beside its main piece; empty in most lessons'),
        suggestedReadings: z
          .array(line)
          .max(3)
          .default([])
          .describe('University courses only: up to three well-known further readings the teacher might add, e.g. "Okin, Justice, Gender, and the Family, ch. 5"; empty for school courses or when unsure'),
      }),
    )
    .min(1),
  grading: z
    .array(
      z.object({
        item: line.describe('A graded component, e.g. "Problem sets" or "Final exam"'),
        weight: z.number().min(0).max(100).nullable().default(null).describe('Its share of the final grade, in percent; null when the brief gives none'),
        // Asked as a yes or no named "complete", it came back yes for every component of five courses in six: a 60% seminar paper graded on completion.
        scoring: z
          .enum(['scored', 'completion'])
          .default('scored')
          .describe('"completion" only when the brief or syllabus says in so many words that this component is graded complete or incomplete, pass or fail, or for credit on doing it. Otherwise "scored": by points or a rubric, as papers, projects, tests and exams are'),
        // How the piece runs, read once: each writer guessing it, seven of eleven faults that stopped a lesson were one graded
        // piece told two ways by its brief, its key, the plan and the lesson next to it.
        who: z.enum(['individual', 'pair', 'group']).default('individual').describe('Who does one piece of it, as the brief says: "pair" or "group" only when the brief says it is done or handed in by pairs or groups; otherwise "individual"'),
        groupSize: z.number().int().min(2).max(12).nullable().default(null).describe('The size of a group when the brief gives it; otherwise null'),
        prepared: z.boolean().default(false).describe('True only for a piece where a student prepares a turn ahead of the meeting: leading a seminar, presenting, a debate role'),
        handIn: z.enum(['paper', 'online', 'none', 'unsaid']).default('unsaid').describe('"online" when the brief says it is submitted online or through a site; "paper" when the brief says it is handed in on paper or in class; "none" when nothing is handed in (participation, a talk, a discussion led); "unsaid" when the brief does not say'),
        points: z.number().int().min(1).nullable().default(null).describe('The points one piece of it is out of, when the brief says; otherwise null'),
        allowed: z.string().default('').describe('For a quiz, test or exam: what the brief says students may use (for example "closed book, a calculator"), in its words; empty when it does not say'),
        length: z.string().default('').describe('The length the brief sets for one piece of it (for example "750 to 1,000 words"); empty when it sets none'),
        source: z.string().default('').describe('Where the brief says its data, texts or cases come from (for example "a data set the student chooses"); empty when it does not say'),
      }),
    )
    .default([])
    .describe('Every graded component the brief names, with the weights it states; empty if it does not say how the course is graded'),
  setup: z.array(z.string()).max(12).default([]).describe('What is the same at every meeting, as the brief or attached syllabus states it, one fact a line: how many students, how they are seated or grouped, the software and its version, the devices and materials students have, what is not allowed; empty when they state none'),
  policies: z.string().default('').describe('The class policies (late work, attendance, integrity, accommodations) as the brief or attached syllabus states them, one per paragraph; empty when they state none'),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

/** A segment as a plan's writer gives it. A session numbered from 0 is the first: asked for from 1, a mend came back with 0 and was refused whole. */
export const SegmentDraft = z.object({
  kind: z.enum(['warmup', 'teach', 'practice', 'discuss', 'check', 'break', 'close']),
  session: z.preprocess((v) => (typeof v === 'number' && v < 1 ? 1 : v), z.number().int().min(1).default(1)).describe('Which of the lesson\'s sessions it belongs to, counted from 1; always 1 when the lesson meets once'),
  title: line,
  minutes: z.number().int().min(1),
  description: line.describe('What the teacher and students do, concretely'),
  teacherNotes: z.string().describe('Tips, common misconceptions, or an empty string'),
  // The slides were written from the plan's prose and guessed what was to be on the screen: 19 of 33 faults a reading found
  // outside the plan's own were a slide that showed another thing than the plan had, or showed its answer. Said once, here.
  shown: z.array(z.string()).max(12).optional().describe('What is put on the screen for students in this segment, each item written out in full exactly as they will see it: a question with its choices, a prompt, the rows of a table, the numbers of a figure, a short passage. Never an answer students are to work out, and not code that is typed and run live. Leave out when nothing is shown'),
});

/**
 * The segments as the meetings hold them: one of no minutes is no part of a meeting and is left out, and sessions counted
 * from 0 are the same sessions counted from 1 (read one by one, a lecture numbered 0 and a lab numbered 1 became one
 * session of both, and the plan was sent back because the lab then had no minutes).
 */
function asMet(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const kept = v.filter((x: unknown) => !(x && typeof x === 'object' && typeof (x as { minutes?: unknown }).minutes === 'number' && (x as { minutes: number }).minutes < 1));
  const from0 = kept.some((x: unknown) => x && typeof x === 'object' && (x as { session?: unknown }).session === 0);
  return from0 ? kept.map((x: unknown) => (x && typeof x === 'object' && typeof (x as { session?: unknown }).session === 'number' ? { ...x, session: (x as { session: number }).session + 1 } : x)) : kept;
}

export const PlanDraft = z.object({
  keyIdeas: z.array(line).min(2).max(5),
  // A plan could hold eight segments, and a week of a lecture and a lab came back with nine to eleven; given fourteen, a
  // week of 185 minutes came back with more, and one of no minutes among them (the homework, set as a segment). Each
  // time the plan was refused and written again whole, the dearest part of a lesson paid for twice. What has no minutes
  // is no part of the meeting and is left out; the rest is taken as it is.
  segments: z.preprocess(asMet, z.array(SegmentDraft).min(3).max(24)),
  // Up to eight in most lessons; a language lesson lists every word it teaches (a numbers lesson taught 31).
  vocabulary: z.array(z.object({ term: line, definition: line })).max(40),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export const SlidesDraft = z.object({
  slides: z
    .array(
      z.object({
        layout: z.enum(['title', 'bullets', 'question', 'quote']),
        title: line,
        // Five fit a slide; a few more are split over two slides rather than sent back.
        bullets: z.array(line).max(10).describe('At most five'),
        notes: z.string().describe('Speaker notes for the teacher'),
        table: z
          .object({ columns: z.array(z.string()).max(6), rows: z.array(z.array(z.string())).max(10) })
          .optional()
          .describe('Only for a slide that compares things under the same headings: the table itself, cells of a few words; the slide then has two bullets at most'),
        chart: z
          .object({
            chart: z.enum(['bar', 'line']).describe('"bar" to compare amounts, "line" for change over time or along a scale'),
            categories: z.array(z.string()).max(12).describe('What stands along the bottom, in order'),
            series: z.array(z.object({ name: z.string().default(''), values: z.array(z.number()).max(12) })).max(2).describe('One value for each category; a second series only to compare two things'),
            unit: z.string().default('').describe('What the numbers are in'),
            illustrative: z.boolean().default(false).describe('true when the numbers are made up to show a shape; real or given numbers are false'),
          })
          .optional()
          .describe('Only for numbers the lesson compares or follows: the numbers themselves, the plan\'s own where it gives them'),
      }),
    )
    .min(3)
    .max(10),
});
export type SlidesDraft = z.infer<typeof SlidesDraft>;

export const StudyDraft = z.object({
  overview: line,
  points: z.array(z.object({ heading: line, explanation: line })).min(2).max(5),
});
export type StudyDraft = z.infer<typeof StudyDraft>;

export const QuestionDraft = z.object({
  format: z.enum(['choice', 'truefalse', 'short', 'numeric']),
  prompt: line,
  choices: z.array(z.string()).default([]).describe('For choice: the options. For truefalse: ["True", "False"], never the statement. Empty for others'),
  answer: line.describe('For choice: the exact text of the correct option. For truefalse: "True" or "False". Otherwise the model answer'),
  explanation: line.describe('Why the answer is right, worked through; for a choice question also the slip behind each wrong choice, a clause each, naming the choice by its own words'),
  difficulty: z.number().int().min(1).max(3),
  expression: z.string().nullable().default(null).describe('For arithmetic answers, the calculation, e.g. "(4+5+9)/3"; else null'),
  objective: z.number().int().min(1).describe('Which objective this assesses (1-based)'),
  sourcePassage: z.number().int().nullable().default(null).describe('Number of the source passage it draws on, or null'),
});
export type QuestionDraft = z.infer<typeof QuestionDraft>;

/**
 * A question whose kind was left out, told from what it holds. Asked through a provider that does not hold an answer to its
 * schema, the quiz's writer left "format" off every question of every quiz: each quiz was sent back whole and paid for
 * twice. Its choices say which it is; nothing is asked again for what can be read.
 */
export function withFormat(q: unknown): unknown {
  if (!q || typeof q !== 'object' || ('format' in q && (q as { format?: unknown }).format)) return q;
  const { choices, answer } = q as { choices?: unknown; answer?: unknown };
  const options = Array.isArray(choices) ? choices.map((c) => String(c).trim().toLowerCase()) : [];
  const format = options.length === 2 && options.includes('true') && options.includes('false') ? 'truefalse' : options.length >= 2 ? 'choice' : /^\s*[-+−]?[\d.,]+\s*%?\s*$/.test(String(answer ?? '')) ? 'numeric' : 'short';
  return { ...q, format };
}

export const QuizDraft = z.object({ questions: z.array(z.preprocess(withFormat, QuestionDraft)).min(1) });
export type QuizDraft = z.infer<typeof QuizDraft>;

export const AssignmentDraft = z.object({
  title: line,
  prompt: line,
  // The prompt asks for two to six; a seventh step is no reason for a repair call.
  steps: z.array(line).min(2).max(8),
  rubric: z.object({
    levels: z.array(z.object({ label: line, points: z.number().min(0) })).min(3).max(5),
    criteria: z
      .array(z.object({ name: line, descriptors: z.array(line).describe('One descriptor per level, same order as levels') }))
      .max(5)
      .describe('Two to five; empty only for a piece that is all questions with one right answer each, scored by the answers'),
  }),
  answerKey: z.string().default('').describe('For the teacher: the worked answer to each step, one per line, numbered as the steps are; empty when the work has no single answer, such as an essay'),
});
export type AssignmentDraft = z.infer<typeof AssignmentDraft>;

/** A test, quiz or exam taken in class, as a paper a teacher can print and mark. */
export const TestDraft = z.object({
  title: line,
  instructions: line.describe('What students read at the top of the paper: time allowed, what they may use, how to show their work'),
  questions: z
    .array(
      z.object({
        question: line.describe('The question as printed, complete in itself; a multiple-choice question lists its choices as A, B, C and D'),
        points: z.number().int().min(1).max(100),
        answer: line.describe('The answer for the key, with the working or the points a marker looks for'),
      }),
    )
    .min(3)
    .max(40),
});
export type TestDraft = z.infer<typeof TestDraft>;

/** A short ungraded step toward a larger graded piece: no rubric, since the piece has its own. */
export const StepDraft = z.object({
  // A step once came back as a second lesson plan under the lesson's own title: a step is a few sentences.
  title: line.max(120),
  prompt: line.max(1200).describe('What to do, in a few sentences'),
  steps: z.array(line).min(1).max(6),
});
export type StepDraft = z.infer<typeof StepDraft>;

export const DiscussionsDraft = z.object({
  discussions: z.array(z.object({ prompt: line, followUps: z.array(line).max(6).describe('Up to three') })).min(1).max(3),
});
export type DiscussionsDraft = z.infer<typeof DiscussionsDraft>;

export const FaqDraft = z.object({
  entries: z.array(z.object({ question: line, answer: line })).min(1).max(8).describe('Up to four'),
});
export type FaqDraft = z.infer<typeof FaqDraft>;

export const TextDraft = z.object({ text: line });
export const ExplanationDraft = z.object({ explanation: line });

const lessonNo = z.number().int().min(1);
export const PlanOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('addLesson'),
    after: z.number().int().min(0).describe('Insert after this lesson number; 0 means first'),
    title: line,
    summary: line,
    objectives: z.array(line).min(1).max(3),
  }),
  z.object({ op: z.literal('removeLesson'), lesson: lessonNo }),
  z.object({ op: z.literal('renameLesson'), lesson: lessonNo, title: line }),
  z.object({ op: z.literal('moveLesson'), lesson: lessonNo, to: lessonNo }),
  z.object({ op: z.literal('addObjective'), lesson: lessonNo, text: line }),
  // Ranges are checked against SHAPE_LIMITS after parsing (see planCheck.ts), so an
  // out-of-range request is shown to the teacher as such rather than quietly "repaired".
  z.object({ op: z.literal('setQuizSize'), size: z.number().int().min(1).describe('Questions per quiz') }),
  z.object({ op: z.literal('setMinutes'), minutes: z.number().int().min(1).describe('Minutes per lesson') }),
  z.object({ op: z.literal('setLevel'), level: line }),
  z.object({
    op: z.literal('setMaterial'),
    material: z.enum(['map', 'syllabus', 'plan', 'slides', 'assignments', 'rubrics', 'discussions', 'quiz', 'study', 'faq']),
    enabled: z.boolean(),
  }),
]);
export type PlanOperation = z.infer<typeof PlanOperation>;

export const CoursePlanDraft = z.object({
  summary: line.describe('One sentence, in the teacher\'s words, of what will change'),
  note: z
    .string()
    .default('')
    .describe('Only if the plan differs from the literal request or might surprise the teacher: one short sentence saying why. Otherwise empty'),
  operations: z.array(PlanOperation).describe('Empty if the request cannot be done with these operations'),
});
export type CoursePlanDraft = z.infer<typeof CoursePlanDraft>;
