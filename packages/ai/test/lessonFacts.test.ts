import { CourseStore, MATERIAL_KINDS, orderedLessons, parseCourse, type Course, type MaterialKind } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingTargets, runBuild, type BuildHost } from '../src/build';
import { checkFault, FactsCheck, factsSummary, hasFacts, lessonFacts, needsFacts } from '../src/lessonFacts';
import { untaught } from '../src/slideSteps';
import { checklistLines, lessonChecklist } from '@folio/core';
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
/** A second reading that speaks of both cases and finds nothing. */
const SOUND = { cases: [{ n: 1, unsupported: [] }, { n: 2, unsupported: [] }] };
const slides = { slides: [{ layout: 'title', title: 'T', bullets: [], notes: '' }, { layout: 'bullets', title: 'A', bullets: ['a'], notes: '' }, { layout: 'bullets', title: 'B', bullets: ['b'], notes: '' }] };
const host = (store: CourseStore, model: ReturnType<typeof fakeInference>): BuildHost => ({ inference: model, getCourse: () => store.getState(), commit: (_t, commands) => void store.apply(commands, { label: { key: 't' }, source: 'ai' }), signal: new AbortController().signal }) as BuildHost;

describe('a lesson written without a plan', () => {
  it('has its facts settled first, and everything written of it is given the same account', async () => {
    const store = new CourseStore(chosen(['slides', 'quiz']));
    const first = store.getState().lessonOrder[0]!;
    expect(needsFacts(store.getState(), store.getState().lessons[first]!)).toBe(true);
    const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : req.task === 'folio_facts_check' ? SOUND : req.task === 'folio_slides' ? slides : { questions: [] }));
    await runBuild(host(store, model), missingTargets(store.getState(), [first]));
    const lesson = store.getState().lessons[first]!;
    expect(hasFacts(lesson)).toBe(true);
    expect(lesson.cases.map((c) => c.title)).toEqual(['The plant closes', 'One worker dismissed']);
    // The facts were asked for before anything else, and once; then read by a second reader.
    expect(model.calls.slice(0, 2).map((c) => c.task)).toEqual(['folio_facts', 'folio_facts_check']);
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
    const summary = await runBuild(host(store, fakeInference((req) => (req.task === 'folio_facts' ? { keyIdeas: [] } : req.task === 'folio_facts_check' ? SOUND : slides))), missingTargets(store.getState(), [first]));
    expect(summary.built).toBe(0);
    expect(store.getState().lessons[first]!.slides).toHaveLength(0);
    expect(missingTargets(store.getState(), [first]).map((t) => t.kind)).toEqual(['facts', 'slides']);
  });

  it('keeps its facts for a material added later: they are not settled a second time', async () => {
    const store = new CourseStore(chosen(['quiz']));
    const first = store.getState().lessonOrder[0]!;
    const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : req.task === 'folio_facts_check' ? SOUND : req.task === 'folio_slides' ? slides : { questions: [] }));
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

describe('what a case’s answer claims beyond what is given', () => {
  // As it was found: the case gives a closing and 600 jobs lost; its answer says the town offers few similar jobs.
  const claimed = { ...facts, cases: [{ ...facts.cases[0]!, answer: 'The plant closed, and the local economy offers few similar jobs, so 600 people compete for a small number of openings.' }, facts.cases[1]!] };
  const claim = 'the local economy offers few similar jobs';

  it('is read by a second reader, named to the writer once, and gone when the second writing drops it', async () => {
    const c = chosen(['slides']);
    const first = c.lessonOrder[0]!;
    let checks = 0;
    const model = fakeInference((req, call) => (req.task === 'folio_facts' ? (call === 1 ? claimed : facts) : { cases: checks++ === 0 ? [{ n: 1, unsupported: [claim] }, { n: 2, unsupported: [] }] : SOUND.cases }));
    const store = new CourseStore(c);
    store.apply(await lessonFacts(model, c, first), { label: { key: 't' }, source: 'ai' });
    expect(model.calls.map((x) => x.task)).toEqual(['folio_facts', 'folio_facts_check', 'folio_facts', 'folio_facts_check']);
    expect(model.calls[2]!.prompt).toContain(`in "The plant closes": "${claim}"`);
    expect(store.getState().lessons[first]!.cases.every((x) => x.unsupported.length === 0)).toBe(true);
    expect(checklistLines(lessonChecklist(store.getState(), store.getState().lessons[first]!)).look.join(' ')).not.toContain('second reading');
  });

  it('is kept on the case when it is still there after one rewrite: writers are told not to state it, and the teacher is told', async () => {
    const c = chosen(['slides']);
    const first = c.lessonOrder[0]!;
    const model = fakeInference((req) => (req.task === 'folio_facts' ? claimed : { cases: [{ n: 1, unsupported: [claim] }, { n: 2, unsupported: [] }] }));
    const store = new CourseStore(c);
    store.apply(await lessonFacts(model, c, first), { label: { key: 't' }, source: 'ai' });
    const lesson = store.getState().lessons[first]!;
    // Asked for twice and no more.
    expect(model.calls.filter((x) => x.task === 'folio_facts')).toHaveLength(2);
    expect(lesson.cases[0]!.unsupported).toEqual([claim]);
    expect(factsSummary(lesson)).toContain(`NOT given by the case, so never stated as fact in what you write: "${claim}"`);
    expect(checklistLines(lessonChecklist(store.getState(), lesson)).look.join(' ')).toContain(`The plant closes: ${claim}`);
  });
});

/**
 * A real deck of a week on units, vectors and the dot product, written from the lesson's facts (physics;
 * readiness/batch7-facts/phys-slides-quiz, kept in test/fixtures/facts-physics-l1.json): eight slides, all on units.
 */
describe('a deck that leaves out what the lesson was settled with', () => {
  const real = JSON.parse(readFileSync(new URL('./fixtures/facts-physics-l1.json', import.meta.url), 'utf8')) as { cases: { title: string }[]; slides: { layout: 'bullets'; title: string; bullets: string[]; notes: string }[] };
  const lessonOf = (cases: unknown) => ({ segments: [], cases }) as never;
  const deck = (list: typeof real.slides) => ({ slides: list.map((s) => ({ ...s, segment: 0 })) });

  it('is found: the two cases on vectors have no slide, as the real deck was', () => {
    expect(real.cases.map((c) => c.title)).toEqual(['Highway speed in SI units', 'Two candidate fall-time formulas', 'Two walking legs added', 'Dot product of a force and a displacement']);
    expect(untaught(deck(real.slides), lessonOf(real.cases))).toEqual(['Two walking legs added', 'Dot product of a force and a displacement']);
  });

  it('is not found once each case has a slide, by its name or by its numbers; and is not asked of a lesson with a plan', () => {
    const more = [...real.slides, { layout: 'bullets' as const, title: 'Two walking legs added', bullets: ['Resolve each leg into components.'], notes: '' }, { layout: 'bullets' as const, title: 'Work', bullets: ['F = (3.0, −2.0, 4.0) N and d = (2.0, 5.0, −1.0) m: find F·d.'], notes: 'Magnitudes √29 and √30.' }];
    expect(untaught(deck(more), lessonOf(real.cases))).toEqual([]);
    expect(untaught(deck(real.slides), { segments: [{}], cases: real.cases } as never)).toEqual([]);
  });
});

describe('a second reading that is not a reading of these cases', () => {
  const reading = (cases: { n: number; unsupported: string[] }[]) => FactsCheck.parse({ cases });

  it('is told from a sound one: every case once, by its number, and no other', () => {
    expect(checkFault(reading(SOUND.cases), 2)).toBeNull();
    // As it was found: each of these parsed, and each was taken for "nothing found".
    expect(checkFault(reading([]), 2)).toContain('says nothing of case 1, 2');
    expect(checkFault(reading([{ n: 1, unsupported: [] }]), 2)).toContain('says nothing of case 2');
    expect(checkFault(reading([{ n: 1, unsupported: [] }, { n: 1, unsupported: ['x'] }]), 2)).toContain('case 1 twice');
    expect(checkFault(reading([{ n: 1, unsupported: [] }, { n: 2, unsupported: [] }, { n: 3, unsupported: [] }]), 2)).toContain('case 3, and there are 2');
  });

  it('is asked for once more, with what was wrong said, and taken when the second is whole', async () => {
    const c = chosen(['slides']);
    let reads = 0;
    const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : reads++ === 0 ? { cases: [] } : SOUND));
    const commands = await lessonFacts(model, c, c.lessonOrder[0]!);
    expect(commands).toHaveLength(1);
    expect(model.calls.map((x) => x.task)).toEqual(['folio_facts', 'folio_facts_check', 'folio_facts_check']);
    expect(model.calls[2]!.prompt).toContain('A first answer was not usable: it says nothing of case 1, 2');
  });

  it('fails the step when it is still not whole: the facts are not taken as checked, and nothing is written from them', async () => {
    for (const bad of [{ cases: [] }, { cases: [{ n: 1, unsupported: [] }, { n: 1, unsupported: [] }] }, { cases: [{ n: 1, unsupported: [] }, { n: 2, unsupported: [] }, { n: 9, unsupported: [] }] }]) {
      const store = new CourseStore(chosen(['slides']));
      const first = store.getState().lessonOrder[0]!;
      const model = fakeInference((req) => (req.task === 'folio_facts' ? facts : req.task === 'folio_facts_check' ? bad : slides));
      const summary = await runBuild(host(store, model), missingTargets(store.getState(), [first]));
      expect(summary.built).toBe(0);
      expect(store.getState().lessons[first]!.cases).toEqual([]);
      expect(store.getState().lessons[first]!.slides).toEqual([]);
      // Two readings and no third.
      expect(model.calls.filter((x) => x.task === 'folio_facts_check').length).toBeLessThanOrEqual(4);
      expect(missingTargets(store.getState(), [first]).map((t) => t.kind)).toEqual(['facts', 'slides']);
    }
  });
});
