import { describe, expect, it } from 'vitest';
import { MATERIAL_KINDS, cmd, CourseStore, newId, orderedLessons, parseCourse, project } from '../src';
import { sampleCourse } from '../src/sample';

const course = sampleCourse();

describe('project', () => {
  it('produces a non-empty document for every material and audience', () => {
    for (const kind of MATERIAL_KINDS) {
      for (const audience of ['student', 'teacher'] as const) {
        const doc = project(course, kind, { audience });
        expect(doc.blocks.length, `${kind}/${audience}`).toBeGreaterThan(0);
        expect(doc.subtitle).toBe(course.title);
      }
    }
  });

  it('never puts answers, explanations or teacher notes in a student copy', () => {
    for (const kind of MATERIAL_KINDS) {
      const doc = project(course, kind, { audience: 'student' });
      const text = JSON.stringify(doc);
      expect(text).not.toContain('"answer"');
      expect(text).not.toContain('"explanation"');
      expect(text).not.toContain('"notes"');
      expect(text).not.toContain('Teacher note');
      expect(doc.blocks.some((b) => b.t === 'answers' || b.t === 'note')).toBe(false);
    }
  });

  it('adds an answer key to the teacher quiz', () => {
    const doc = project(course, 'quiz', { audience: 'teacher' });
    const key = doc.blocks.find((b) => b.t === 'answers');
    expect(key && key.t === 'answers' && key.items.length).toBe(20);
    const first = doc.blocks.find((b) => b.t === 'question');
    expect(first && first.t === 'question' && first.answer).toMatch(/^B\. How many hours/);
  });

  it('limits a document to selected lessons', () => {
    const lesson = orderedLessons(course)[2]!;
    const doc = project(course, 'quiz', { audience: 'student', lessonIds: [lesson.id] });
    expect(doc.blocks.filter((b) => b.t === 'question')).toHaveLength(5);
    expect(doc.blocks[0]).toMatchObject({ t: 'heading', text: 'Lesson 3 · Centre and spread' });
  });

  it('shows the same edited question in the quiz and the study guide', () => {
    const store = new CourseStore(course);
    const lesson = orderedLessons(course)[0]!;
    store.apply([cmd('task.update', { taskId: lesson.taskIds[0]!, fields: { prompt: 'Edited once' } })], {
      label: { key: 't' },
      source: 'teacher',
    });
    for (const kind of ['quiz', 'study'] as const) {
      expect(JSON.stringify(project(store.getState(), kind, { audience: 'student' }))).toContain('Edited once');
    }
  });

  it('applies a material-local override to one view only', () => {
    const store = new CourseStore(course);
    const lesson = orderedLessons(course)[0]!;
    const override = { id: newId('x'), view: 'study' as const, entityId: lesson.taskIds[0]!, field: 'prompt', value: 'Study wording' };
    store.apply([cmd('override.set', { override })], { label: { key: 't' }, source: 'teacher' });
    expect(JSON.stringify(project(store.getState(), 'study', { audience: 'student' }))).toContain('Study wording');
    expect(JSON.stringify(project(store.getState(), 'quiz', { audience: 'student' }))).not.toContain('Study wording');
  });

  it('writes document labels in the course language', () => {
    const zh = { ...course, language: 'zh-CN' as const };
    expect(project(zh, 'quiz', { audience: 'student' }).title).toBe('测验与题库');
  });
});

describe('the syllabus', () => {
  const meta = { label: { key: 't' }, source: 'teacher' } as const;
  const tables = (c: typeof course) => project(c, 'syllabus', { audience: 'teacher' }).blocks.filter((b) => b.t === 'table');

  it('adds a reading column, and the lesson plan a reading list, only once a lesson has readings', () => {
    expect(tables(course)[0]).toMatchObject({ head: ['#', 'Lesson', 'Focus'] });
    const store = new CourseStore(course);
    const lesson = orderedLessons(course)[1]!;
    store.apply([cmd('lesson.update', { lessonId: lesson.id, readings: ['Freedman, Statistics, ch. 3', 'Handout: reading a histogram'] })], meta);
    const schedule = tables(store.getState())[0]!;
    expect(schedule).toMatchObject({ head: ['#', 'Lesson', 'Focus', 'Reading'] });
    expect(schedule.t === 'table' && schedule.rows.map((r) => r[3])).toEqual(['', 'Freedman, Statistics, ch. 3\nHandout: reading a histogram', '', '']);
    const plan = project(store.getState(), 'plan', { audience: 'student', lessonIds: [lesson.id] }).blocks;
    const at = plan.findIndex((b) => b.t === 'heading' && b.text === 'Before class');
    expect(plan[at + 1]).toEqual({ t: 'list', ordered: false, items: ['Freedman, Statistics, ch. 3', 'Handout: reading a histogram'] });
    expect(project(course, 'plan', { audience: 'student' }).blocks.some((b) => b.t === 'heading' && b.text === 'Before class')).toBe(false);
  });

  it('lists components named without weights, with no column of zeros or total', () => {
    const c = { ...sampleCourse(), grading: [{ id: 'g1', item: 'Weekly quiz', weight: 0 }, { id: 'g2', item: 'Unit test', weight: 0 }] };
    const table = project(c, 'syllabus', { audience: 'teacher' }).blocks.find((b) => b.t === 'table' && b.rows.some((r) => r[0] === 'Weekly quiz'));
    expect(table).toMatchObject({ head: ['Component'], rows: [['Weekly quiz'], ['Unit test']] });
  });

  it('puts the stated grading scheme first under assessment, with its total', () => {
    const store = new CourseStore(course);
    const grading = [
      { id: 'g1', item: 'Problem sets', weight: 30 },
      { id: 'g2', item: 'Midterm', weight: 30 },
      { id: 'g3', item: 'Final exam', weight: 40 },
      { id: 'g4', item: '', weight: 0 },
    ];
    store.apply([cmd('course.update', { grading })], meta);
    const doc = project(store.getState(), 'syllabus', { audience: 'teacher' });
    const at = doc.blocks.findIndex((b) => b.t === 'heading' && b.text === 'How learning is assessed');
    expect(doc.blocks[at + 1]).toEqual({
      t: 'table',
      head: ['Component', 'Weight'],
      widths: [76, 24],
      rows: [
        ['Problem sets', '30%'],
        ['Midterm', '30%'],
        ['Final exam', '40%'],
        ['Total', '100%'],
      ],
    });
    expect(doc.blocks[at + 2]).toMatchObject({ t: 'list' });
    store.undo();
    expect(store.getState().grading).toEqual([]);
  });

  it('flags weights that do not add up in the teacher copy only', () => {
    const c = { ...course, grading: [{ id: 'g1', item: 'Essay', weight: 33.3 }, { id: 'g2', item: 'Exam', weight: 56.7 }] };
    const teacher = project(c, 'syllabus', { audience: 'teacher' });
    expect(teacher.blocks).toContainEqual({ t: 'para', tone: 'muted', text: 'These weights add up to 90%, not 100%.' });
    const student = project(c, 'syllabus', { audience: 'student' });
    expect(JSON.stringify(student)).not.toContain('not 100%');
    expect(JSON.stringify(student)).toContain('["Total","90%"]');
  });
});

describe('parseCourse', () => {
  it('round-trips through JSON', () => {
    expect(parseCourse(JSON.parse(JSON.stringify(course)))).toEqual(course);
  });

  it('migrates version 1 flag sentences into notes', () => {
    const lesson = orderedLessons(course)[0]!;
    // Version 1 stored one sentence (or null) where version 2 stores a list of flags.
    const raw = JSON.parse(JSON.stringify({ ...course, schemaVersion: 1 }).replace(/"flags":\[\]/g, '"flag":null'));
    raw.lessons[lesson.id].gen.quiz.flag = 'There are 1 questions instead of 5.';
    const migrated = parseCourse(raw);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.lessons[lesson.id]!.gen.quiz!.flags).toEqual([{ code: 'note', values: { text: 'There are 1 questions instead of 5.' } }]);
    expect(migrated.tasks[lesson.taskIds[0]!]!.flags).toEqual([]);
    expect(migrated).toEqual({ ...course, lessons: migrated.lessons });
  });

  it('migrates version 2, from before homework and sessions, with an assignment in every lesson and one class', () => {
    const raw = JSON.parse(JSON.stringify({ ...course, schemaVersion: 2 }));
    delete raw.shape.sessions;
    for (const l of Object.values(raw.lessons) as Record<string, unknown>[]) {
      delete l.homework;
      for (const seg of l.segments as Record<string, unknown>[]) delete seg.session;
    }
    const migrated = parseCourse(raw);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.shape.sessions).toEqual([]);
    for (const l of Object.values(migrated.lessons)) {
      expect(l.homework).toEqual({ kind: 'assignment', toward: '' });
      expect(l.segments.every((seg) => seg.session === 0)).toBe(true);
    }
  });

  it('rejects newer and damaged files with codes and plain messages', () => {
    expect(() => parseCourse({ ...course, schemaVersion: 99 })).toThrow(expect.objectContaining({ code: 'newerVersion' }));

    expect(() => parseCourse({ ...course, schemaVersion: 99 })).toThrow('newer version');
    expect(() => parseCourse({ ...course, lessons: 3 })).toThrow('damaged');
    expect(() => parseCourse('nope')).toThrow('does not contain');
  });
});

describe('suggested further reading', () => {
  it('reaches no material or export until the teacher adds it', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('lesson.update', { lessonId: lesson.id, suggestedReadings: ['Unchecked suggestion, ch. 9'] })], { label: { key: 't' }, source: 'ai' });
    const text = (c = store.getState()) => MATERIAL_KINDS.map((k) => JSON.stringify(project(c, k, { audience: 'teacher' }))).join('');
    expect(text()).not.toContain('Unchecked suggestion');
    store.apply([cmd('lesson.update', { lessonId: lesson.id, readings: [...lesson.readings, 'Unchecked suggestion, ch. 9'], suggestedReadings: [] })], { label: { key: 't' }, source: 'teacher' });
    expect(text()).toContain('Unchecked suggestion');
  });

  it('is read as empty in a course saved before it existed', () => {
    const old = JSON.parse(JSON.stringify(sampleCourse()));
    for (const l of Object.values(old.lessons) as Record<string, unknown>[]) delete l.suggestedReadings;
    const parsed = parseCourse(old);
    expect(Object.values(parsed.lessons).every((l) => Array.isArray(l.suggestedReadings) && l.suggestedReadings.length === 0)).toBe(true);
  });
});
