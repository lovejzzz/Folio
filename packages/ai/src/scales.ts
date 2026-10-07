import type { Course, Lesson } from '@folio/core';

/**
 * Asked to "make about half true", models swing to all false or all true. So
 * Folio sets the order: alternating within a quiz, and starting true in odd
 * lessons and false in even ones. A quiz often has a single true/false
 * question, so starting by a hash of the lesson id could make every answer
 * in a course "true" (it did, in a live run); by position it comes out even.
 */
export function trueFalseOrder(course: Course, lesson: Lesson): string {
  const startTrue = course.lessonOrder.indexOf(lesson.id) % 2 === 0;
  const [first, second] = startTrue ? ['true', 'false'] : ['false', 'true'];
  return `If you include true/false questions, make the first statement ${first}, the second ${second}, and keep alternating.`;
}

/**
 * Lecturers mark on their institution's scale, not "Excellent … Beginning, 4 … 1".
 * The levels take the local grade bands, each worth the lowest mark of its band.
 */
export function universityRubric(locale: string): string {
  // North American colleges score rubrics on four performance levels, 4 to 1 (as the AAC&U VALUE rubrics do):
  // named after letter grades with 90 to 60 as points, flawless work earned 90 and missing work 60.
  if (/^en-(US|CA)$/i.test(locale)) return 'Name the rubric levels exactly "Exemplary", "Proficient", "Developing" and "Beginning", with 4, 3, 2 and 1 as the points. Write each descriptor as a marker would, for work at that level.';
  const bands = /^en-(GB|IE)$/i.test(locale)
    ? 'the UK degree classes, exactly "First", "Upper second", "Lower second" and "Third", with 70, 60, 50 and 40 as the points'
    : 'the grade bands used where the course is taught, each level worth the lowest mark of its band';
  return `Name the rubric levels after ${bands}. Write each descriptor as a marker would, for work at that band.`;
}

/** New problems need their answers: without a key the teacher works every problem set before marking it. */
export const ANSWER_KEY =
  'Under "answerKey", give the teacher the worked answer to each step, one per line and numbered as the steps are; leave it empty only when the work has no single answer, such as an essay or a project. For code that is tested automatically, the steps give the exact file, function names, parameters and return values, and the key gives test cases with their expected results; the rubric separates what the tests mark from what is marked by reading. An assignment asks for more than the session already built together. Code is written to run as given in a fresh session: each sheet or task loads or creates every object it uses, gives every argument its result depends on (never a default, such as the bins of a histogram), and says of its output only what is certain. Numbers are chosen so that no answer sits on a rounding edge (22.5 to two figures), and the test values of a program so that what the language really prints is what the key says (6.6 / 1.1 in floating point is not 6).';

/** Work graded in the lesson itself: a presentation, a seminar, an interview, something made in class. */
export const IN_CLASS =
  'This piece is done in class, not taken home, in the minutes the plan gives it: count what each student must write, and ask only what a group finishes in that time with a few minutes to spare. The steps say what students do in the lesson, in full, since they are what the teacher prints for it (no other sheet holds its tasks); the rubric is what the teacher scores with, as it happens for what is performed and after class for written work handed in, and "answerKey" tells the teacher how to run and score it for a whole class in the time (who goes when, what the others do), or is empty.';

/** A test, quiz or exam taken in class, as a paper to print, with its key. */
export function testAsk(lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  return [
    `Write ${toward ? `"${toward}"` : 'the test this lesson holds'} as a paper students are handed, to be taken in the time the plan gives it (a final exam sat after the course is set for the usual two to three hours unless the brief says otherwise, and covers the whole course).`,
    'Under "instructions", what students read at the top: the time allowed, what they may use and how to show their work. Then the questions, each complete as printed (a multiple-choice question lists its choices as A, B, C and D), with the points it carries and, for the key, its answer with the working and what each point is for.',
    // Unbounded, "new numbers" took a grade 3 paper to elevenths and sixteenths.
    'Cover what the plan says the paper covers, in proportion to the time each part took, and nothing not yet taught: what this lesson teaches after the paper is sat, as the plan orders its segments, is not on it. The one exception is a paper the plan says is on a reading done beforehand: it is on that reading, in questions a student who read it can answer. Use new cases and new numbers, never the examples the lessons worked or the items of a review held before it, but of the same kinds and sizes the lessons used. Mix short questions with ones that ask students to show reasoning, at the level these students are taught.',
    'Size it to its minutes by what a student must write, part by part: one who knows the material finishes with a few minutes to spare, so a 20-minute paper is three or four short questions, not a sample of everything: count two minutes for each part that asks for working or a reason and one for a short answer, and cut parts until the count fits. Every point is for something the printed question asks: no points for unasked work, and none added to reach a round total. A figure a question needs (a number line, a graph, a diagram) is given as a table of its points or in words wherever that is enough to answer from; only one that must be drawn is described in square brackets beginning "Figure for the teacher to draw:", exactly enough to draw it. Numbers are chosen so that no answer sits on a rounding edge (22.5 to two figures).',
    'Before you answer, work every question from its printed text alone: it must be answerable as written, its table or data must be right, and its key must match.',
  ].join(' ');
}

/** How university teaching differs from school, said once in the course background. */
export const UNIVERSITY_TEACHING =
  'This is university teaching for adult students: lectures, seminars and problem classes. Build sessions around close reading, argument, worked problems and student-led discussion, and pitch the vocabulary at the discipline. A seminar runs on discussion of the reading: keep the instructor\'s exposition short and let students lead. Leave out school routines such as warm-up games, exit tickets or reading aloud in turn, unless the brief or syllabus asks for them. A graduate or doctoral seminar is run by its students: a presentation of the reading, discussion they lead, the instructor\'s synthesis and pressure on the argument; no sorting tasks against a key, no recall questions, no vocabulary for beginners. A case discussion is planned as a teaching note: the opening question and who is asked it, the discussion in blocks with their questions in order, what goes on the board, the transitions and the takeaway; not a lecture with exercises.';

/**
 * Graded papers held in a lesson. A test is written out in the plan, since no other material holds it; a short
 * quiz on the lesson is the quiz material, or the plan and the quiz each wrote their own questions.
 */
const QUIZ_IN_PLAN =
  'A graded quiz, test or exam in the lesson asks about new cases with new numbers, not the examples the course taught with, covers what the lessons before it taught, fits the minutes it has, and has its questions (with the choices, where it has them), answers and the points each carries written out in the notes, however long. Nothing left on the board or screen while students take it gives an answer.';
const QUIZ_IS_MATERIAL = `${QUIZ_IN_PLAN.replace('A graded quiz, test or exam', 'A graded test or exam')} A short quiz on the lesson itself is the lesson's quiz, written separately: the plan gives it time and says how it is marked, and writes no second set of questions.`;
const NOTHING_SHOWN = 'Nothing left on the board or screen while students take it gives an answer.';

/** What a plan is told about the graded papers its lesson holds. */
export function gradedPapers(course: Course, lesson: Lesson): string {
  // Its paper is the lesson's own material: the plan runs it and writes none of it.
  if (lesson.homework.kind === 'test') return `The test or quiz this lesson holds has its own paper: the plan gives it its time (most of the lesson for a unit test or exam; ten to twenty minutes for a short quiz, which tests earlier lessons and not what this lesson has just taught), says what it covers, how the room is set and what students may use, and writes no questions. ${NOTHING_SHOWN}`;
  return course.materials.quiz.enabled ? QUIZ_IS_MATERIAL : QUIZ_IN_PLAN;
}

/**
 * How each component is judged, as one fact for every writer: left to each, a project was "scored by its rubric" on one
 * page and "complete or incomplete" on three others, and "complete" meant two different things across the weeks.
 */
export function judgedLine(course: Course): string {
  if (!course.grading.length) return '';
  const complete = course.grading.filter((g) => g.judged === 'complete').map((g) => `"${g.item}"`);
  // A course outlined before components carried this says nothing about it, rather than contradict its brief.
  const known = course.grading.some((g) => g.judged);
  return [
    !known
      ? ''
      : complete.length
        ? `Graded complete or incomplete: ${complete.join(', ')}; complete means every criterion of its rubric at the second-highest level or above. Every other component is scored by its points or its rubric's levels, and is never called complete or incomplete.`
        : 'Every component is scored by its points or its rubric\'s levels; none is graded complete or incomplete.',
    // Told to "say all of this the same way wherever graded work is described", pages and assignments told students that their
    // work was "scored by points or rubric levels, not complete or incomplete": a rule for the writer, read out to the class.
    'Pieces of one component count equally toward it unless the brief says otherwise. All of this is for you, so that what you write of grading never contradicts it: students are told a component\'s name and its share where graded work is described, and never what the grading is not.',
  ]
    .filter(Boolean)
    .join(' ');
}
