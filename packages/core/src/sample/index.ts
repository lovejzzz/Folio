import { buildCourse } from './builder';
import { statisticsLessonsA } from './statistics';
import { statisticsLessonsB } from './statistics2';
import type { Course } from '../schema';

export { buildCourse, type CourseSpec, type LessonSpec, type QuestionSpec } from './builder';

/** A hand-written sample course, bundled so Folio can be tried without a model. */
export function sampleCourse(): Course {
  return buildCourse({
    title: 'Reading the world with data',
    summary:
      'A four-lesson introduction to statistics. Students learn to ask questions that data can answer, picture distributions, summarise them with centre and spread, and judge whether a sample can be trusted.',
    brief: 'A 4-lesson introductory statistics unit for grade 11, 50 minutes per lesson.',
    language: 'en',
    level: 'Grade 11',
    subject: 'Statistics',
    minutesPerLesson: 50,
    quizSize: 5,
    policies:
      'Bring a calculator to every lesson. Graphs may be drawn by hand or with software, but every axis needs a label.\n\nLate work is accepted up to one week after the due date; talk to me before then if you need more time.',
    levels: [
      ['Excellent', 4],
      ['Good', 3],
      ['Developing', 2],
      ['Beginning', 1],
    ],
    lessons: [...statisticsLessonsA, ...statisticsLessonsB],
  });
}
