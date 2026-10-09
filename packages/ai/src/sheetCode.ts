import { orderedLessons, type Course, type Handout, type Lesson, type Task } from '@folio/core';
import { z } from 'zod';
import type { Inference } from './inference';
import { runJob } from './jobs';

/**
 * The R a lesson gives students, run as they will run it: sheet by sheet and line by line, each sheet in a new
 * session, in a folder that holds what earlier lessons made. Python on a page is run before its review; R on a
 * sheet never was, and readers found what a run shows at once: a first line that changes to a folder no student
 * has, a table used that nobody loaded, a lab that stops on its second command.
 */

/** What runs the lines: R on the command line here, nothing where R cannot be had. */
export interface LineRunner {
  fresh(): Promise<void>;
  run(line: string): Promise<string | null>;
  need(packages: string[]): Promise<void>;
}

export interface CodeUnit {
  kind: 'notes' | 'handout' | 'assignment';
  title: string;
  lines: string[];
  /** The lines that stood inside a sentence: run only when R reads them as a statement of their own. */
  inline?: string[];
}

export interface CodeFault {
  kind: 'handout' | 'assignment';
  title: string;
  line: string;
  error: string;
  /** Folio could not run the line (a package it does not hold): nothing is wrong with the lesson, and nothing was checked from here on. */
  unchecked?: boolean;
}

/** A line that is code and nothing else: `x <- 1` alone between backticks. */
const whole = (text: string): string | null => /^\s*`([^`]+)`\s*$/.exec(text)?.[1] ?? null;
const inline = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

/** Code set in a sentence that could be a statement: R decides, when it is run. */
const maybe = (code: string): boolean => /<-|\w\(/.test(code);

interface Found {
  lines: string[];
  inline: string[];
}

/** The code a text holds, in order: a line that is all code, and what is set inside a sentence. */
function codeIn(texts: string[]): Found {
  const found: Found = { lines: [], inline: [] };
  for (const row of texts.flatMap((t) => t.split('\n'))) {
    const line = whole(row)?.trim();
    if (line) found.lines.push(line);
    else {
      const set = inline(row).filter(maybe);
      found.lines.push(...set);
      found.inline.push(...set);
    }
  }
  return found;
}

// A table's cells too: a lab sheet sets its commands beside the room for their output.
const sheetTexts = (h: Handout): string[] => h.blocks.flatMap((b): string[] => (b.type === 'list' ? b.items : b.type === 'table' ? b.rows.flat() : 'text' in b && typeof b.text === 'string' ? [b.text] : []));

/** The code of one lesson in the order it is met: what the teacher prepares, each sheet, each piece of work. */
export function codeUnits(course: Course, lesson: Lesson): CodeUnit[] {
  // The teacher's own folder is theirs: only what makes or loads something is run from the notes.
  const notes = lesson.segments.flatMap((s) => inline(s.teacherNotes)).filter((l) => /<-|\w\(.+\)/.test(l) && !/^setwd\(/.test(l));
  const work = lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Extract<Task, { kind: 'assignment' }> => t?.kind === 'assignment');
  return [
    { kind: 'notes' as const, title: '', lines: notes },
    ...lesson.handouts.map((h) => ({ kind: 'handout' as const, title: h.title, ...codeIn(sheetTexts(h)) })),
    ...work.map((t) => ({ kind: 'assignment' as const, title: t.title, ...codeIn(t.steps) })),
  ].filter((u) => u.lines.length);
}

/** R by its marks: an arrow, a library, a column by `$`. A course in another language is left alone. */
export const looksLikeR = (units: CodeUnit[]): boolean => units.some((u) => u.kind !== 'notes' && u.lines.some((l) => /<-|\blibrary\(|\w\$\w/.test(l)));

/** A line a student completes, or one that waits for a person: it cannot be run, and is no fault. */
const SKIPPED = /\.\.\.|___|<[a-z][a-z ]*>|^\s*(?:install\.packages|View|file\.choose|readline|edit|fix|help|vignette|q|quit)\(|^\s*\?/i;

/** A call that reads a file. */
const GIVEN = /\b(?:read\.(?:csv|table|delim)|read_(?:csv|tsv|delim|excel|rds)|readRDS|readxl::read_excel|load|scan)\(/;

/**
 * Asked of R itself: is this one statement that assigns, or calls with something? A name alone, a function named
 * with empty brackets, a sum, a column read by `$`, or a line that ends before it is done are shown in a sentence
 * to be read, and stop in a new session for no fault.
 */
export const STATEMENT = (code: string): string =>
  `stopifnot(local({ e <- parse(text = ${JSON.stringify(code)}); length(e) == 1 && is.call(e[[1]]) && length(e[[1]]) > 1 && !(as.character(e[[1]][[1]])[1] %in% c("+", "-", "*", "/", "^", ":", "==", "!=", "<", ">", "<=", ">=", "$", "[", "[[", "(", "&", "|", "!", "~")) }))`;

type Stop = { line: string; error: string; unchecked?: boolean };

/**
 * A statement set over several lines is one statement: `ggplot(...) +` alone stops with "unexpected end of input",
 * and was reported as a line that does not run. A line that ends where more must follow is joined to the next.
 */
export function joined(lines: string[], apart: (line: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const last = out.at(-1);
    const open = last !== undefined && !apart(last) && !apart(line) && /(?:[+,({]|\|>|%>%|%in%|<-|=|&&|\|\||[-*/~])\s*$/.test(last);
    if (open) out[out.length - 1] = `${last}\n${line}`;
    else out.push(line);
  }
  return out;
}

async function runUnit(runner: LineRunner, unit: CodeUnit): Promise<Stop[]> {
  await runner.fresh();
  await runner.need(unit.lines.flatMap((l) => [...l.matchAll(/\b(?:library|require)\(\s*["']?([\w.]+)/g)].map((m) => m[1]!)));
  const faults: Stop[] = [];
  const inline = new Set(unit.inline ?? []);
  // What a skipped line would have made is missing for the lines after it: that is the template's doing, not a fault.
  const unmade = new Set<string>();
  // Only lines that stood alone are joined: code set in a sentence is judged piece by piece.
  for (const line of joined(unit.lines, (l) => inline.has(l))) {
    if (SKIPPED.test(line)) {
      const name = /^\s*([\w.]+)\s*(?:<-|=)/.exec(line)?.[1];
      if (name) unmade.add(name);
      continue;
    }
    if (inline.has(line) && (await runner.run(STATEMENT(line)))) continue;
    const error = await runner.run(line);
    if (!error) continue;
    // A package Folio's R does not hold: the lesson is not wrong, and from here on nothing can be told of it.
    if (/there is no package called/i.test(error)) return [...faults, { line, error, unchecked: true }];
    // A file nothing in the course made is one the teacher hands out: the line is theirs to make work, and what it would
    // have loaded is not missed. Sent to be "corrected", it came back as a file's contents typed into the call as text.
    if (GIVEN.test(line) && /cannot open|does not exist|No such file/i.test(error)) {
      const name = /^\s*([\w.]+)\s*(?:<-|=)/.exec(line)?.[1];
      if (name) unmade.add(name);
      continue;
    }
    const missing = /object '([^']+)' not found/.exec(error)?.[1];
    if (missing && unmade.has(missing)) continue;
    // A name set alone on a line of a reference sheet ("`hist()`", "`breaks`") is a function or an argument being
    // named, not a line to run: it stops for want of what it was never given.
    if (/^\s*[\w.]+\(\)\s*$/.test(line) && /argument .* is missing/.test(error)) continue;
    if (/^\s*[\w.]+\s*$/.test(line) && missing === line.trim()) continue;
    faults.push({ line, error });
    // One fault a sheet is enough to act on: what follows a stopped line mostly fails because of it.
    if (faults.length >= 3) break;
  }
  return faults;
}

/**
 * The faults in what this lesson gives students. The lessons before it are run first, silently: the file a
 * teacher made in week 1 is the file week 2 reads.
 */
export async function lessonCodeFaults(runner: LineRunner, course: Course, lesson: Lesson): Promise<CodeFault[]> {
  const mine = codeUnits(course, lesson);
  if (!looksLikeR(mine)) return [];
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id));
  for (const unit of before.flatMap((l) => codeUnits(course, l))) await runUnit(runner, unit);
  const faults: CodeFault[] = [];
  for (const unit of mine) {
    const found = await runUnit(runner, unit);
    if (unit.kind !== 'notes') faults.push(...found.map((f) => ({ kind: unit.kind as 'handout' | 'assignment', title: unit.title, ...f })));
  }
  return faults;
}

export const CodeFix = z.object({
  changes: z
    .array(z.object({ find: z.string().min(1).describe('The exact text at fault, copied character for character, where it stands only once'), replace: z.string().describe('What stands in its place') }))
    .max(8)
    .default([]),
  meant: z.array(z.string()).max(12).default([]).describe('Lines that stopped which the material gives students as broken on purpose, to find and fix: copied exactly, and left unchanged'),
});

const ASK = [
  'The R below is given to students on a sheet or in a piece of work. It was run line by line in a new R session, in the working folder the course set, holding the files earlier lessons made; some lines stopped, with the messages shown.',
  'Give the changes of text that make every line run as a student will run it: load or create what the line uses, name no folder of anyone\'s machine, correct a call that R refuses. Change as little as possible, and nothing that ran. A line the material itself presents as faulty, for students to find the mistake in or repair, is meant to stop: change nothing in it, and list it under "meant". The sheet\'s own title and instructions say when that is so ("repair", "fix", "debug", "find the mistake", "what is wrong with"), and then every line it gives to be repaired is meant. A change replaces text exactly as it stands in the material, backticks included where they are part of it.',
].join(' ');

/** The words to change so the lines run, or none. */
export async function codeFix(inference: Inference, material: string, faults: CodeFault[], signal?: AbortSignal): Promise<z.infer<typeof CodeFix>> {
  const told = faults.map((f) => `- ${f.kind === 'handout' ? 'Sheet' : 'Work'} "${f.title}": \`${f.line}\` stopped with: ${f.error}`).join('\n');
  const result = await runJob(inference, { task: 'folio_answer_fix', system: 'You correct course materials. Reply with one JSON object and nothing else.', prompt: `${ASK}\n\nThe lines that stopped:\n${told}\n\nThe material:\n${material}`, effort: 'low', schema: CodeFix, repair: false, signal });
  return result.value;
}

/** A note for the teacher on a line that still stops. */
export const faultNote = (f: CodeFault): string =>
  f.unchecked
    ? `In "${f.title}", Folio's R does not have the package that \`${f.line}\` loads: that line and the ones after it were not checked.`
    : `In "${f.title}", the line \`${f.line}\` stops when run in a new R session: ${f.error}`;
