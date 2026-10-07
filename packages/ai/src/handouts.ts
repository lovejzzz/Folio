import { cmd, lessonPieces, newId, type Command, type Course, type Handout, type Lesson, type Segment } from '@folio/core';
import { z } from 'zod';
import { codeFaults } from './codeLines';
import { ExhibitBlockDraft, exhibitPart } from './exhibit';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { placed } from './lastRead';
import { say } from './lessonView';
import { courseBackground, lessonContext, systemPrompt } from './prompts';

/**
 * The sheets a lesson in a room hands out. A plan says "students sort the cards" or "hand out the exit ticket",
 * and until now that was all there was of the cards and the ticket: of what the lessons of six courses needed
 * made, nearly half was left to the teacher. Once a plan is settled, everything it puts in students' hands on
 * paper is written in full, from the plan's own numbers and examples, with the answers apart for the teacher.
 */

const line = z.string().min(1);

export const HandoutsDraft = z.object({
  handouts: z
    .array(
      z.object({
        title: line.describe('What the sheet is called, as the plan calls it'),
        kind: z.enum(['worksheet', 'organizer', 'reading', 'cards', 'slips', 'reference']).describe('"worksheet": questions with room to answer. "organizer": a table or frame to fill in. "reading": a text to read. "cards": a set to cut out, one card to a table row. "slips": a short ticket, several to a page. "reference": something to keep and look at'),
        usedIn: line.describe('The title of the plan\'s segment that uses it'),
        copies: line.describe('"One per student", "One set per group", "One to project"'),
        blocks: z.array(ExhibitBlockDraft).min(1).describe('The sheet itself, in full and in order, as a student gets it'),
        key: z.string().default('').describe('Leave empty: the key is written from the finished sheet'),
      }),
    )
    .max(6)
    .default([]),
});
export type HandoutsDraft = z.infer<typeof HandoutsDraft>;

type Content = { keyIdeas: string[]; segments: Segment[] };

const planText = (plan: Content): string => plan.segments.map((s, i) => `${i + 1}. ${s.title} (${s.kind}, ${s.minutes} min): ${s.description}${s.teacherNotes ? `\n   Teacher's notes: ${s.teacherNotes}` : ''}`).join('\n');

/** A graded worksheet came twice: as a sheet of six tasks and as the graded piece of four, with a rubric for the four. */
function graded(lesson: Lesson): string {
  const names = lessonPieces(lesson).filter((p) => (p.kind === 'inclass' || p.kind === 'test') && p.toward.trim()).map((p) => `"${p.toward.trim()}"`);
  return names.length ? `Graded in this lesson, each printed with its own tasks by another writer: ${names.join(', ')}. Write no sheet for any of them, whatever the plan calls it (a worksheet, a quiz paper): a sheet of yours would be a second version.` : '';
}

export function handoutsPrompt(course: Course, lesson: Lesson, plan: Content): string {
  return [
    lessonContext(course, lesson),
    `The lesson plan, as it will be taught:\n${planText(plan)}`,
    graded(lesson),
    [
      'Write the sheets this lesson puts in students\' hands or on the wall, each in full and ready to print: every worksheet, exit ticket (graded or not), organizer, set of cards, text to read, reference sheet, or paper the teacher is to mark or cut beforehand, that the plan names or plainly needs for what it has students do. None when the lesson needs none; six at most, one sheet for one activity, and none for a discussion held aloud.',
      'A sheet the plan describes is that sheet: its numbers, names, examples and questions are the plan\'s own, and where the plan gives only some of them ("ten problems like these") write them all; it asks nothing of a student that the plan has them do elsewhere (at desks, not at the floor line). Give it as blocks in the order a student reads them: a line of instructions; the questions as a list, unnumbered, since the page numbers them; a table to fill in, with its headings and empty cells; a text as paragraphs; cards as a table with one card to a row; and after each question a "yours" for the answer, with as many lines as the answer needs. What students need in hand to do a task alone is on a sheet, never only in the notes for the teacher: the code they are to type or change, and the steps and amounts of a procedure they carry out at a bench or a computer, as a reference sheet. Code is written to run as given in a fresh session: each sheet or task loads or creates every object it uses, gives every argument its result depends on (never a default, such as the bins of a histogram), names no folder of anyone\'s machine (files are opened from the working folder, set the way the course taught), and says of its output only what is certain: a key speaks of the file students were given, not of a data set as it is generally known. A question about a figure carries what it needs on the sheet, as the numbers in a table or a full description in words, never "the histogram on the board": the sheet is written before any slide. A question is never written inside the room for its answer.',
      'What a student should not see is not on the sheet: answers, hints at the answer, what the teacher is looking for. The key to each sheet is written afterwards, from the sheet as it stands: leave "key" empty.',
      'Quotation marks, and the words "excerpt" or "quotation", are only for the exact words of a real text you are sure of; a summary in your own words is called a summary.',
      'Leave out what is not paper or is not yours to write: real objects and anything students bring, the slides, the quiz and the graded work with its brief and rubric (written separately, with this lesson or an earlier one: the teacher reprints them from there, and a sheet of yours "the same as last time" would be a different one), a text the teacher\'s sources hold (name it and where to find it in "copies"), and a sheet that would only repeat what the teacher says aloud.',
    ].join(' '),
  ].join('\n\n');
}

/**
 * What is wrong with the sheets' form, as their writer can put it right; the first found, or nothing. A worksheet
 * went out with a table of three empty rows and no headings under "Complete the table", and its key said so.
 */
export function sheetFault(draft: HandoutsDraft): string | null {
  const code = codeFaults(draft)[0]?.flag;
  if (code?.code === 'schemaIssue') return String(code.values.issue);
  const empty = draft.handouts.find((h) => h.blocks.some((b) => b.type === 'table' && (!b.columns.length || !b.rows.length || b.rows.some((r) => r.length !== b.columns.length))));
  return empty ? `the sheet "${empty.title}" has a table without its headings or with rows that are not as long as them: give every table its column headings and every row one cell for each, the cells students fill as empty strings and the labels they need written in` : null;
}

/**
 * The keys, written from the finished sheets by the writer that gets answers right. Sheets and keys came from one
 * writer: judged blind on sixteen lessons, its sheets were the ones teachers would rather use (11 lessons to 4) and
 * its keys had five wrong answers, where the other writer's sheets were thinner and its keys had none. Given the
 * first writer's sheets, the second's keys had no wrong answer and one gap, against four and six, and were
 * preferred in twelve lessons and never the other way.
 */
export const HandoutKeysDraft = z.object({
  keys: z.array(z.object({ title: line.describe('The sheet, by its title exactly'), key: z.string().describe('Its key; empty for a sheet with nothing to mark') })).max(6).default([]),
  corrections: z
    .array(z.object({ find: line.describe('The exact words of the plan that are wrong, copied character for character, where they stand only once'), replace: z.string().describe('What should stand there') }))
    .max(6)
    .default([])
    .describe('Only where a number or result the plan states is wrong by your own working: one entry for each place the plan says it. Usually empty'),
});
export type HandoutKeysDraft = z.infer<typeof HandoutKeysDraft>;

const KEYS_ASK =
  'Below are a lesson plan and the sheets it hands to students, already written. Write the key to each sheet, for the teacher only: the answer to every question, cell and blank on the sheet, in the order they stand, worked out by you from the sheet as it is written (every number computed, every piece of code traced), with what to look for in an open answer and the common slip where there is one. Where a number or statement in the plan or on a sheet disagrees with what you work out, the key gives what is right and says nothing of the mistake, and the wrong words go under "corrections" with what should stand there: they are replaced in the plan and on the sheets, so the key is the key to the sheet as corrected. A sheet with nothing to mark has an empty key.';

export function handoutKeysPrompt(course: Course, lesson: Lesson, plan: Content, sheets: HandoutsDraft['handouts']): string {
  const shown = sheets.map((h) => `### ${h.title} (${h.kind}, used in "${h.usedIn}")\n${exhibitPart({ label: '', blocks: h.blocks }).blocks.map((b) => say(b as Record<string, unknown>)).join('\n')}`).join('\n\n');
  return [lessonContext(course, lesson), `The lesson plan, as it will be taught:\n${planText(plan)}`, `The sheets:\n${shown}`, KEYS_ASK].join('\n\n');
}

function toHandout(d: HandoutsDraft['handouts'][number]): Handout {
  return { id: newId('x'), title: d.title, kind: d.kind, usedIn: d.usedIn, copies: d.copies, blocks: exhibitPart({ label: '', blocks: d.blocks }).blocks, key: d.key, supports: false };
}

/**
 * The plan's commands with its sheets written. A lesson online has a page instead; and sheets that cannot be had
 * never cost the plan. Their keys are not put through the answer check: on the first forty sheets it raised
 * eleven notes and every one was a false alarm (fractions, powers of ten, a constant with one more digit), while
 * a reviewer who worked all 94 answers by hand found none wrong.
 */
export async function withHandouts(inference: Inference, course: Course, lesson: Lesson, written: { commands: Command[]; flagged: number }, signal?: AbortSignal): Promise<{ commands: Command[]; flagged: number }> {
  const fill = written.commands.find((c) => c.type === 'section.fill' && c.payload.kind === 'plan');
  if (!fill || fill.type !== 'section.fill' || fill.payload.kind !== 'plan' || !fill.payload.content.segments.length) return written;
  const content = fill.payload.content;
  try {
    const write = (told = '') => runJob(inference, { task: 'folio_handouts', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: `${handoutsPrompt(course, lesson, content)}${told}`, effort: 'medium', schema: HandoutsDraft, repair: false, signal });
    const first = await write();
    // Code a student must read line by line is asked for once more when it came squeezed; the second answer is kept only if it is sound.
    const fault = sheetFault(first.value);
    const again = fault ? await write(`\n\nA first answer was not usable: ${fault}.`).catch(() => null) : null;
    const result = again && !sheetFault(again.value) ? again : first;
    // A key that cannot be had leaves the sheets without one, never the lesson without its sheets.
    const keyed = result.value.handouts.length
      ? await runJob(inference, { task: 'folio_handout_keys', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: handoutKeysPrompt(course, lesson, content, result.value.handouts), effort: 'low', schema: HandoutKeysDraft, repair: false, signal }).then((r) => r.value, () => null)
      : null;
    const keyOf = (title: string) => keyed?.keys.find((k) => k.title.trim() === title.trim())?.key ?? '';
    // A sheet said "the average is 2.5, make it print 2.5" where it is 3.5; its key warned the teacher and the sheet was printed as it was.
    const mended = (keyed?.corrections ?? []).reduce((now, fix) => (fix.find.trim() && now.includes(JSON.stringify(fix.find).slice(1, -1)) ? now.split(JSON.stringify(fix.find).slice(1, -1)).join(JSON.stringify(fix.replace).slice(1, -1)) : now), JSON.stringify(result.value.handouts));
    const handouts = (JSON.parse(mended) as HandoutsDraft['handouts']).map((h) => toHandout({ ...h, key: keyOf(h.title) }));
    // Working every answer makes the keys' writer the second to compute the plan's numbers: a key said "correction to the
    // plan: the standard deviation is 25.79, not 25.70", and the plan, its slides and the study guide kept 25.70.
    const plan = (keyed?.corrections ?? []).reduce((now, fix) => {
      const got = placed(now, fix.find, fix.replace);
      return got.hits === 1 ? got.value : now;
    }, { segments: content.segments, keyIdeas: content.keyIdeas, vocabulary: content.vocabulary });
    const commands = written.commands.map((c) => (c === fill ? cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: fill.payload.flags, content: { ...content, ...plan, handouts } }) : c));
    return { commands, flagged: written.flagged };
  } catch (error) {
    if (signal?.aborted) throw error;
    return written;
  }
}
