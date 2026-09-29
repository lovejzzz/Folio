import { cmd, CourseStore, createCourse, newId, orderedLessons, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { nameLessons } from '../src/tidy';

function titled(): Course {
  const store = new CourseStore(createCourse({ title: 'The water cycle', quizSize: 3, minutesPerLesson: 45 }));
  for (const title of ['Evaporation and the sun’s energy', 'Condensation and cloud formation', 'Precipitation and the whole cycle']) {
    store.apply(
      [cmd('lesson.insert', { lesson: { id: newId('l'), title, summary: '' }, afterId: store.getState().lessonOrder.at(-1) ?? null, objectives: [{ id: newId('o'), text: title }] })],
      { label: { key: 't' }, source: 'teacher' },
    );
  }
  return store.getState();
}

describe('other lessons, named by title', () => {
  const course = titled();
  const [first, second, third] = orderedLessons(course);

  it('are named where the words say which one', () => {
    expect(nameLessons('Review this at the start of the next lesson.', course, second!)).toBe('Review this at the start of “Precipitation and the whole cycle”.');
    expect(nameLessons('Remind students of the previous lesson.', course, second!)).toBe('Remind students of “Evaporation and the sun’s energy”.');
    expect(nameLessons('It is covered in the next topic.', course, first!)).toBe('It is covered in “Condensation and cloud formation”.');
  });

  it('keep only the name when the model gave it too', () => {
    expect(nameLessons('Link back to evaporation from the first lesson, Evaporation and the sun’s energy.', course, third!)).toBe('Link back to evaporation from “Evaporation and the sun’s energy”.');
    expect(nameLessons('Preview that the next lesson, Condensation and cloud formation, looks at clouds.', course, first!)).toBe('Preview that “Condensation and cloud formation”, looks at clouds.');
  });

  it('are left alone where it is unclear or there is none', () => {
    expect(nameLessons('Revisit it in the last lesson.', course, second!)).toBe('Revisit it in the last lesson.');
    expect(nameLessons('Review it at the start of the next lesson.', course, third!)).toBe('Review it at the start of the next lesson.');
  });
});
