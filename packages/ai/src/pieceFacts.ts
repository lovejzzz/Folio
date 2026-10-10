import { lessonPieces, orderedLessons, type Course, type GradeItem } from '@folio/core';

/**
 * How each graded piece runs, as one text for every writer of every lesson. These are not content: who does a piece, how
 * it is handed in, what may be used in a test, how it is scored. Each writer used to say them again from the brief's prose,
 * and a reading of thirty-two fresh lessons found seven of the eleven faults that stop a lesson here: a seminar turn led
 * "with your assigned group" in its brief and by one student in the plan, a notebook handed in "at the end of class" and
 * "not collected in class", an exam's rules told two ways a week apart. The words below are made from the course's record
 * and are the same wherever they are read.
 */

/** The kinds a component is set as across the course. */
function kindsOf(course: Course, item: string): Set<string> {
  return new Set(orderedLessons(course).flatMap((l) => lessonPieces(l).filter((p) => p.toward.trim() === item.trim()).map((p) => p.kind)));
}

function who(g: GradeItem): string {
  const card = g.card!;
  if (card.who === 'pair') return 'done in pairs, one piece handed in by each pair';
  if (card.who === 'group') return `done in groups${card.groupSize ? ` of ${card.groupSize}` : ''}, one piece from each group`;
  return 'each student\'s own work, done and scored alone';
}

function handIn(g: GradeItem, kinds: Set<string>): string {
  const card = g.card!;
  if (kinds.has('test')) return '';
  if (card.handIn === 'none') return 'nothing is handed in: it is scored as it happens';
  // What the brief left open is not settled here: said the same in every lesson, an invented way is still invented.
  if (card.handIn === 'unsaid') return 'how it is handed in is the teacher\'s to say, and no material names a way (on paper, online, a folder, a site)';
  if (kinds.has('inclass')) return card.handIn === 'online' ? 'what is written is submitted online after the lesson it is done in, and nothing is collected in the room' : 'what is written is handed in on paper at the end of the lesson it is done in';
  return card.handIn === 'online' ? 'submitted online before the lesson it is due at, and never collected in class' : 'handed in on paper at the start of the lesson it is due at';
}

function scoring(g: GradeItem, kinds: Set<string>): string {
  const card = g.card!;
  if (g.judged === 'complete') return 'graded complete or incomplete';
  if (card.points) return `marked out of ${card.points} points each time`;
  if (kinds.has('test')) return 'marked in points';
  return kinds.size ? 'scored with a rubric, which has the same criteria and the same levels every time the piece is set' : '';
}

/** One component's facts, as a line. */
export function pieceFactsOf(course: Course, g: GradeItem): string {
  if (!g.card) return '';
  const kinds = kindsOf(course, g.item);
  const card = g.card;
  const test = kinds.has('test');
  const parts = [
    test && card.who === 'individual' ? '' : who(g),
    card.prepared ? 'a student prepares their turn ahead: the first lesson to run it gives out its brief and rubric and the teacher models a turn that is not scored, and scored turns begin at the next lesson that runs it' : kinds.has('inclass') && [...kinds].length === 1 ? 'scored from the first lesson that runs it' : '',
    handIn(g, kinds),
    scoring(g, kinds),
    // Unsaid, one lesson allowed "a calculator and pencils only" and the next a formula sheet: what the brief leaves open no material settles.
    test ? (card.allowed ? `students may use: ${card.allowed}` : 'what students may bring or use is the teacher\'s to announce, and no material names anything') : '',
    card.length ? `length: ${card.length}` : '',
    card.source ? `its data or material: ${card.source}` : '',
  ].filter(Boolean);
  return parts.length ? `- ${g.item}${g.weight ? ` (${g.weight}%)` : ''}: ${parts.join('; ')}.` : '';
}

/** Every component's facts, with the one rule that goes with them. Empty for a course outlined before components carried a card. */
export function pieceFacts(course: Course): string {
  const lines = course.grading.map((g) => pieceFactsOf(course, g)).filter(Boolean);
  if (!lines.length) return '';
  return `How each graded piece runs, the same in every lesson and in every material:\n${lines.join('\n')}\nWhere one of these facts comes up it is said as it is here. Nothing else is said of who does a graded piece, whether and how it is handed in, what may be used for it or how it is scored: not in other words, and not for one lesson only.`;
}

/** Whether a piece's first lesson scores it: no where a student prepares a turn, as the card has it. Undefined for a course with no card. */
export function preparedTurn(course: Course, toward: string): boolean | undefined {
  return course.grading.find((g) => g.item.trim() === toward.trim())?.card?.prepared;
}
