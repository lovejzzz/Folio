import { describe, expect, it } from 'vitest';
import { courseBackground } from '../src/prompts';
import { testAsk } from '../src/scales';
import { smallCourse } from './fake';

describe('what came before a meeting', () => {
  it('is named by what it was, never "last time": the meeting before may have been a test', () => {
    const course = smallCourse();
    expect(courseBackground(course)).toContain('never "last time"');
    const met = { ...course, shape: { ...course.shape, sessions: [{ kind: 'lecture' as const, minutes: 50 }, { kind: 'lab' as const, minutes: 120 }] } };
    expect(courseBackground(met)).toContain('never "last time"');
  });

  it('keeps a test to what the lessons named, however much a principle belongs to the subject', () => {
    const course = smallCourse();
    const lesson = { ...course.lessons[course.lessonOrder[1]!]!, homework: { kind: 'test' as const, toward: 'Midterm exam', due: '' } };
    expect(testAsk(course, lesson)).toContain('a law, principle or term the lessons above never named');
  });
});
