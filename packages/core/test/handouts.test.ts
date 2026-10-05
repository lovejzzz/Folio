import { describe, expect, it } from 'vitest';
import { orderedLessons, project, type Course, type Handout } from '../src';
import { sampleCourse } from '../src/sample';

const base = sampleCourse();
const lesson = orderedLessons(base)[0]!;
const sheet = (fields: Partial<Handout>): Handout => ({ id: 'x_1', title: 'Sheet', kind: 'worksheet', usedIn: 'Practice', copies: 'One per student', blocks: [], key: '', supports: false, ...fields });
const withSheets = (handouts: Handout[]): Course => ({ ...base, lessons: { ...base.lessons, [lesson.id]: { ...lesson, handouts } } });
const blocks = (course: Course, audience: 'teacher' | 'student') => project(course, 'plan', { audience, lessonIds: [lesson.id] }).blocks;

describe('a lesson\'s handouts on paper', () => {
  it('each start a page under their title, with room to write as ruled lines, and the key in the teacher\'s copy alone', () => {
    const course = withSheets([sheet({ title: 'Exit ticket', key: '1. Six.', blocks: [{ type: 'para', text: 'Answer before you leave.' }, { type: 'yours', hint: '', lines: 2 }] })]);
    const teacher = blocks(course, 'teacher');
    const at = teacher.findIndex((b) => b.t === 'heading' && b.text === 'Exit ticket');
    expect(teacher[at - 1]).toEqual({ t: 'break' });
    expect(teacher.slice(at + 1, at + 5)).toMatchObject([{ t: 'para', tone: 'muted', text: 'One per student · Used in: Practice' }, { t: 'para', text: 'Answer before you leave.' }, { t: 'para', text: `${'_'.repeat(72)}\n${'_'.repeat(72)}` }, { t: 'note', label: 'Answer key', text: '1. Six.' }]);
    expect(JSON.stringify(blocks(course, 'student'))).not.toContain('1. Six.');
  });

  it('print slips several to a page with a line to cut along, and cards as a grid of cells', () => {
    const slips = blocks(withSheets([sheet({ kind: 'slips', blocks: [{ type: 'para', text: 'One thing you learned:' }] })]), 'student');
    expect(slips.filter((b) => b.t === 'para' && b.text === 'One thing you learned:')).toHaveLength(3);
    expect(slips.filter((b) => b.t === 'para' && b.text.startsWith('✂'))).toHaveLength(2);
    const cards = blocks(withSheets([sheet({ kind: 'cards', blocks: [{ type: 'para', text: 'Cut out and sort.' }, { type: 'table', columns: ['Card', 'Fraction'], caption: '', rows: [['1', '1/2'], ['2', '2/4'], ['3', '3/4'], ['4', '1/4']] }] })]), 'student');
    expect(cards.find((b) => b.t === 'table' && !b.head.length)).toMatchObject({ rows: [['\n1/2\n', '\n2/4\n', '\n3/4\n'], ['\n1/4\n', '', '']] });
  });
});
