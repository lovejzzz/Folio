import { readFileSync } from 'node:fs';
import { apartLine, askedLengths, lessonChecklist, orderedLessons, parseCourse, saidMinutes, saidTotals, sidesApart, termsApart, type Assignment, type Course, type Lesson, type PieceSides } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { otherLength, planOtherLength, slidesOther } from '../src/askedLength';

/**
 * A lesson Folio really wrote (the reading before 0.0.39), kept as it was: the plan and its slide ask a paragraph "in about
 * six sentences", the piece and its rubric "of about three". The other cases are this lesson with one thing changed.
 */
const course = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/r39-english-composition.json', import.meta.url), 'utf8')) as unknown);
const lesson = orderedLessons(course)[0]!;
const writing = lesson.also.find((p) => p.toward === 'Short in-class writing')!;
/** The lesson as the writer of one of its pieces is given it. */
const forPiece: Lesson = { ...lesson, homework: writing, also: [] };
const piece = Object.values(course.tasks).find((t): t is Assignment => t.kind === 'assignment' && t.title.startsWith('Short in-class writing'))!;
/** The course with the piece's words changed, as a teacher's edit or another writing of it would leave it. */
const withPiece = (change: (text: string) => string, edited = false): Course => ({ ...course, tasks: { ...course.tasks, [piece.id]: { ...piece, edited, prompt: change(piece.prompt), steps: piece.steps.map(change) } } });
const lines = (c: Course, l: Lesson = lesson) => termsApart(c, l).map(apartLine);
/** A draft whose rubric has two levels, the higher first. */
const draft = (prompt: string, steps: string[] = [], top: string[] = [], lower = 'Thin.') => ({ prompt, steps, rubric: { levels: [{ points: 4 }, { points: 1 }], criteria: top.map((t) => ({ descriptors: [t, lower] })) } });
const sides = (s: Partial<PieceSides>): PieceSides => ({ toward: 'The piece', plan: '', planMinutes: 0, slides: '', ...s });
const said = (s: Partial<PieceSides>) => sidesApart(sides(s)).map((x) => `${x.term} ${x.a.side}/${x.b.side} ${x.a.says}/${x.b.says}${x.sure ? '' : ' ?'}`);

describe('figures read from a text', () => {
  it('reads lengths: figures, words for numbers, ranges, a number with a comma', () => {
    expect(askedLengths('Write alone for six minutes, in about six sentences.')).toEqual([{ low: 6, high: 6, unit: 'sentence' }]);
    expect(askedLengths('Write five or six sentences.')).toEqual([{ low: 5, high: 6, unit: 'sentence' }]);
    expect(askedLengths('A report of about 3,000 words, on one page.')).toEqual([{ low: 3000, high: 3000, unit: 'word' }, { low: 1, high: 1, unit: 'page' }]);
    expect(askedLengths('Underline one word in your partner\'s sentence.')).toEqual([]);
  });

  it('reads minutes and totals', () => {
    expect(saidMinutes('Work alone for six minutes; a 10-minute share follows.')).toEqual([6, 10]);
    expect(saidTotals('Your paragraph is scored out of 12 points. Each criterion earns 1–4 points, for a total of 12 points.')).toEqual([12]);
    expect(saidTotals('Each correct answer earns 2 points.')).toEqual([]);
  });
});

describe('one piece, side by side', () => {
  it('names a task that asks another length than the plan, whatever its rubric says', () => {
    expect(said({ plan: 'Write six sentences.', task: { prompt: 'Write three sentences.', steps: [] }, rubric: { total: 4, top: ['Six sentences earn full credit.'] } })).toEqual(['length plan/piece 6 sentences/3 sentences', 'length piece/rubric 3 sentences/6 sentences']);
  });

  it('names a rubric that scores another length than the task asks, with or without a plan', () => {
    expect(said({ task: { prompt: 'Write three sentences.', steps: [] }, rubric: { total: 8, top: ['Develops the point.', 'Six sentences earn full credit.'] } })).toEqual(['length piece/rubric 3 sentences/6 sentences']);
    expect(said({ plan: 'Write six sentences.', task: { prompt: 'Write six sentences.', steps: [] }, rubric: { total: 4, top: ['About three sentences.'] } })).toEqual(['length piece/rubric 6 sentences/3 sentences']);
  });

  it('lets a step have a length of its own, and does not add steps up', () => {
    expect(said({ plan: 'in about six sentences', task: { prompt: 'Write about six sentences.', steps: ['Name the moment in one sentence.', 'Say why in two sentences.'] } })).toEqual([]);
    // Six real pieces were named when a step was read as the whole: a worksheet's step beside another activity in the plan.
    expect(said({ plan: 'Each student writes one sentence on the choice.', task: { prompt: 'Complete the worksheet.', steps: ['Write two sentences on shape.', 'Explain its sign in one sentence.'] } })).toEqual([]);
  });

  it('names a time only where the plan gives the piece the whole of its segments, or the piece says more than they hold', () => {
    expect(said({ plan: 'Students write alone for six minutes.', planMinutes: 6, task: { prompt: 'Work alone for five minutes.', steps: [] } })).toEqual(['minutes plan/piece 6 minutes/5 minutes']);
    expect(said({ plan: 'Run the worksheet.', planMinutes: 13, task: { prompt: 'Work with your neighbors for 20 minutes.', steps: [] } })).toEqual(['minutes plan/piece 13 minutes/20 minutes']);
    // A minute to compare with a partner, in a segment of ten, says nothing of the ten.
    expect(said({ plan: 'Partners compare for one minute.', planMinutes: 10, task: { prompt: 'Work for eight minutes.', steps: [] } })).toEqual([]);
  });

  it('names a total the piece says that its rubric does not come to, and a plan or slide that says another', () => {
    expect(said({ task: { prompt: 'Scored out of 10 points.', steps: [] }, rubric: { total: 12, top: [] } })).toEqual(['points rubric/piece 12 points/10 points']);
    expect(said({ plan: 'It is out of 10 points.', slides: 'Out of 12 points', task: { prompt: 'Scored out of 12 points.', steps: [] }, rubric: { total: 12, top: [] } })).toEqual(['points rubric/plan 12 points/10 points']);
  });

  it('says so where it cannot tell which of several figures is the piece\'s', () => {
    expect(said({ plan: 'One sentence each, then a paragraph of six sentences.', task: { prompt: 'Write three sentences.', steps: [] } })).toEqual(['length plan/piece 1 sentence/3 sentences ?']);
    expect(said({ task: { prompt: 'Write three sentences.', steps: [] }, slides: 'One sentence to open. Six sentences in all.' })).toEqual(['length piece/slides 3 sentences/1 sentence ?']);
    expect(apartLine(sidesApart(sides({ task: { prompt: 'Write three sentences.', steps: [] }, slides: 'One sentence to open. Six sentences in all.' }))[0]!)).toContain('Folio cannot tell whether both are about this piece');
  });
});

describe('the lesson as it was written, and with one thing changed', () => {
  it('is told to the teacher on the lesson\'s list, and nothing in it is changed', () => {
    const before = JSON.stringify(course);
    expect(lines(course)).toEqual(['“Short in-class writing”, length: the plan says 6 sentences and the piece 3 sentences.', '“Short in-class writing”, length: the piece says 3 sentences and its slide 6 sentences.']);
    expect(lessonChecklist(course, lesson).look.find((i) => i.kind === 'termsApart')).toMatchObject({ lines: lines(course) });
    expect(JSON.stringify(course)).toBe(before);
  });

  it('is quiet once every material says one length', () => {
    const six = withPiece((text) => text.replace(/about three sentences/g, 'about six sentences'));
    const rubricId = piece.rubricId!;
    const rubric = six.rubrics[rubricId]!;
    const agreed: Course = { ...six, rubrics: { ...six.rubrics, [rubricId]: { ...rubric, criteria: rubric.criteria.map((c) => ({ ...c, descriptors: Object.fromEntries(Object.entries(c.descriptors).map(([k, v]) => [k, v.replace(/about three sentences/g, 'about six sentences')])) })) } } };
    expect(lines(agreed)).toEqual([]);
    expect(lessonChecklist(agreed, lesson).look.some((i) => i.kind === 'termsApart')).toBe(false);
  });

  it('names a time and a total the same way', () => {
    expect(lines(withPiece((text) => text.replace('for six minutes', 'for five minutes')))).toContain('“Short in-class writing”, time: the plan says 6 minutes and the piece 5 minutes.');
    expect(lines(withPiece((text) => text.replace('out of 12 points', 'out of 10 points')))).toContain('“Short in-class writing”, points: its rubric says 12 points and the piece 10 points.');
  });

  it('with one material only: slides and plan with no piece, a piece with no plan', () => {
    const noPiece: Course = { ...course, tasks: {}, rubrics: {} };
    const alone = { ...lesson, taskIds: [] };
    expect(lines(noPiece, alone)).toEqual([]);
    const slides = alone.slides.map((s) => ({ ...s, bullets: s.bullets.map((b) => b.replace('about six sentences', 'about four sentences')) }));
    expect(lines(noPiece, { ...alone, slides })).toEqual(['“Short in-class writing”, length: the plan says 6 sentences and its slide 4 sentences.']);
    expect(lines(course, { ...lesson, segments: [], slides: [] })).toEqual([]);
  });

  it('with a teacher\'s own piece: told, and the piece left as the teacher wrote it', () => {
    const own = withPiece((text) => text.replace(/about three sentences/g, 'about four sentences'), true);
    expect(lines(own)[0]).toBe('“Short in-class writing”, length: the plan says 6 sentences and the piece 4 sentences.');
    const before = JSON.stringify(own.tasks);
    const segments = lesson.segments.map((s) => ({ title: s.title, description: s.description, minutes: s.minutes }));
    expect(JSON.stringify(planOtherLength(segments, own, lesson)[0]!.flag)).toContain('the piece says 4 sentences and the plan 6 sentences: the piece is already written');
    expect(JSON.stringify(own.tasks)).toBe(before);
  });
});

describe('a part written after the others', () => {
  const segments = lesson.segments.map((s) => ({ title: s.title, description: s.description, minutes: s.minutes }));
  const deck = (words: string) => ({ slides: [{ title: 'Short in-class writing', bullets: [words], segment: lesson.segments.findIndex((s) => s.title.startsWith('Short in-class writing')) + 1 }] });

  it('the piece, after the plan: asked once more, with a note for the teacher if it stays', () => {
    const [problem] = otherLength(draft(piece.prompt, piece.steps), course, forPiece);
    expect(JSON.stringify(problem!.flag)).toContain('the plan says 6 sentences and the piece 3 sentences');
    expect(problem!.left!.code).toBe('reviewNote');
    expect(otherLength(draft('Work alone for six minutes. Write about six sentences.', ['Name the moment in one sentence.']), course, forPiece)).toEqual([]);
    expect(JSON.stringify(otherLength(draft('Work alone for nine minutes.'), course, forPiece)[0]!.flag)).toContain('6 minutes and the piece 9 minutes');
  });

  it('the piece, with no plan and not done in class: its rubric held to what it asks', () => {
    const home: Lesson = { ...forPiece, segments: [], homework: { ...writing, kind: 'assignment' } };
    expect(JSON.stringify(otherLength(draft('Write three sentences.', [], ['Six sentences earn full credit.']), course, home)[0]!.flag)).toContain('"path":"rubric"');
    // A lower level may describe less: only the top level is what full marks ask.
    expect(otherLength(draft('Write six sentences.', [], ['Six clear sentences.'], 'One or two sentences.'), course, home)).toEqual([]);
    expect(JSON.stringify(otherLength(draft('Scored out of 10 points.', [], ['Clear.', 'Focused.', 'Detailed.']), course, home)[0]!.flag)).toContain('12 points and the piece 10 points');
  });

  it('the plan, after the piece: asked to say the piece\'s length; quiet where it agrees or no piece is written', () => {
    expect(JSON.stringify(planOtherLength(segments, course, lesson)[0]!.flag)).toContain('the piece says 3 sentences and the plan 6 sentences');
    expect(planOtherLength(segments.map((s) => ({ ...s, description: s.description.replace('about six sentences', 'about three sentences') })), course, lesson)).toEqual([]);
    expect(planOtherLength(segments, { ...course, tasks: {} }, { ...lesson, taskIds: [] })).toEqual([]);
  });

  it('the slides, after the piece: held to the piece; with no piece, to the plan', () => {
    expect(JSON.stringify(slidesOther(deck('Write alone for six minutes, in about six sentences.'), course, lesson)[0]!.flag)).toContain('the piece says 3 sentences and the slide 6 sentences');
    expect(slidesOther(deck('Write alone for six minutes, in about three sentences.'), course, lesson)).toEqual([]);
    const noPiece: Course = { ...course, tasks: {}, rubrics: {} };
    expect(JSON.stringify(slidesOther(deck('Write about four sentences.'), noPiece, { ...lesson, taskIds: [] })[0]!.flag)).toContain('the plan says 6 sentences and the slide 4 sentences');
    // Two figures on the slide, neither the piece's: not asked for again, since it cannot be told which is the piece's.
    expect(slidesOther(deck('One sentence to open. Six sentences in all.'), course, lesson)).toEqual([]);
  });
});
