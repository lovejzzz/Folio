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
          .array(line)
          .max(6)
          .default([])
          .describe('What students read before this lesson, one reading each, e.g. "Hobbes, Leviathan, ch. 13–17"; empty if the brief gives nothing to go on'),
      }),
    )
    .min(1),
  grading: z
    .array(
      z.object({
        item: line.describe('A graded component, e.g. "Problem sets" or "Final exam"'),
        weight: z.number().min(0).max(100).describe('Its share of the final grade, in percent'),
      }),
    )
    .default([])
    .describe('Only the components and weights the brief states; empty if it does not say'),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

export const PlanDraft = z.object({
  keyIdeas: z.array(line).min(2).max(5),
  segments: z
    .array(
      z.object({
        kind: z.enum(['warmup', 'teach', 'practice', 'discuss', 'check', 'close']),
        title: line,
        minutes: z.number().int().min(1),
        description: line.describe('What the teacher and students do, concretely'),
        teacherNotes: z.string().describe('Tips, common misconceptions, or an empty string'),
      }),
    )
    .min(3)
    .max(8),
  vocabulary: z.array(z.object({ term: line, definition: line })).max(8),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export const SlidesDraft = z.object({
  slides: z
    .array(
      z.object({
        layout: z.enum(['title', 'bullets', 'question', 'quote']),
        title: line,
        bullets: z.array(line).max(5),
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
  choices: z.array(z.string()).default([]).describe('Options for choice and truefalse questions; empty for others'),
  answer: line.describe('For choice and truefalse: the exact text of the correct choice. Otherwise the model answer'),
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
  steps: z.array(line).min(2).max(6),
  rubric: z.object({
    levels: z.array(z.object({ label: line, points: z.number().min(0) })).min(3).max(5),
    criteria: z
      .array(z.object({ name: line, descriptors: z.array(line).describe('One descriptor per level, same order as levels') }))
      .min(2)
      .max(5),
  }),
});
export type AssignmentDraft = z.infer<typeof AssignmentDraft>;

export const DiscussionsDraft = z.object({
  discussions: z.array(z.object({ prompt: line, followUps: z.array(line).max(6).describe('Up to three') })).min(1).max(3),
});
export type DiscussionsDraft = z.infer<typeof DiscussionsDraft>;

export const FaqDraft = z.object({
  entries: z.array(z.object({ question: line, answer: line })).min(1).max(4),
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
  operations: z.array(PlanOperation).describe('Empty if the request cannot be done with these operations'),
});
export type CoursePlanDraft = z.infer<typeof CoursePlanDraft>;
