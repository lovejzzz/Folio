import { z } from 'zod';
import { FlagSchema } from './flags';
import { MATERIAL_KINDS, GENERATED_KINDS } from './materials';

/**
 * The course document: the single source of truth. Every entity has a
 * stable ID and every relationship is an ID, never an array position.
 * Collections are records keyed by ID so edits address entities, not
 * indexes, which keeps undo and AI proposals safe when order changes.
 */

export const SCHEMA_VERSION = 2;

const id = z.string().min(1);
const text = z.string();

export const LanguageSchema = z.enum(['en', 'zh-CN']);
export type Language = z.infer<typeof LanguageSchema>;

export const MaterialKindSchema = z.enum(MATERIAL_KINDS);
export const GeneratedKindSchema = z.enum(GENERATED_KINDS);

/** Hashes of the inputs a generated section was built from. */
export const BasisSchema = z.record(z.string(), z.string());
export type Basis = z.infer<typeof BasisSchema>;

export const GenMetaSchema = z.object({
  basis: BasisSchema,
  at: z.string(),
  /** True once the teacher has changed anything in this section. */
  edited: z.boolean(),
  /** What needs a look in the section as a whole; empty when nothing does. */
  flags: z.array(FlagSchema),
});
export type GenMeta = z.infer<typeof GenMetaSchema>;

export const OriginSchema = z.enum(['ai', 'teacher']);
export type Origin = z.infer<typeof OriginSchema>;

export const ObjectiveSchema = z.object({ id, text });
export type Objective = z.infer<typeof ObjectiveSchema>;

export const SegmentKindSchema = z.enum(['warmup', 'teach', 'practice', 'discuss', 'check', 'close']);
export type SegmentKind = z.infer<typeof SegmentKindSchema>;

/**
 * A kind of class meeting. Most courses meet once a lesson; a university week
 * is often a lecture and a seminar, a lab, or a problem class, each with its
 * own length and its own part of the lesson plan.
 */
export const SessionKindSchema = z.enum(['class', 'lecture', 'seminar', 'lab', 'problems']);
export type SessionKind = z.infer<typeof SessionKindSchema>;
export const SessionSchema = z.object({ kind: SessionKindSchema, minutes: z.number().int().min(5).max(300) });
export type Session = z.infer<typeof SessionSchema>;

export const SegmentSchema = z.object({
  id,
  /** Which of the lesson's sessions it belongs to, counted from 0; always 0 in a lesson that meets once. */
  session: z.number().int().min(0).default(0),
  kind: SegmentKindSchema,
  title: text,
  minutes: z.number().int().min(0).max(600),
  description: text,
  teacherNotes: text,
});
export type Segment = z.infer<typeof SegmentSchema>;

export const TermSchema = z.object({ id, term: text, definition: text });
export type Term = z.infer<typeof TermSchema>;

export const SlideLayoutSchema = z.enum(['title', 'bullets', 'question', 'quote']);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const SlideSchema = z.object({
  id,
  layout: SlideLayoutSchema,
  title: text,
  bullets: z.array(text),
  notes: text,
});
export type Slide = z.infer<typeof SlideSchema>;

export const StudyPointSchema = z.object({ id, heading: text, explanation: text });
export type StudyPoint = z.infer<typeof StudyPointSchema>;

/**
 * What students hand in from a lesson, as the course's assessment plan has it:
 * a graded assignment, a short ungraded step toward a larger graded piece (a
 * thesis, an outline, a draft), or nothing. A course graded by weekly quizzes
 * and one final essay has an essay to write once, not every week.
 */
export const HomeworkKindSchema = z.enum(['assignment', 'step', 'none']);
export type HomeworkKind = z.infer<typeof HomeworkKindSchema>;
export const HomeworkSchema = z.object({
  kind: HomeworkKindSchema,
  /** The graded component it counts toward, in the grading's words ("Final essay"); empty if none is named. */
  toward: text,
});
export type Homework = z.infer<typeof HomeworkSchema>;

export const LessonSchema = z.object({
  id,
  title: text,
  summary: text,
  objectiveIds: z.array(id),
  /** What students read before this lesson, one reading per line. */
  readings: z.array(text).default([]),
  /**
   * Further reading the model proposed, unchecked. Kept apart from readings:
   * never exported, and it joins the readings only when the teacher adds it.
   */
  suggestedReadings: z.array(text).default([]),
  // Courses saved before this had an assignment in every lesson.
  homework: HomeworkSchema.default({ kind: 'assignment', toward: '' }),
  segments: z.array(SegmentSchema),
  keyIdeas: z.array(text),
  vocabulary: z.array(TermSchema),
  slides: z.array(SlideSchema),
  study: z.object({ overview: text, points: z.array(StudyPointSchema) }),
  /** Order of this lesson's tasks (questions, assignments, discussions). */
  taskIds: z.array(id),
  faqIds: z.array(id),
  gen: z.partialRecord(GeneratedKindSchema, GenMetaSchema),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const SourceRefSchema = z.object({ sourceId: id, passageId: id });
export type SourceRef = z.infer<typeof SourceRefSchema>;

const taskBase = {
  id,
  lessonId: id,
  objectiveIds: z.array(id),
  sourceRefs: z.array(SourceRefSchema),
  origin: OriginSchema,
  edited: z.boolean(),
  flags: z.array(FlagSchema),
};

export const ChoiceSchema = z.object({ id, text });
export type Choice = z.infer<typeof ChoiceSchema>;

export const QuestionFormatSchema = z.enum(['choice', 'truefalse', 'short', 'numeric']);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

export const QuestionSchema = z.object({
  ...taskBase,
  kind: z.literal('question'),
  format: QuestionFormatSchema,
  prompt: text,
  choices: z.array(ChoiceSchema),
  /** ID of the correct choice for choice and true/false questions. */
  correct: id.nullable(),
  /** Model answer for short and numeric questions. */
  answer: text,
  explanation: text,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type Question = z.infer<typeof QuestionSchema>;

export const AssignmentSchema = z.object({
  ...taskBase,
  kind: z.literal('assignment'),
  title: text,
  prompt: text,
  steps: z.array(text),
  rubricId: id.nullable(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const DiscussionSchema = z.object({
  ...taskBase,
  kind: z.literal('discussion'),
  prompt: text,
  followUps: z.array(text),
});
export type Discussion = z.infer<typeof DiscussionSchema>;

export const TaskSchema = z.discriminatedUnion('kind', [QuestionSchema, AssignmentSchema, DiscussionSchema]);
export type Task = z.infer<typeof TaskSchema>;
export type TaskKind = Task['kind'];

export const RubricLevelSchema = z.object({ id, label: text, points: z.number().min(0) });
export type RubricLevel = z.infer<typeof RubricLevelSchema>;

export const CriterionSchema = z.object({
  id,
  name: text,
  /** Descriptor text keyed by level ID. */
  descriptors: z.record(z.string(), text),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const RubricSchema = z.object({
  id,
  title: text,
  levels: z.array(RubricLevelSchema),
  criteria: z.array(CriterionSchema),
});
export type Rubric = z.infer<typeof RubricSchema>;

export const FaqEntrySchema = z.object({
  id,
  lessonId: id.nullable(),
  question: text,
  answer: text,
  origin: OriginSchema,
  edited: z.boolean(),
  flags: z.array(FlagSchema),
});
export type FaqEntry = z.infer<typeof FaqEntrySchema>;

export const PassageSchema = z.object({ id, start: z.number().int(), end: z.number().int() });
export type Passage = z.infer<typeof PassageSchema>;

export const SourceSchema = z.object({
  id,
  title: text,
  kind: z.enum(['text', 'file']),
  text,
  passages: z.array(PassageSchema),
  addedAt: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const MaterialConfigSchema = z.object({
  enabled: z.boolean(),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type MaterialConfig = z.infer<typeof MaterialConfigSchema>;

export const OverrideSchema = z.object({
  id,
  view: MaterialKindSchema,
  entityId: id,
  field: z.string(),
  value: text,
});
export type Override = z.infer<typeof OverrideSchema>;

/** One component of the course grade, e.g. "Midterm exam" at 30%. */
/** A weight of 0 is one the brief didn't state: the component is shown without a share until the teacher gives one. */
export const GradeItemSchema = z.object({ id, item: text, weight: z.number().min(0).max(100) });
export type GradeItem = z.infer<typeof GradeItemSchema>;

export const CourseStatusSchema = z.enum(['planning', 'building', 'ready']);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const CourseSchema = z.object({
  id,
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: CourseStatusSchema,
  title: text,
  summary: text,
  /** What the teacher originally asked for, kept for context. */
  brief: text,
  language: LanguageSchema,
  /** The teacher's locale (e.g. "en-GB"), so spelling, currency and units follow it. Empty if unknown. */
  locale: z.string().default(''),
  audience: z.object({ level: text, subject: text }),
  shape: z.object({
    /** The whole lesson: with sessions, the sum of theirs. */
    minutesPerLesson: z.number().int().min(5).max(600),
    quizSize: z.number().int().min(1).max(40),
    /** Two or more when each lesson meets more than once (a lecture, then a seminar); empty when it meets once. */
    sessions: z.array(SessionSchema).default([]),
  }),
  policies: text,
  /** How the course is graded, as the teacher stated it. Empty when not stated. */
  grading: z.array(GradeItemSchema).default([]),
  objectives: z.record(z.string(), ObjectiveSchema),
  lessons: z.record(z.string(), LessonSchema),
  lessonOrder: z.array(id),
  tasks: z.record(z.string(), TaskSchema),
  rubrics: z.record(z.string(), RubricSchema),
  faq: z.record(z.string(), FaqEntrySchema),
  sources: z.record(z.string(), SourceSchema),
  sourceOrder: z.array(id),
  materials: z.record(MaterialKindSchema, MaterialConfigSchema),
  overrides: z.array(OverrideSchema),
});
export type Course = z.infer<typeof CourseSchema>;
