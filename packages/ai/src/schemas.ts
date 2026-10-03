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
      }),
    )
    .default([])
    .describe('Every graded component the brief names, with the weights it states; empty if it does not say how the course is graded'),
  policies: z.string().default('').describe('The class policies (late work, attendance, integrity, accommodations) as the brief or attached syllabus states them, one per paragraph; empty when they state none'),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

export const PlanDraft = z.object({
  keyIdeas: z.array(line).min(2).max(5),
  segments: z
    .array(
      z.object({
        kind: z.enum(['warmup', 'teach', 'practice', 'discuss', 'check', 'break', 'close']),
        session: z.number().int().min(1).default(1).describe('Which of the lesson\'s sessions it belongs to, counted from 1; always 1 when the lesson meets once'),
        title: line,
        minutes: z.number().int().min(1),
        description: line.describe('What the teacher and students do, concretely'),
        teacherNotes: z.string().describe('Tips, common misconceptions, or an empty string'),
      }),
    )
    .min(3)
    .max(8),
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
  explanation: line,
  difficulty: z.number().int().min(1).max(3),
  expression: z.string().nullable().default(null).describe('For arithmetic answers, the calculation, e.g. "(4+5+9)/3"; else null'),
  objective: z.number().int().min(1).describe('Which objective this assesses (1-based)'),
  sourcePassage: z.number().int().nullable().default(null).describe('Number of the source passage it draws on, or null'),
});
export type QuestionDraft = z.infer<typeof QuestionDraft>;

export const QuizDraft = z.object({ questions: z.array(QuestionDraft).min(1) });
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
      .min(2)
      .max(5),
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
