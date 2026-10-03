import { z } from 'zod';

/**
 * Online courses. A course taught in a room is written for its teacher: a plan of timed segments. A course
 * taught online with no set meeting time is written for its student: each week is a module page they work
 * through alone, made of the blocks below, with a short kit for the instructor beside it.
 */

const id = z.string().min(1);
const text = z.string();

/** How the course meets: in a room, online with no set time, online live, or a weekly module with one live session. */
export const DeliverySchema = z.enum(['inperson', 'online-async', 'online-sync', 'online-mixed']);
export type Delivery = z.infer<typeof DeliverySchema>;

/** What an online format commits the teacher to. Asked once; every value is an assumption they can change. */
export const OnlineSchema = z.object({
  /** Live sessions a week, and how long each runs; 0 for a course with no required live time. */
  liveSessions: z.number().int().min(0).max(5).default(0),
  liveMinutes: z.number().int().min(0).max(300).default(0),
  breakouts: z.boolean().default(true),
  polls: z.boolean().default(true),
  classSize: z.number().int().min(1).max(2000).default(25),
  recorded: z.boolean().default(true),
  /** Hours of student work a week, everything counted: about nine for a three-credit course. */
  hoursPerWeek: z.number().min(1).max(60).default(9),
});
export type Online = z.infer<typeof OnlineSchema>;

export const CalloutKindSchema = z.enum(['checkpoint', 'stuck', 'why', 'tip', 'warning', 'version']);
export type CalloutKind = z.infer<typeof CalloutKindSchema>;

/** What a student does for an item on the week's checklist. */
export const ActivityKindSchema = z.enum(['read', 'watch', 'build', 'practice', 'check', 'discuss', 'submit']);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

/**
 * A picture or clip. `src` is empty until the media is made: the block is then a slot, and `shows` says exactly
 * what the picture must show so the teacher (or Folio) can make it. `alt` is what a student who can't see it reads.
 */
const media = { src: text.default(''), alt: text.default(''), caption: text.default(''), shows: text.default('') };

export const StepSchema = z.object({
  id,
  text,
  /** A screenshot under the step, where the target is hard to find or the result is worth seeing. */
  shot: z.object(media).optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const ChecklistItemSchema = z.object({ id, label: text, activity: ActivityKindSchema, minutes: z.number().int().min(0).max(1200), due: text.default('') });
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const PageBlockSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text }),
  z.object({ id, type: z.literal('text'), text }),
  z.object({ id, type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(text) }),
  /** Numbered actions, one per step, continuing across the blocks of one part. */
  z.object({ id, type: z.literal('steps'), items: z.array(StepSchema) }),
  z.object({ id, type: z.literal('callout'), kind: CalloutKindSchema, title: text.default(''), text }),
  /** Code to type or read, as it is: never typeset. */
  z.object({ id, type: z.literal('code'), language: text.default(''), code: text, caption: text.default('') }),
  z.object({ id, type: z.literal('image'), ...media }),
  z.object({ id, type: z.literal('video'), ...media, poster: text.default(''), minutes: z.number().min(0).max(60).default(0), transcript: text.default(''), /** A short silent recording of the screen, shown for its motion: it has no words to transcribe. */ clip: z.boolean().default(false) }),
  z.object({ id, type: z.literal('file'), href: text.default(''), label: text, role: z.enum(['starter', 'checkpoint', 'solution', 'resource']).default('resource'), shows: text.default('') }),
  z.object({ id, type: z.literal('checklist'), items: z.array(ChecklistItemSchema) }),
  z.object({ id, type: z.literal('terms'), items: z.array(z.object({ term: text, meaning: text })) }),
]);
export type PageBlock = z.infer<typeof PageBlockSchema>;
export type PageBlockType = PageBlock['type'];

/** The instructor's part of a week taught online: what to post, what to look for, what to say. Never shown to students. */
export const FacilitationSchema = z.object({
  announcement: text.default(''),
  watchFor: z.array(text).default([]),
  feedback: z.array(text).default([]),
  atRisk: text.default(''),
});
export type Facilitation = z.infer<typeof FacilitationSchema>;

/** A page of the course that belongs to no week: Start here, how the course works, the schedule. */
export const CoursePageSchema = z.object({ id, title: text, blocks: z.array(PageBlockSchema), /** 'teacher' for what only the instructor sees: what is left for them to add before the course opens. */ audience: z.enum(['student', 'teacher']).default('student') });
export type CoursePage = z.infer<typeof CoursePageSchema>;

export const isOnline = (course: { delivery?: Delivery }): boolean => (course.delivery ?? 'inperson') !== 'inperson';
/** A course whose weekly unit is a module page for the student, not a plan for the teacher. */
export const hasModulePages = (course: { delivery?: Delivery }): boolean => course.delivery === 'online-async' || course.delivery === 'online-mixed';

/** Minutes of student work a page's checklist adds up to. */
export function pageMinutes(page: readonly PageBlock[]): number {
  return page.reduce((n, b) => n + (b.type === 'checklist' ? b.items.reduce((m, i) => m + i.minutes, 0) : 0), 0);
}

/** Every picture and clip on a page, the ones under steps included, with the block or step that holds it. */
export interface PageMedia {
  id: string;
  kind: 'image' | 'video';
  src: string;
  alt: string;
  shows: string;
  transcript?: string;
  minutes?: number;
}

export function pageMedia(page: readonly PageBlock[]): PageMedia[] {
  return page.flatMap((b): PageMedia[] => {
    if (b.type === 'image') return [{ id: b.id, kind: 'image' as const, src: b.src, alt: b.alt, shows: b.shows }];
    if (b.type === 'video') return [{ id: b.id, kind: 'video' as const, src: b.src, alt: b.alt, shows: b.shows, transcript: b.transcript, minutes: b.minutes }];
    if (b.type === 'steps') return b.items.flatMap((s) => (s.shot ? [{ id: s.id, kind: 'image' as const, src: s.shot.src, alt: s.shot.alt, shows: s.shot.shows }] : []));
    return [];
  });
}

/** The page as plain text, for digests and for hashing: what a student reads, in order. */
export function pageText(page: readonly PageBlock[]): string {
  const line = (b: PageBlock): string => {
    switch (b.type) {
      case 'heading':
        return `${'#'.repeat(b.level)} ${b.text}`;
      case 'text':
        return b.text;
      case 'list':
        return b.items.map((i) => `- ${i}`).join('\n');
      case 'steps':
        return b.items.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
      case 'callout':
        return `[${b.kind}] ${[b.title, b.text].filter(Boolean).join(': ')}`;
      case 'code':
        return b.code;
      case 'image':
      case 'video':
        return `[${b.type}: ${b.alt || b.shows}]`;
      case 'file':
        return `[file: ${b.label}]`;
      case 'checklist':
        return b.items.map((i) => `- ${i.label} (${i.minutes} min)`).join('\n');
      case 'terms':
        return b.items.map((t) => `${t.term}: ${t.meaning}`).join('\n');
    }
  };
  return page.map(line).join('\n');
}
