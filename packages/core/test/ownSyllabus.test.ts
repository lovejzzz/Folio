import { describe, expect, it } from 'vitest';
import { cmd, CourseStore, createSource, parseCourse, project } from '../src';
import { sampleCourse } from '../src/sample';

const SYLLABUS = 'ENVS 110: Our Changing Planet\nFall 2026, Tue and Thu 10:30-11:45\nInstructor: Dr. Rivera\n\nGrading: quizzes 30%, project 40%, final 20%.\n\nWeek 1 Sep 1 Introduction\nWeek 2 Sep 8 Climate basics\nWeek 3 TBA';
const origin = { label: { key: 'test' }, source: 'user' } as never;

function withOwnSyllabus() {
  const store = new CourseStore(sampleCourse());
  const source = createSource('ENVS 110 syllabus', SYLLABUS, 'file');
  store.apply([cmd('source.add', { source }), cmd('syllabus.own', { sourceId: source.id })], origin);
  return { store, source };
}

describe('a syllabus the teacher brought', () => {
  it('is the course’s syllabus, kept as they wrote it, with no check yet', () => {
    const { store, source } = withOwnSyllabus();
    expect(store.getState().syllabus).toEqual({ sourceId: source.id, check: null });
    const student = JSON.stringify(project(store.getState(), 'syllabus', { audience: 'student' }).blocks);
    expect(student).toContain('ENVS 110: Our Changing Planet');
    expect(student).toContain('Week 3 TBA');
    // Folio's own schedule table is not there.
    expect(project(store.getState(), 'syllabus', { audience: 'student' }).blocks.some((b) => b.t === 'table')).toBe(false);
  });

  it('shows the check to the teacher only: waiting, then what it found', () => {
    const { store } = withOwnSyllabus();
    expect(JSON.stringify(project(store.getState(), 'syllabus', { audience: 'teacher' }).blocks)).toContain('Folio is checking this syllabus.');
    store.apply([cmd('syllabus.checked', { issues: [{ kind: 'error', where: 'Grading', problem: 'The weights add up to 90%.', fix: 'Give the final 30%.' }], checkedAt: '2026-09-30T00:00:00Z' })], origin);
    const teacher = project(store.getState(), 'syllabus', { audience: 'teacher' }).blocks;
    expect(teacher).toContainEqual({ t: 'note', label: 'Error · Grading', text: 'The weights add up to 90%. Give the final 30%.' });
    const student = project(store.getState(), 'syllabus', { audience: 'student' }).blocks;
    expect(student.some((b) => b.t === 'note')).toBe(false);
    expect(JSON.stringify(student)).not.toContain('90%');
  });

  it('says so when the check found nothing, survives a round trip, and goes when its file is removed', () => {
    const { store, source } = withOwnSyllabus();
    store.apply([cmd('syllabus.checked', { issues: [], checkedAt: '2026-09-30T00:00:00Z' })], origin);
    expect(JSON.stringify(project(store.getState(), 'syllabus', { audience: 'teacher' }).blocks)).toContain('found nothing to fix');
    expect(parseCourse(JSON.parse(JSON.stringify(store.getState()))).syllabus?.check?.issues).toEqual([]);
    store.apply([cmd('source.remove', { sourceId: source.id })], origin);
    expect(store.getState().syllabus).toBeNull();
    expect(project(store.getState(), 'syllabus', { audience: 'student' }).blocks.some((b) => b.t === 'table')).toBe(true);
  });

  it('is absent from courses saved before there was one', () => {
    const saved = JSON.parse(JSON.stringify(sampleCourse())) as Record<string, unknown>;
    delete saved.syllabus;
    expect(parseCourse(saved).syllabus).toBeNull();
  });
});

describe('the lines of a syllabus the teacher brought', () => {
  const paras = (text: string) => {
    const store = new CourseStore(sampleCourse());
    const source = createSource('Syllabus', text, 'file');
    store.apply([cmd('source.add', { source }), cmd('syllabus.own', { sourceId: source.id })], origin);
    return project(store.getState(), 'syllabus', { audience: 'student' }).blocks.flatMap((b) => (b.t === 'para' ? [b.text] : []));
  };

  it('stay apart when they are long schedule rows or list items', () => {
    const schedule = ['Week 1 (Sep 1): Introduction to environmental science; read chapter 1 before class', 'Week 2 (Sep 8): The climate system and the greenhouse effect; read chapter 2 before class', 'Sep 15: Field trip to the wetland reserve, meet at the north gate at nine in the morning'];
    expect(paras(schedule.join('\n'))).toEqual(schedule);
    const policies = ['- Late work loses ten percent a day and is not accepted after one full week has passed', '- Phones stay in bags during lectures and labs unless the instructor says otherwise'];
    expect(paras(policies.join('\n'))).toEqual(policies);
  });

  it('are joined again when a PDF broke one paragraph across them', () => {
    const wrapped = 'This course introduces the science of a changing planet, from the carbon cycle to the\nchoices communities make about energy, water and land, with weekly labs and one field trip.';
    expect(paras(wrapped)).toEqual([wrapped.replace('\n', ' ')]);
  });

  it('lose the page breaks and control characters a file can’t carry', () => {
    expect(paras('Page one text\fPage two\u0001 text')).toEqual(['Page one text', 'Page two text']);
  });
});
