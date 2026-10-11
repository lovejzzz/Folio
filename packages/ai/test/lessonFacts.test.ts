import { CourseStore, MATERIAL_KINDS, orderedLessons, parseCourse, type Course, type MaterialKind } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingTargets, runBuild, type BuildHost } from '../src/build';
import { factsSummary, hasFacts, needsFacts } from '../src/lessonFacts';
import { sectionPrompt } from '../src/prompts';
import { fakeInference, smallCourse } from './fake';

const chosen = (kinds: MaterialKind[]): Course => {
  const c = smallCourse();
  return { ...c, materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'] };
};
/** The case as it should stand: a plant closes, a worker loses her job; what she had saved is no cause of that. */
const facts = {
  keyIdeas: ['A personal trouble and a public issue can be the same event seen at two scales.', 'What a case does not give cannot be claimed of it.'],
  vocabulary: [{ term: 'public issue', definition: 'A matter that lies beyond one person and their surroundings.' }],
  cases: [
    { title: 'The plant closes', known: 'A plant that employs 1,500 people closes. Maria, who worked there for nine years, is out of work.', question: 'What explains Maria losing her job?', answer: 'The plant closed: all 1,500 lost their jobs together, so the cause lies with the plant and its owners, not with Maria.', notShown: 'Nothing is given about Maria’s savings, effort or search for work: none is a cause of her losing the job.' },
    { title: 'One worker dismissed', known: 'In a firm of 300, one worker is dismissed after repeated absences.', question: 'Is this a trouble or an issue?', answer: 'A personal trouble: one case, with a cause in that worker’s own circumstances.', notShown: '' },
  ],
};
const slides = { slides: [{ layout: 'title', title: 'T', bullets: [], notes: '' }, { layout: 'bullets', title: 'A', bullets: ['a'], notes: '' }, { layout: 'bullets', title: 'B', bullets: ['b'], notes: '' }] };
const host = (store: CourseStore, model: ReturnType<typeof fakeInference>): BuildHost => ({ inference: model, getCourse: () => store.getState(), commit: (_t, commands) => void store.apply(commands, { label: { key: 't' }, source: 'ai' }), signal: new AbortController().signal }) as BuildHost;

describe('a lesson written without a plan', () => {
  it('has its facts settled first, and everything written of it is given the same account', async () => {
    const store = new CourseStore(chosen(['slides', 'quiz']));
    const first = store.getState().lessonOrder[0]!;
    expect(needsFacts(store.getState(), store.getState().lessons[first]!)).toBe(true);
    const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : req.task === 'folio_slides' ? slides : { questions: [] }));
    await runBuild(host(store, model), missingTargets(store.getState(), [first]));
    const lesson = store.getState().lessons[first]!;
    expect(hasFacts(lesson)).toBe(true);
    expect(lesson.cases.map((c) => c.title)).toEqual(['The plant closes', 'One worker dismissed']);
    // The facts were asked for before anything else, and once.
    expect(model.calls[0]!.task).toBe('folio_facts');
    expect(model.calls.filter((c) => c.task === 'folio_facts')).toHaveLength(1);
    // Both writers were given the case, its answer, and what it does not show.
    for (const task of ['folio_slides', 'folio_quiz']) {
      const asked = model.calls.find((c) => c.task === task)!.prompt;
      expect(asked, task).toContain('Given: A plant that employs 1,500 people closes.');
      expect(asked, task).toContain('Not shown by the case, and never claimed: Nothing is given about Maria’s savings');
    }
  });

  it('is not written from a guess when its facts cannot be had: the parts stay to be written', async () => {
    const store = new CourseStore(chosen(['slides']));
    const first = store.getState().lessonOrder[0]!;
    const summary = await runBuild(host(store, fakeInference((req) => (req.task === 'folio_facts' ? { keyIdeas: [] } : slides))), missingTargets(store.getState(), [first]));
    expect(summary.built).toBe(0);
    expect(store.getState().lessons[first]!.slides).toHaveLength(0);
    expect(missingTargets(store.getState(), [first]).map((t) => t.kind)).toEqual(['facts', 'slides']);
  });

  it('keeps its facts for a material added later: they are not settled a second time', async () => {
    const store = new CourseStore(chosen(['quiz']));
    const first = store.getState().lessonOrder[0]!;
    const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : req.task === 'folio_slides' ? slides : { questions: [] }));
    await runBuild(host(store, model), missingTargets(store.getState(), [first]));
    store.apply([{ type: 'material.set', payload: { kind: 'slides', enabled: true } } as never], { label: { key: 't' }, source: 'teacher' });
    expect(missingTargets(store.getState(), [first]).map((t) => t.kind)).not.toContain('facts');
    expect(missingTargets(store.getState(), [first]).map((t) => t.kind)).toContain('slides');
    await runBuild(host(store, model), missingTargets(store.getState(), [first]));
    expect(model.calls.filter((c) => c.task === 'folio_facts')).toHaveLength(1);
    expect(model.calls.find((c) => c.task === 'folio_slides')!.prompt).toContain('Answer: The plant closed');
  });

  it('is given its plan where it has one, and no facts step is taken', () => {
    const c = chosen(['plan', 'slides']);
    const lesson = c.lessons[c.lessonOrder[0]!]!;
    expect(needsFacts(c, lesson)).toBe(false);
    expect(factsSummary(lesson)).toBe('');
    expect(sectionPrompt(c, lesson, 'slides')).not.toContain('There is no lesson plan.');
  });
});

/**
 * The fault as a teacher was given it, and the same lesson written again with its facts settled first: both real
 * products (readiness/batch4-partial/slides-only-2 and batch7-facts/soc-slides), kept in test/fixtures.
 */
describe('a plant closes: the real deck written alone, before and after', () => {
  const before = orderedLessons(parseCourse(JSON.parse(readFileSync(new URL('./fixtures/partial-slides-only.json', import.meta.url), 'utf8')) as unknown))[0]!;
  const after = JSON.parse(readFileSync(new URL('./fixtures/facts-sociology-l1.json', import.meta.url), 'utf8')) as { cases: { title: string; known: string; answer: string; notShown: string }[]; slides: { title: string; bullets: string[]; notes: string }[] };

  it('gave, as reasons a worker lost her job when the plant closed, what she had not saved', () => {
    const notes = before.slides.map((s) => s.notes).join('\n');
    expect(notes).toMatch(/did not save|no savings|had not saved/i);
    expect(before.cases).toEqual([]);
  });

  it('now has the case settled once, with what it does not show, and the slide that uses it gives that answer', () => {
    const plant = after.cases.find((c) => /plant|factory/i.test(c.title))!;
    expect(plant.known).toMatch(/closes/);
    expect(plant.notShown).toMatch(/does not say why the factory closed/);
    expect(plant.answer).not.toMatch(/did not save|no savings/i);
    const slide = after.slides.find((s) => s.title === plant.title)!;
    expect(slide.bullets.join(' ')).toContain('600 workers lose their jobs');
    // The slide's answer is the case's own (quotation marks apart).
    const plain = (x: string) => x.replace(/[’']/g, '');
    expect(plain(slide.notes)).toContain(plain(plant.answer).slice(0, 120));
    expect(after.slides.map((s) => s.notes).join('\n')).not.toMatch(/did not save|no savings|had not saved/i);
  });
});
