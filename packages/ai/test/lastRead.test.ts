import { describe, expect, it } from 'vitest';
import { CourseStore, cmd, newId, orderedLessons, type Course } from '@folio/core';
import { lessonContext, missingTargets, runBuild, sectionPrompt } from '../src';
import { applyLastRead, lastReadPrompt } from '../src/lastRead';
import { fakeInference, planDraft, quizDraft, smallCourse } from './fake';

/** A lesson with a plan, two slides and a quiz, written. */
function written(): Course {
  const store = new CourseStore(smallCourse());
  const lesson = orderedLessons(store.getState())[0]!;
  const segments = planDraft.segments.map((s) => ({ ...s, id: newId('x'), session: 1, kind: s.kind as 'teach' }));
  const slides = [
    { id: newId('x'), layout: 'bullets' as const, title: 'Homework', bullets: ['Problem set due at the start of next class'], notes: 'Answer for the teacher only: glucose.' },
    { id: newId('x'), layout: 'question' as const, title: 'Poll', bullets: ['Which gas do leaves take in? Answer on your clicker.'], notes: '' },
  ];
  store.apply(
    [
      cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: [], content: { segments, keyIdeas: ['Light drives it'], vocabulary: [] } }),
      cmd('section.fill', { lessonId: lesson.id, kind: 'slides', flags: [], content: { slides } }),
      cmd('section.fill', { lessonId: lesson.id, kind: 'study', flags: [], content: { overview: 'The mean of the three masses is 5.2 g.', points: [] } }),
    ],
    { label: { key: 't' }, source: 'ai' },
  );
  return store.getState();
}

describe('what is settled where it is written, before any reading', () => {
  it('shows the sheets already written to the writers that must agree with them, and only names them to the rest', () => {
    const course = written();
    const lesson = orderedLessons(course)[0]!;
    const sheet = { id: newId('x'), title: 'Four claims', kind: 'worksheet' as const, usedIn: 'Leaf in the dark', copies: 'One per student', blocks: [{ type: 'list' as const, ordered: false, items: ['Plants eat soil.'] }], key: 'False.', supports: false };
    const withSheet: Course = { ...course, lessons: { ...course.lessons, [lesson.id]: { ...lesson, handouts: [sheet] } } };
    const held = withSheet.lessons[lesson.id]!;
    expect(sectionPrompt(withSheet, held, 'slides')).toMatch(/sheets students are handed in this lesson, already written[\s\S]*"Four claims" \(worksheet, used in "Leaf in the dark"\):\n- Plants eat soil\./);
    expect(sectionPrompt(withSheet, held, 'quiz')).toMatch(/already written:\n"Four claims" \(worksheet, used in "Leaf in the dark"\)\n/);
    expect(sectionPrompt(withSheet, held, 'quiz')).not.toMatch(/Plants eat soil/);
    expect(sectionPrompt(withSheet, held, 'slides')).not.toMatch(/False\./);
  });

  it('tells the first meeting, and only the first, that nothing could be prepared for it', () => {
    const course = written();
    const [first, second] = orderedLessons(course);
    expect(lessonContext(course, first!)).toMatch(/This is the first meeting: nobody could be told anything before it/);
    expect(lessonContext(course, second!)).not.toMatch(/first meeting/);
  });
});

describe('the last read of a whole lesson', () => {
  it('shows the reader what students see apart from what only the teacher sees, tagged by material', () => {
    const course = written();
    const prompt = lastReadPrompt(course, orderedLessons(course)[0]!);
    const [students, teacher] = prompt.split('<teacher_only>');
    expect(students).toMatch(/<slides>\nSlide 1: Homework\n- Problem set due at the start of next class/);
    expect(students).not.toMatch(/Answer for the teacher only/);
    expect(teacher).toMatch(/<plan>[\s\S]*Leaf in the dark \(warmup, 10 min\)[\s\S]*Speaker notes, slide 1: Answer for the teacher only/);
  });

  it('makes a change of words that stands once, and leaves the rest as a note on its material', () => {
    const course = written();
    const lesson = orderedLessons(course)[0]!;
    const read = applyLastRead(course, lesson, [
      { kind: 'false', in: 'study', why: 'The mean is 4.9 g.', find: 'is 5.2 g', replace: 'is 4.9 g' },
      { kind: 'missing', in: 'slides', why: 'The poll has no choices.', find: 'Answer on your clicker.', replace: 'A. Oxygen B. Carbon dioxide C. Nitrogen. Answer on your clicker.' },
      { kind: 'missing', in: 'slides', why: 'Draw a leaf cross-section with the stomata labelled before class.', find: '', replace: '' },
      // Copied with the dash the view puts before a bullet: found without it.
      { kind: 'disagree', in: 'slides', why: 'The set is due a class later.', find: '- Problem set due at the start of next class', replace: '- Problem set due at the start of the class on The Calvin cycle' },
      // Copied with the labels of the view, and over two lines: each line is found without them.
      { kind: 'impossible', in: 'plan', why: 'Two questions do not take twenty minutes.', find: "3. Exit ticket (check, 20 min): Two questions.\n   Teacher's notes: Balance it together.", replace: "3. Exit ticket (check, 20 min): Two questions, then pairs compare.\n   Teacher's notes: Balance it together, on the board." },
      { kind: 'disagree', in: 'plan', why: 'Words that are not there.', find: 'no such words', replace: 'x' },
      // A material the lesson does not have is passed over.
      { kind: 'false', in: 'quiz', why: 'Nothing to change.', find: 'a', replace: 'b' },
    ]);
    expect(read).toMatchObject({ fixed: 4, noted: 2 });
    const store = new CourseStore(course);
    store.apply(read.commands, { label: { key: 'b' }, source: 'ai' });
    const after = store.getState().lessons[lesson.id]!;
    expect(after.study.overview).toBe('The mean of the three masses is 4.9 g.');
    expect(after.slides[1]!.bullets[0]).toMatch(/C\. Nitrogen\. Answer on your clicker\.$/);
    expect(after.slides[0]!.id).toBe(lesson.slides[0]!.id);
    expect(after.slides[0]!.bullets).toEqual(['Problem set due at the start of the class on The Calvin cycle']);
    expect(after.gen.slides!.flags).toEqual([{ code: 'reviewNote', values: { where: 'The slides', text: 'Draw a leaf cross-section with the stomata labelled before class.' } }]);
    expect(after.gen.plan!.flags).toHaveLength(1);
    expect(after.segments[2]!.description).toBe('Two questions, then pairs compare.');
    expect(after.segments[1]!.teacherNotes).toBe('Balance it together, on the board.');
  });

  it('changes nothing in a material the teacher has edited: the finding is a note', () => {
    const store = new CourseStore(written());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('study.update', { lessonId: lesson.id, overview: 'The mean of the three masses is 5.2 g.' })], { label: { key: 't' }, source: 'teacher' });
    const read = applyLastRead(store.getState(), store.getState().lessons[lesson.id]!, [{ kind: 'false', in: 'study', why: 'The mean is 4.9 g.', find: 'is 5.2 g', replace: 'is 4.9 g' }]);
    expect(read).toMatchObject({ fixed: 0, noted: 1 });
  });

  it('is asked for once for each lesson a build writes whole, when the build asks for it', async () => {
    const store = new CourseStore(smallCourse());
    const reads: string[] = [];
    const inference = fakeInference((req) => (req.task === 'folio_plan' ? planDraft : req.task === 'folio_quiz' ? quizDraft(3) : {}));
    const reviewer = fakeInference((req) => {
      if (req.task !== 'folio_last_read') return { issues: [] };
      reads.push(req.prompt);
      return { findings: [{ kind: 'misplaced', in: 'plan', why: 'A note.', find: 'Compare two leaves.', replace: 'Compare a leaf kept in the dark with one kept in light.' }] };
    });
    const targets = missingTargets(store.getState()).filter((t) => t.kind === 'plan' || t.kind === 'quiz');
    const only = { ...store.getState(), materials: Object.fromEntries(Object.entries(store.getState().materials).map(([k, v]) => [k, { ...v, enabled: k === 'plan' || k === 'quiz' }])) } as Course;
    const built = new CourseStore(only);
    const summary = await runBuild({ inference, reviewer, wholeRead: true, getCourse: built.getState, commit: (_t, c) => built.apply(c, { label: { key: 'b' }, source: 'ai', undoable: false }), signal: new AbortController().signal }, targets);
    expect(summary.failed).toBe(0);
    expect(reads).toHaveLength(2);
    // The last lesson too, and a course of one lesson: its read starts after its last part is in.
    const one = new CourseStore({ ...only, lessonOrder: only.lessonOrder.slice(0, 1) });
    await runBuild({ inference, reviewer, wholeRead: true, getCourse: one.getState, commit: (_t, c) => one.apply(c, { label: { key: 'b' }, source: 'ai', undoable: false }), signal: new AbortController().signal }, missingTargets(one.getState()));
    expect(reads).toHaveLength(3);
    expect(reads[0]).toMatch(/<quiz>/);
    expect(orderedLessons(built.getState()).map((l) => l.segments[0]!.description)).toEqual(Array(2).fill('Compare a leaf kept in the dark with one kept in light.'));
  });
});
