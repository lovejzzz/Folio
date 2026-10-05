// @vitest-environment jsdom
import { orderedLessons, type Course, type Question } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { describeExport, exportCourse } from '../src';
import { renderQti } from '../src/qti';

const base = sampleCourse();
const lesson = orderedLessons(base)[0]!;
const q = (id: string, fields: Partial<Question>): Question => ({ id, lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'ai', edited: false, flags: [], kind: 'question', format: 'choice', prompt: '', choices: [], correct: null, answer: '', explanation: '', difficulty: 2, ...fields });
const questions = [
  q('t_a', { prompt: 'What does `len("a&b")` give?\n\nPick one.', choices: [{ id: 'c1', text: '2' }, { id: 'c2', text: '3' }, { id: 'c3', text: '<4>' }], correct: 'c2', explanation: 'Three **characters**.' }),
  q('t_b', { format: 'truefalse', prompt: 'A mean is always a whole number.', choices: [{ id: 'c1', text: 'True' }, { id: 'c2', text: 'False' }], correct: 'c2' }),
  q('t_c', { format: 'numeric', prompt: 'The mean of 12 and 13?', answer: '12.5 points' }),
  q('t_d', { format: 'short', prompt: 'Why sample?', answer: 'A census costs too much.' }),
];
const course: Course = { ...base, tasks: Object.fromEntries(questions.map((x) => [x.id, x])), lessons: { ...base.lessons, [lesson.id]: { ...lesson, taskIds: questions.map((x) => x.id) } } };

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml');
const kinds = (doc: Document) => [...doc.getElementsByTagName('item')].map((i) => i.getElementsByTagName('fieldentry')[0]!.textContent);

describe('the quizzes as Canvas takes them in', () => {
  const files = unzipSync(renderQti(course, [lesson.id]));
  const read = (name: string) => parse(strFromU8(files[name]!));

  it('is a manifest and, for each lesson with questions, a quiz and what Canvas keeps about it: every part well formed', () => {
    expect(Object.keys(files).sort()).toEqual(['folio_quiz_1/assessment_meta.xml', 'folio_quiz_1/folio_quiz_1.xml', 'imsmanifest.xml']);
    for (const name of Object.keys(files)) expect(read(name).getElementsByTagName('parsererror'), name).toHaveLength(0);
    expect(read('imsmanifest.xml').querySelector('resource[type="imsqti_xmlv1p2"] file')!.getAttribute('href')).toBe('folio_quiz_1/folio_quiz_1.xml');
    expect(read('folio_quiz_1/assessment_meta.xml').getElementsByTagName('points_possible')[0]!.textContent).toBe('4');
  });

  it('gives each question as the kind Canvas can mark, with its key; what it cannot mark is read by the teacher', () => {
    const doc = read('folio_quiz_1/folio_quiz_1.xml');
    expect(kinds(doc)).toEqual(['multiple_choice_question', 'true_false_question', 'numerical_question', 'essay_question']);
    const [choice, , numeric, essay] = [...doc.getElementsByTagName('item')];
    // The second choice is the right one, and the text is HTML that says what the page says: code as code, "<" as itself.
    expect(choice!.getElementsByTagName('varequal')[0]!.textContent).toBe('c2');
    expect(choice!.getElementsByTagName('mattext')[0]!.textContent).toBe('<p>What does <code>len(&quot;a&amp;b&quot;)</code> give?</p><p>Pick one.</p>');
    expect(choice!.getElementsByTagName('mattext')[3]!.textContent).toBe('<p>&lt;4&gt;</p>');
    expect(choice!.getElementsByTagName('itemfeedback')[0]!.textContent).toContain('<strong>characters</strong>');
    // 12.5 is right within half of its last place.
    expect([numeric!.getElementsByTagName('vargte')[0]!.textContent, numeric!.getElementsByTagName('varlte')[0]!.textContent]).toEqual(['12.45', '12.55']);
    expect(essay!.getElementsByTagName('setvar')).toHaveLength(0);
    expect(essay!.getElementsByTagName('itemfeedback')[0]!.textContent).toContain('A census costs too much.');
  });

  it('goes in the zip with the teacher\'s copy of the quiz, and never with a student\'s', async () => {
    expect(describeExport({ course, kinds: ['quiz'], audience: 'teacher', format: 'zip' }).contents.some((n) => n.includes('for Canvas (QTI)'))).toBe(true);
    expect(describeExport({ course, kinds: ['quiz'], audience: 'student', format: 'zip' }).contents.some((n) => n.includes('QTI'))).toBe(false);
    expect((await exportCourse({ course, kinds: ['quiz'], audience: 'teacher', format: 'qti' })).name).toMatch(/for Canvas \(QTI\)\.zip$/);
  });
});
