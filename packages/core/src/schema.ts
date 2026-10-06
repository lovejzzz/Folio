import { z } from 'zod';
import { FlagSchema } from './flags';
import { MATERIAL_KINDS, GENERATED_KINDS } from './materials';
import { CoursePageSchema, DeliverySchema, FacilitationSchema, HandoutSchema, OnlineSchema, PageBlockSchema } from './page';

/**
 * The course document: the single source of truth. Every entity has a
 * stable ID and every relationship is an ID, never an array position.
 * Collections are records keyed by ID so edits address entities, not
 * indexes, which keeps undo and AI proposals safe when order changes.
 */

export const SCHEMA_VERSION = 3;

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

export const SegmentKindSchema = z.enum(['warmup', 'teach', 'practice', 'discuss', 'check', 'break', 'close']);
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

/**
 * What a slide shows beside its words: a table, or a chart drawn from numbers. Slides were bullets and nothing
 * else: teachers who rate generated decks call a bulleted list with no visuals unusable, and a comparison across
 * the same headings, or numbers to be compared, is read from a table or a chart and not from five bullets.
 * A chart is always drawn from its numbers, never from an impression of a shape.
 */
export const SlideVisualSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table'), columns: z.array(text), rows: z.array(z.array(text)) }),
  z.object({
    kind: z.literal('chart'),
    chart: z.enum(['bar', 'line']),
    categories: z.array(text),
    series: z.array(z.object({ name: text, values: z.array(z.number()) })).min(1).max(2),
    /** What the numbers are in ("%", "grams"). */
    unit: text.default(''),
    /** The numbers are made up to show a shape, and the slide says so. */
    illustrative: z.boolean().default(false),
  }),
]);
export type SlideVisual = z.infer<typeof SlideVisualSchema>;

export const SlideSchema = z.object({
  id,
  layout: SlideLayoutSchema,
  title: text,
  bullets: z.array(text),
  notes: text,
  visual: SlideVisualSchema.optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const StudyPointSchema = z.object({ id, heading: text, explanation: text });
export type StudyPoint = z.infer<typeof StudyPointSchema>;

/**
 * The graded or handed-in work a lesson holds, as the course's assessment plan has it:
 * a graded assignment, a short ungraded step toward a larger graded piece (a
 * thesis, an outline, a draft), a test taken in class (a quiz, test or exam, written
 * as a paper with its key), a piece graded in class with a rubric (a presentation,
 * a seminar, an interview, work made in the lesson), or nothing. A course graded by
 * weekly quizzes and one final essay has an essay to write once, not every week.
 */
export const HomeworkKindSchema = z.enum(['assignment', 'step', 'test', 'inclass', 'none']);
export type HomeworkKind = z.infer<typeof HomeworkKindSchema>;
export const HomeworkSchema = z.object({
  kind: HomeworkKindSchema,
  /** The graded component it counts toward, in the grading's words ("Final essay"); empty if none is named. */
  toward: text,
  /** The lesson at whose start the work is handed in; absent when it is done in class, or no lesson is named. */
  due: id.optional(),
  /** The same task every time, only its subject changing (a weekly response paper): written once, and set again as it stands. */
  standing: z.boolean().optional(),
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
  /** The standards this lesson serves, by the codes the teacher's brief or sources give ("3.NF.A.2", "MS-LS1-6"). Never invented: a code is kept only when the teacher named it. */
  standards: z.array(text).default([]),
  // Courses saved before this had an assignment in every lesson.
  homework: HomeworkSchema.default({ kind: 'assignment', toward: '' }),
  /**
   * Other work the lesson holds beside its main piece: the weekly memo in the week a project part is set, the
   * brief of a paper in the week its prospectus is due. A course's graded work does not come one piece a lesson.
   */
  also: z.array(HomeworkSchema).default([]),
  segments: z.array(SegmentSchema),
  keyIdeas: z.array(text),
  vocabulary: z.array(TermSchema),
  slides: z.array(SlideSchema),
  study: z.object({ overview: text, points: z.array(StudyPointSchema) }),
  /** An online course's module page for the student: what the plan is in a course with no set meeting time. */
  page: z.array(PageBlockSchema).default([]),
  /** The instructor's kit for the week, in an online course. */
  facilitation: FacilitationSchema.optional(),
  /** The sheets a lesson in a room hands out, written in full: part of its plan. */
  handouts: z.array(HandoutSchema).default([]),
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
  /** Folio computed what the item claims (its key, its stated values) and it held. Gone once the item is changed by hand. */
  checked: z.boolean().optional(),
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
  /** The tasks of an assignment; the questions of a test, each with its points. */
  steps: z.array(text),
  rubricId: id.nullable(),
  /** Worked answers and how to mark them, for the teacher's copy only; empty for work with no single answer. */
  answerKey: text.default(''),
  /** The graded component it was written for, so a lesson with several pieces knows which is which. */
  toward: text.default(''),
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

/** One problem Folio's check found in a syllabus the teacher brought. */
export const SyllabusIssueSchema = z.object({
  kind: z.enum(['error', 'missing', 'unclear']),
  where: text,
  problem: text,
  fix: text,
});
export type SyllabusIssue = z.infer<typeof SyllabusIssueSchema>;

/**
 * The teacher's own syllabus, when they attached one: it is the course's syllabus, and Folio checks it instead
 * of writing one. `check` is null until the check is done.
 */
export const OwnSyllabusSchema = z.object({
  sourceId: id,
  check: z.object({ issues: z.array(SyllabusIssueSchema), checkedAt: z.string() }).nullable(),
});
export type OwnSyllabus = z.infer<typeof OwnSyllabusSchema>;

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
/** "complete" when its pieces are graded complete or incomplete; otherwise they are scored (points, rubric levels). One fact, so every page says the same. */
export const GradeItemSchema = z.object({ id, item: text, weight: z.number().min(0).max(100), judged: z.enum(['levels', 'complete']).optional() });
export type GradeItem = z.infer<typeof GradeItemSchema>;

export const CourseStatusSchema = z.enum(['planning', 'building', 'ready']);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const CourseSchema = z.object({
  id,
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(0),
  /**
   * A fresh random mark on every change. Two tabs can each make their first change in the same millisecond,
   * which gives them the same revision and timestamp; the mark still tells their copies apart.
   */
  stamp: z.string().optional(),
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
    // Up to four sessions of up to 300 minutes each.
    minutesPerLesson: z.number().int().min(5).max(900),
    quizSize: z.number().int().min(1).max(40),
    /** Two or more when each lesson meets more than once (a lecture, then a seminar); empty when it meets once. */
    sessions: z.array(SessionSchema).default([]),
  }),
  /** How the course meets. Courses saved before online ones existed are taught in a room. */
  delivery: DeliverySchema.default('inperson'),
  /** What the online format commits the teacher to; absent in a course taught in a room. */
  online: OnlineSchema.optional(),
  /** Pages that belong to no week: Start here and the like. */
  pages: z.array(CoursePageSchema).default([]),
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
  /** A syllabus the teacher brought, in place of the one Folio would build. Null when they brought none. */
  syllabus: OwnSyllabusSchema.nullable().default(null),
  materials: z.record(MaterialKindSchema, MaterialConfigSchema),
  overrides: z.array(OverrideSchema),
});
export type Course = z.infer<typeof CourseSchema>;
