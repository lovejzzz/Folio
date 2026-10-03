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
  const bands = /^en-(GB|IE)$/i.test(locale)
    ? 'the UK degree classes, exactly "First", "Upper second", "Lower second" and "Third", with 70, 60, 50 and 40 as the points'
    : /^en-(US|CA)$/i.test(locale)
      ? 'letter grades, exactly "A", "B", "C" and "D", with 90, 80, 70 and 60 as the points'
      : 'the grade bands used where the course is taught, each level worth the lowest mark of its band';
  return `Name the rubric levels after ${bands}. Write each descriptor as a marker would, for work at that band.`;
}

/** How university teaching differs from school, said once in the course background. */
export const UNIVERSITY_TEACHING =
  'This is university teaching for adult students: lectures, seminars and problem classes. Build sessions around close reading, argument, worked problems and student-led discussion, and pitch the vocabulary at the discipline. A seminar runs on discussion of the reading: keep the instructor\'s exposition short and let students lead. Leave out school routines such as warm-up games, exit tickets or reading aloud in turn, unless the brief or syllabus asks for them.';
