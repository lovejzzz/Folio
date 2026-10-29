import { lessonPieces, type Course, type Lesson } from '@folio/core';
import type { Problem } from './jobs';
import { preparedTurn } from './pieceFacts';

/** The pieces of a lesson that a student prepares a scored turn for (a discussion led, a presentation), as the card has it. */
export function preparedPieces(course: Course, lesson: Pick<Lesson, 'homework' | 'also'>): string[] {
  return lessonPieces(lesson)
    .filter((p) => p.kind === 'inclass' && p.toward.trim() && preparedTurn(course, p.toward) === true)
    .map((p) => p.toward.trim());
}

/** An item put on the screen that is a question: "Q1. Where does theory sit…?", "2) What does a researcher risk?". */
const QUESTION = /\?\s*$/;
const ON_SHOWN = /\bwith the questions (?:shown|on the screen|on the sheet|handed out|below|above)\b/i;

/**
 * A turn a student prepares is theirs. Told so, a plan still listed four questions on the screen for the leader's
 * discussion ("Keep this slide up while the leader runs the discussion") in six lessons of seven, and the sheets'
 * writer printed them, while the same notes told the teacher to suggest none: a segment of such a turn that lists
 * questions for the screen, or runs the turn on questions shown, is asked for again.
 */
export function ledTurnScripted(segments: readonly { title: string; description: string; shown?: string[] | undefined }[], course: Course, lesson: Lesson): Problem[] {
  const names = preparedPieces(course, lesson).map((n) => n.toLowerCase());
  if (!names.length) return [];
  const scripted = segments.filter((s) => names.some((n) => s.title.toLowerCase().includes(n))).filter((s) => (s.shown ?? []).some((x) => QUESTION.test(x)) || ON_SHOWN.test(s.description));
  if (!scripted.length) return [];
  const issue = `The questions of a turn a student prepares are the student's own: ${scripted.map((s) => `"${s.title}"`).join(', ')} lists questions for the screen, or runs the turn on questions shown. List none and show none: the leader runs the discussion on their own questions, and the screen holds at most the reading's title and the piece's name.`;
  return [{ index: null, flag: { code: 'schemaIssue', values: { path: 'segments', issue } } }];
}
