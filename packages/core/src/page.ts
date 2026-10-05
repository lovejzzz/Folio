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
const media = {
  src: text.default(''),
  alt: text.default(''),
  caption: text.default(''),
  shows: text.default(''),
  /** What looking at the picture beside its step found: where the two disagree, and personal details readable in it. Gone once the picture is replaced. */
  check: z.object({ problems: z.array(text).default([]), personal: z.array(text).default([]) }).optional(),
};

export const StepSchema = z.object({
  id,
  text,
  /** A screenshot under the step, where the target is hard to find or the result is worth seeing. */
  shot: z.object(media).optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const ChecklistItemSchema = z.object({ id, label: text, activity: ActivityKindSchema, minutes: z.number().int().min(0).max(1200), due: text.default('') });
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

/**
 * What an exhibit is made of. An exhibit is something the course itself wrote, shown as the thing it is: a page
 * of the student's notes as it should stand, a model memo, a filled-in table. It used to be asked for as a
 * picture ("a screenshot of the notes page with four rows…"), which a teacher then had to make by hand from the
 * description; seven picture places in ten were of this kind. As blocks it is real text: read aloud, edited in
 * place, and a real table in a Word file.
 */
export const ExhibitBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text }),
  z.object({ type: z.literal('para'), text }),
  z.object({ type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(text) }),
  /** "Question: …" on a form or a notes page; an empty value is a line still to be filled. */
  z.object({ type: z.literal('field'), label: text, value: text.default('') }),
  /** Every row as long as the columns; an empty cell is an empty string. */
  z.object({ type: z.literal('table'), columns: z.array(text), rows: z.array(z.array(text)), caption: text.default('') }),
  /** Room for the student's own words. */
  z.object({ type: z.literal('yours'), hint: text.default(''), /** Lines of room it leaves: a sentence takes two, a worked problem six, a drawing ten. */ lines: z.number().int().min(1).max(24).default(3) }),
]);
export type ExhibitBlock = z.infer<typeof ExhibitBlockSchema>;

/** Something in an exhibit the page points at, with what it says of it: the exact words, a column's heading or a row's first cell. */
export const ExhibitMarkSchema = z.object({ quote: text, note: text });
export type ExhibitMark = z.infer<typeof ExhibitMarkSchema>;

const exhibit = {
  /** notes: the student's own working document as it should now stand; document: a model to study; plain: a bare table or comparison. */
  frame: z.enum(['notes', 'document', 'plain']).default('plain'),
  title: text.default(''),
  /** One part, or two side by side (before and after). */
  parts: z.array(z.object({ label: text.default(''), blocks: z.array(ExhibitBlockSchema) })).min(1).max(2),
  marks: z.array(ExhibitMarkSchema).default([]),
  caption: text.default(''),
  /** Shown closed until the student opens it: it holds what they are about to write or work out themselves. */
  reveal: z.boolean().default(false),
};

/**
 * A sheet a lesson in a room puts in students' hands: a worksheet, an exit ticket, an organizer, cards to cut out,
 * a text to read. A plan used to name these and leave them to the teacher ("hand out the sorting cards"): in six
 * courses, nearly half of what a lesson needed was left to be made. Here it is written in full, ready to print,
 * with its answers kept apart for the teacher.
 */
export const HandoutSchema = z.object({
  id,
  title: text,
  kind: z.enum(['worksheet', 'organizer', 'reading', 'cards', 'slips', 'reference']).default('worksheet'),
  /** Where in the lesson it is used, in the plan's own words ("Guided practice"). */
  usedIn: text.default(''),
  /** How many to print: "One per student", "One set per group". */
  copies: text.default(''),
  blocks: z.array(ExhibitBlockSchema),
  /** The answers and what to look for, for the teacher only; empty for a sheet with nothing to mark. */
  key: text.default(''),
  /** A copy of the sheet before it, with supports for students still learning the language. Said to the teacher, never on the sheet. */
  supports: z.boolean().default(false),
});
export type Handout = z.infer<typeof HandoutSchema>;

export const PageBlockSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text }),
  z.object({ id, type: z.literal('text'), text }),
  z.object({ id, type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(text) }),
  /** Numbered actions, one per step, continuing across the blocks of one part. */
  z.object({ id, type: z.literal('steps'), items: z.array(StepSchema) }),
  z.object({ id, type: z.literal('callout'), kind: CalloutKindSchema, title: text.default(''), text }),
  /** Code to type or read, as it is: never typeset. */
  z.object({ id, type: z.literal('code'), language: text.default(''), code: text, caption: text.default(''), /** On an output: what really ran the code above to print it ("Python 3.14.2, pandas 3.0.2"). Absent when it is as the writer wrote it. */ ran: text.optional() }),
  z.object({ id, type: z.literal('image'), ...media }),
  z.object({ id, type: z.literal('video'), ...media, poster: text.default(''), minutes: z.number().min(0).max(60).default(0), transcript: text.default(''), /** A short silent recording of the screen, shown for its motion: it has no words to transcribe. */ clip: z.boolean().default(false) }),
  z.object({ id, type: z.literal('file'), href: text.default(''), label: text, role: z.enum(['starter', 'checkpoint', 'solution', 'resource']).default('resource'), shows: text.default('') }),
  z.object({ id, type: z.literal('exhibit'), ...exhibit }),
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
  /** What every student's work holds once the week is done: the next weeks are written against it. */
  leaves: z.array(text).default([]),
  /** What the page says of a tool that no source of the teacher's gives: to be tried on the teacher's own installation. */
  toCheck: z.array(text).default([]),
});
export type Facilitation = z.infer<typeof FacilitationSchema>;

/** A page of the course that belongs to no week: Start here, how the course works, the schedule. */
export const CoursePageSchema = z.object({ id, title: text, blocks: z.array(PageBlockSchema), /** 'teacher' for what only the instructor sees: what is left for them to add before the course opens. */ audience: z.enum(['student', 'teacher']).default('student'), /** What Folio wrote it from: the outline alone, or the weeks once they were all written. */ written: z.enum(['outline', 'weeks']).optional() });
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

/**
 * A picture, clip or file the teacher added on this device is not in the course: the course holds `media:<id>`
 * and the device holds the bytes. A path (a sample course's `/samples/…`) is the file itself and needs neither.
 */
const LOCAL_MEDIA = 'media:';
export const isLocalMedia = (ref: string): boolean => ref.startsWith(LOCAL_MEDIA) && ref.length > LOCAL_MEDIA.length;
export const localMediaId = (ref: string): string | null => (isLocalMedia(ref) ? ref.slice(LOCAL_MEDIA.length) : null);
export const localMediaRef = (id: string): string => `${LOCAL_MEDIA}${id}`;

/**
 * The types a kept file may be shown as. A file is opened at an address of Folio's own, where a page or an SVG
 * could run script with the teacher's courses and keys in reach: so only what can never run is shown as itself,
 * and anything else, whatever a backup or a server says it is, is a download and nothing more.
 */
const SHOWN_AS_ITSELF = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']);
export const safeMediaType = (type: string): string => (SHOWN_AS_ITSELF.has(type.trim().toLowerCase()) ? type.trim().toLowerCase() : 'application/octet-stream');

/** Every reference a page makes to something kept on the device, once each: pictures, step shots, videos, their posters, files. */
export function pageMediaRefs(page: readonly PageBlock[]): string[] {
  const refs = page.flatMap((b): string[] => {
    if (b.type === 'image') return [b.src];
    if (b.type === 'video') return [b.src, b.poster];
    if (b.type === 'file') return [b.href];
    if (b.type === 'steps') return b.items.map((s) => s.shot?.src ?? '');
    return [];
  });
  return [...new Set(refs.filter(isLocalMedia))];
}

/**
 * A checklist item outside the week's hours, by how its label says so: work a student may skip, and what a student
 * does only in place of something else (the recording, "if you miss the session"). Counted, a 9-hour week read as 10.
 */
export const isOutsideHours = (label: string): boolean => /\boptional\b|\bif you miss(ed)?\b/i.test(label);

/** "HopStart.zip": a label that is the file's own name, which a download or an export keeps. */
export const isFileName = (label: string): boolean => /\.\w{2,5}$/.test(label.trim());

/** One block of an exhibit as plain text. */
export function exhibitBlockText(b: ExhibitBlock): string {
  switch (b.type) {
    case 'heading':
    case 'para':
      return b.text;
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'field':
      return `${b.label}: ${b.value}`;
    case 'table':
      return [b.columns.join(' | '), ...b.rows.map((r) => r.join(' | ')), b.caption].filter(Boolean).join('\n');
    case 'yours':
      return b.hint ? `(${b.hint})` : '';
  }
}

/** An exhibit as plain text: its title, each part under its label, what the page points at, its caption. */
export function exhibitText(b: Extract<PageBlock, { type: 'exhibit' }>): string {
  const parts = b.parts.map((p) => [p.label, ...p.blocks.map(exhibitBlockText)].filter(Boolean).join('\n'));
  const marks = b.marks.map((m) => `[${m.quote}] ${m.note}`);
  return [b.title, ...parts, ...marks, b.caption].filter(Boolean).join('\n');
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
      case 'exhibit':
        return exhibitText(b);
      case 'checklist':
        return b.items.map((i) => `- ${i.label}${i.minutes ? ` (${i.minutes} min)` : ''}`).join('\n');
      case 'terms':
        return b.items.map((t) => `${t.term}: ${t.meaning}`).join('\n');
    }
  };
  return page.map(line).join('\n');
}
