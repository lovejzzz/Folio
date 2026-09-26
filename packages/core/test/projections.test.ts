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

describe('parseCourse', () => {
  it('round-trips through JSON', () => {
    expect(parseCourse(JSON.parse(JSON.stringify(course)))).toEqual(course);
  });

  it('rejects newer and damaged files with plain messages', () => {
    expect(() => parseCourse({ ...course, schemaVersion: 99 })).toThrow('newer version');
    expect(() => parseCourse({ ...course, lessons: 3 })).toThrow('damaged');
    expect(() => parseCourse('nope')).toThrow('does not contain');
  });
});
