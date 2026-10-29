/**
 * What a plan says is on the screen, and where it really is. A reading of twelve lessons found a dozen places where
 * the plan had the teacher "show" a thing the pack did not hold. Two causes, both here. A segment that works from a
 * sheet has its list for the screen taken away (the sheet is the one source of its items) and its sentences still
 * said "on the screen": eight of them. And a sentence said "Show the prefixes" with nothing listed for the screen,
 * so the slides' writer had only the instruction to copy.
 */

import type { Problem } from './jobs';

const SCREEN = /\bon (?:the )?(?:screen|slides?)\b/gi;
const sentences = (text: string) => text.split(/(?<=[.!?])[ \t]+|\n/).filter((s) => s.trim());
/** A sentence that tells the teacher to put something before the class: "Show the table", "Put the claim on the screen". */
const LEAD = /^(?:Show|Display|Project)\s+(?!that\b|how\b|why\b|what\b|where\b|students how\b)/;
/** What is left where it already is, is not asked for again: "Leave the code on the screen" over a break. */
const STAYS = /^(?:Leave|Keep)\b/;
/** Said of code run before the class, which no sheet takes from the screen. */
const LIVE = /\b(?:runs?|running|types?|typing|demo|demonstrates?)\b/i;

/** The sentences of a description that say something is shown to the class. */
export function saidShown(description: string): string[] {
  return sentences(description).filter((s) => !STAYS.test(s.trim()) && !LIVE.test(s) && (LEAD.test(s.trim()) || new RegExp(SCREEN.source, 'i').test(s)));
}

interface Seg {
  title: string;
  description: string;
  teacherNotes: string;
  shown?: string[] | undefined;
}

/** A segment's sentences when its items are on a sheet and no longer on the screen: they say the sheet. */
export function onTheSheet<S extends Seg>(seg: S, sheets: string[]): S {
  if (!sheets.length) return seg;
  const named = sheets.map((t) => `“${t}”`).join(' and ');
  const one = (s: string): string => {
    // Code typed and run before the class is on the screen whatever the sheet holds.
    if (LIVE.test(s) || STAYS.test(s.trim())) return s;
    const t = s.replace(SCREEN, 'on the sheet').replace(/\bgoes on the sheet\b/, 'is on the sheet').replace(/\bgo on the sheet\b/, 'are on the sheet');
    const put = /^Put (.+?) on the sheet([.!?]?)$/.exec(t);
    if (put) return `The sheet has ${put[1]}${put[2] || '.'}`;
    // "Show a faulty function." is the sheet's to show; a longer order ("Show it and have students…") keeps its verb.
    // "Show a faulty delete on the screen." became "The sheet has a faulty delete on the sheet.": the sheet is said once.
    if (LEAD.test(t) && !/\band\b|,/.test(t)) return t.replace(/^(?:Show|Display|Project)\s+/, 'The sheet has ').replace(/ on the sheet([.!?]?)$/, '$1');
    return t;
  };
  const say = (text: string) => text.split('\n').map((line) => line.split(/(?<=[.!?])[ \t]+/).map(one).join(' ')).join('\n');
  const description = say(seg.description);
  const hands = sheets.some((t) => description.includes(t)) || /\b(?:hand|give|pass)s? out\b/i.test(description);
  return { ...seg, description: hands ? description : `Give out the ${sheets.length === 1 ? 'sheet' : 'sheets'} ${named}.\n${description}`, teacherNotes: sentences(seg.teacherNotes).some((x) => LIVE.test(x)) ? seg.teacherNotes : seg.teacherNotes.replace(SCREEN, 'on the sheet') };
}

/** Segments that say a thing is shown and list nothing for the screen, each with the sentences that say so. */
export function shownUnlisted(segments: readonly Seg[], sheeted: ReadonlySet<string> = new Set()): { title: string; said: string[] }[] {
  return segments.flatMap((s) => {
    if (s.shown?.length || sheeted.has(s.title.trim().toLowerCase())) return [];
    const said = saidShown(s.description);
    return said.length ? [{ title: s.title, said }] : [];
  });
}

/**
 * A plan that says a thing is on the screen and lists nothing for it is asked once to list it: a sheet wrote "the two
 * sentences on the screen" and the slide "work from the sheet", and the two gap sentences, listed nowhere, were on neither.
 */
export function unlistedProblems(segments: readonly Seg[]): Problem[] {
  const said = shownUnlisted(segments);
  if (!said.length) return [];
  const issue = `These segments say something is on the screen and list nothing for it under "shown": ${said.map((s) => `"${s.title}" (${s.said.map((x) => `"${x.trim()}"`).join('; ')})`).join('; ')}. List each in full under "shown", exactly as students will see it, or say that it is drawn on the board.`;
  return [{ index: null, advisory: true, flag: { code: 'schemaIssue', values: { path: 'segments', issue } } }];
}

/** Said to the slides' writer of what the plan shows without listing: on a slide in full, or drawn on the board and said so. */
export function unlistedAsk(segments: readonly Seg[], sheeted: ReadonlySet<string>): string {
  const found = shownUnlisted(segments, sheeted);
  if (!found.length) return '';
  const lines = found.map((f) => `- ${f.title}: ${f.said.map((x) => `"${x.trim()}"`).join(' ')}`);
  return `The plan says these are shown and lists nothing for the screen:\n${lines.join('\n')}\nEach is on a slide whole, as students will see it (the rows of a table, the numbers of a figure, the text of a question). A drawing no slide can hold is the teacher's to draw: its slide says "On the board:" and what is drawn there, and its notes say exactly what to draw, with its numbers. No slide or note only repeats the order to show it.`;
}
