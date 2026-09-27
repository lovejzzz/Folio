import { orderedLessons, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { courseBackground, isHigherEducation, sectionPrompt, systemPrompt } from '../src/prompts';
import { smallCourse } from './fake';

const university = (locale = 'en-GB'): Course => {
  const c = smallCourse();
  return { ...c, locale, audience: { ...c.audience, level: 'Second-year undergraduate' }, grading: [{ id: 'g1', item: 'Seminar presentation', weight: 20 }, { id: 'g2', item: '3,000-word essay', weight: 80 }] };
};

describe('university courses', () => {
  it('knows a university level from a school one', () => {
    expect(['University', 'Second-year undergraduate', 'MSc economics', 'Graduate seminar', '研究生'].every(isHigherEducation)).toBe(true);
    expect(['Grade 11', 'Year 7', 'Primary school, ages 9 to 11', 'Middle school'].some(isHigherEducation)).toBe(false);
  });

  it('teaches as a university does, and gives in-class graded work a place', () => {
    const bg = courseBackground(university());
    expect(bg).toMatch(/university teaching/);
    expect(bg).toMatch(/Seminar presentation \(20%\), 3,000-word essay \(80%\)/);
    expect(courseBackground(smallCourse())).not.toMatch(/university teaching/);
  });

  it('passes the brief on, so what happens in class survives without a grade weight', () => {
    const c = { ...university(), grading: [], brief: 'Four two-hour seminars.\nEach week one student presents.' };
    const bg = courseBackground(c);
    expect(bg).toContain('The teacher\'s brief: "Four two-hour seminars. Each week one student presents."');
    expect(bg).toMatch(/student presentation.*needs a place in the lesson plans/);
    expect(bg).not.toMatch(/graded by/);
    expect(bg).toMatch(/never infer one/);
    expect(bg).toMatch(/exit tickets/);
  });

  it('names rubric levels after the local grade bands', () => {
    const lesson = (c: Course) => orderedLessons(c)[0]!;
    const uk = university('en-GB');
    const us = university('en-US');
    expect(sectionPrompt(uk, lesson(uk), 'assignments')).toMatch(/"First", "Upper second"/);
    expect(sectionPrompt(us, lesson(us), 'assignments')).toMatch(/"A", "B"/);
    const school = smallCourse();
    expect(sectionPrompt(school, lesson(school), 'assignments')).not.toMatch(/grade bands|degree classes|letter grades/);
    expect(sectionPrompt({ ...school, rubrics: {} }, lesson(school), 'assignments')).toMatch(/exactly "Excellent", "Good", "Developing" and "Beginning"/);
    // A course with a rubric passes its levels on, a teacher's renaming included.
    const renamed = { ...school, rubrics: { r1: { id: 'r1', title: 'R', levels: [{ id: 'a', label: 'Gold', points: 3 }, { id: 'b', label: 'Silver', points: 2 }, { id: 'c', label: 'Bronze', points: 1 }], criteria: [] } } } as Course;
    expect(sectionPrompt(renamed, lesson(renamed), 'assignments')).toMatch(/exactly: "Gold" \(3\), "Silver" \(2\), "Bronze" \(1\)/);
  });
});

describe('every course', () => {
  it('never lets the model invent a quotation, and writes maths in Unicode', () => {
    const s = systemPrompt('en', 'en-GB');
    expect(s).toMatch(/never invent a quotation or a page number/);
    expect(s).toMatch(/never LaTeX/);
  });

  it('writes the quiz and the assignment from the lesson plan, with its figures', () => {
    const c = smallCourse();
    const lesson = orderedLessons(c).find((l) => l.segments.length) ?? orderedLessons(c)[0]!;
    const withPlan = { ...lesson, keyIdeas: ['The mean is 7.2'], segments: [{ id: 'x1', kind: 'teach' as const, title: 'Worked example', minutes: 10, description: 'Mean of 4, 9, 8 is 7', teacherNotes: '' }] };
    for (const kind of ['quiz', 'assignments'] as const) {
      expect(sectionPrompt(c, withPlan, kind)).toMatch(/Mean of 4, 9, 8 is 7[\s\S]*same examples, data and figures/);
    }
  });
});
