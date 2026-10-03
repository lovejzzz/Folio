import { describe, expect, it } from 'vitest';
import { CourseStore, cmd, orderedLessons, staleItems } from '@folio/core';
import { generateSection, InferenceError, missingTargets, runBuild, runJob, sectionPrompt, courseBackground, type BuildTarget } from '../src';
import { fakeInference, planDraft, quizDraft, smallCourse } from './fake';
import { z } from 'zod';

describe('runJob', () => {
  const schema = z.object({ n: z.number() });
  it('returns valid output without a repair call', async () => {
    const inf = fakeInference(() => ({ n: 1 }));
    const r = await runJob(inf, { task: 't', system: '', prompt: 'p', schema });
    expect(r).toEqual({ value: { n: 1 }, problems: [], repaired: false });
    expect(inf.calls).toHaveLength(1);
  });

  it('makes exactly one repair call that quotes the problems', async () => {
    const inf = fakeInference((_req, call) => (call === 1 ? { n: 'one' } : { n: 1 }));
    const r = await runJob(inf, { task: 't', system: '', prompt: 'p', schema });
    expect(r.repaired).toBe(true);
    expect(inf.calls).toHaveLength(2);
    expect(inf.calls[1]!.prompt).toContain('It has these problems');
    expect(inf.calls[1]!.prompt).toContain('n:');
  });

  it('gives up after one repair and says so', async () => {
    const inf = fakeInference(() => ({ n: 'never' }));
    await expect(runJob(inf, { task: 't', system: '', prompt: 'p', schema })).rejects.toBeInstanceOf(InferenceError);
    expect(inf.calls).toHaveLength(2);
  });

  it('returns failing checks as problems instead of throwing', async () => {
    const inf = fakeInference(() => ({ n: 5 }));
    const r = await runJob(inf, { task: 't', system: '', prompt: 'p', schema, check: (v) => (v.n > 3 ? [{ index: null, flag: { code: 'note', values: { text: 'Too big' } } }] : []) });
    expect(r.problems).toEqual([{ index: null, flag: { code: 'note', values: { text: 'Too big' } } }]);
  });
});

describe('generateSection', () => {
  it('flags the one bad question and keeps the rest', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const bad = quizDraft(3, { 1: { answer: 'Water' } });
    const inf = fakeInference(() => bad);
    const result = await generateSection(inf, course, lesson.id, 'quiz');
    const store = new CourseStore(course);
    store.apply(result.commands, { label: { key: 'b' }, source: 'ai' });
    const questions = store.getState().lessons[lesson.id]!.taskIds.map((id) => store.getState().tasks[id]!);
    expect(questions.map((q) => q.flags)).toEqual([[], [{ code: 'answerNotInChoices' }], []]);
    expect(inf.calls[1]!.prompt).toContain('Item 2: The answer is not one of the choices.');
    expect(inf.calls).toHaveLength(2);
    const first = questions[0]!;
    // The right answer is kept, though its position is balanced across the quiz.
    expect(first.kind === 'question' && first.choices.find((c) => c.id === first.correct)?.text).toBe('Glucose');
    expect(first.objectiveIds).toEqual(lesson.objectiveIds);
  });

  it('includes the lesson plan when writing slides', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const store = new CourseStore(course);
    const planned = await generateSection(fakeInference(() => planDraft), course, lesson.id, 'plan');
    store.apply(planned.commands, { label: { key: 'b' }, source: 'ai' });
    const inf = fakeInference(() => ({ slides: [1, 2, 3].map((n) => ({ layout: 'bullets', title: `S${n}`, bullets: ['a'], notes: '' })) }));
    await generateSection(inf, store.getState(), lesson.id, 'slides');
    expect(inf.calls[0]!.prompt).toContain('Walk through 6CO2 + 6H2O.');
  });
});

describe('homework', () => {
  it('writes a step toward the final piece without a rubric, and nothing for a lesson with no homework', async () => {
    const store = new CourseStore(smallCourse());
    const [first, second] = orderedLessons(store.getState());
    store.apply([cmd('lesson.homework', { lessonId: first!.id, homework: { kind: 'step', toward: 'Final essay' } }), cmd('lesson.homework', { lessonId: second!.id, homework: { kind: 'none', toward: '' } })], { label: { key: 'b' }, source: 'teacher' });
    const targets = missingTargets(store.getState());
    expect(targets.filter((t) => t.kind === 'assignments').map((t) => t.lessonId)).toEqual([first!.id]);
    const inf = fakeInference(() => ({ title: 'Choose your question', prompt: 'Pick one of the three essay questions.', steps: ['1. Read them', 'Pick one'] }));
    const result = await generateSection(inf, store.getState(), first!.id, 'assignments');
    expect(inf.calls[0]!.prompt).toContain('ungraded step toward "Final essay"');
    store.apply(result.commands, { label: { key: 'b' }, source: 'ai' });
    const task = store.getState().tasks[store.getState().lessons[first!.id]!.taskIds.at(-1)!]!;
    expect(task.kind === 'assignment' && [task.rubricId, task.steps]).toEqual([null, ['Read them', 'Pick one']]);
  });
});

describe('a graded piece set in several lessons', () => {
  it('tells each lesson which part it writes, so titles differ and none claims the whole weight', () => {
    const store = new CourseStore(smallCourse());
    const lessons = orderedLessons(store.getState());
    store.apply(lessons.map((l) => cmd('lesson.homework', { lessonId: l.id, homework: { kind: 'assignment', toward: 'Portfolio' } })), { label: { key: 'b' }, source: 'teacher' });
    const course = store.getState();
    expect(sectionPrompt(course, course.lessons[lessons[1]!.id]!, 'assignments')).toContain(`this is part 2 of ${lessons.length}`);
    store.apply([cmd('lesson.homework', { lessonId: lessons[1]!.id, homework: { kind: 'assignment', toward: 'Lab report' } })], { label: { key: 'b' }, source: 'teacher' });
    expect(sectionPrompt(store.getState(), store.getState().lessons[lessons[1]!.id]!, 'assignments')).not.toContain('part ');
  });
});

describe('rubric levels in a plan', () => {
  it('are named only in a course that has a rubric to score with', () => {
    const store = new CourseStore(smallCourse());
    const lesson = () => orderedLessons(store.getState())[0]!;
    expect(courseBackground(store.getState())).toContain('"Excellent", "Good", "Developing" and "Beginning"');
    store.apply(orderedLessons(store.getState()).map((l) => cmd('lesson.homework', { lessonId: l.id, homework: { kind: 'none', toward: '' } })), { label: { key: 'b' }, source: 'teacher' });
    expect(courseBackground(store.getState())).not.toContain('score work as');
    expect(lesson().homework.kind).toBe('none');
  });
});

describe('a plan written again after its review', () => {
  it('is told what the review found in the version before', () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    expect(sectionPrompt(course, lesson, 'plan')).not.toContain('previous version');
    const flagged = { ...lesson, gen: { ...lesson.gen, plan: { basis: {}, at: '', edited: false, flags: [{ code: 'reviewNote' as const, values: { where: 'Segment 2', text: 'The sum is 12, not 14.' } }] } } };
    expect(sectionPrompt(course, flagged, 'plan')).toContain('- Segment 2: The sum is 12, not 14.');
  });
});

describe('parts of one graded piece', () => {
  it('are written in lesson order, each told what the part before asked', async () => {
    const store = new CourseStore(smallCourse());
    const lessons = orderedLessons(store.getState());
    store.apply(lessons.map((l) => cmd('lesson.homework', { lessonId: l.id, homework: { kind: 'assignment', toward: 'Weekly responses' } })), { label: { key: 'b' }, source: 'teacher' });
    const asked: string[] = [];
    const inf = fakeInference((req) => {
      if (req.task === 'folio_plan') return planDraft;
      asked.push(JSON.stringify(req));
      return { title: `Response ${asked.length}`, prompt: `Write 400 words, part ${asked.length}.`, steps: ['a', 'b'], rubric: { levels: [{ label: 'Good', points: 2 }, { label: 'OK', points: 1 }, { label: 'Weak', points: 0 }], criteria: [{ name: 'Ideas', descriptors: ['x', 'y', 'z'] }, { name: 'Writing', descriptors: ['x', 'y', 'z'] }] } };
    });
    const targets = missingTargets(store.getState()).filter((t) => t.kind === 'plan' || t.kind === 'assignments');
    await runBuild({ inference: inf, getCourse: store.getState, commit: (_t, c) => store.apply(c, { label: { key: 'b' }, source: 'ai', undoable: false }), signal: new AbortController().signal }, targets);
    expect(asked).toHaveLength(2);
    expect(asked[0]).not.toContain('The part before this one');
    expect(asked[1]).toContain('The part before this one, \\"Response 1\\", asked: Write 400 words, part 1.');
  });
});

describe('steps toward one larger piece', () => {
  it('are written in order, each told the steps already set', async () => {
    const store = new CourseStore(smallCourse());
    store.apply(orderedLessons(store.getState()).map((l) => cmd('lesson.homework', { lessonId: l.id, homework: { kind: 'step', toward: 'Final essay' } })), { label: { key: 'b' }, source: 'teacher' });
    const asked: string[] = [];
    const inf = fakeInference((req) => {
      if (req.task === 'folio_plan') return planDraft;
      asked.push(JSON.stringify(req));
      return { title: `Step ${asked.length}`, prompt: 'Do the next thing.', steps: ['a'] };
    });
    const targets = missingTargets(store.getState()).filter((t) => t.kind === 'plan' || t.kind === 'assignments');
    await runBuild({ inference: inf, getCourse: store.getState, commit: (_t, c) => store.apply(c, { label: { key: 'b' }, source: 'ai', undoable: false }), signal: new AbortController().signal }, targets);
    expect(asked[0]).not.toContain('already set these steps');
    expect(asked[1]).toContain('already set these steps toward it: \\"Step 1\\"');
  });
});

describe('homework changed mid-build', () => {
  it('writes no assignment for a lesson set to no homework after the build began', async () => {
    const store = new CourseStore(smallCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    const targets = missingTargets(store.getState()).filter((t) => t.lessonId === lesson.id && t.kind === 'assignments');
    store.apply([cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'none', toward: '' } })], { label: { key: 'b' }, source: 'teacher' });
    const inf = fakeInference(() => ({ title: 'x', prompt: 'y', steps: ['a', 'b'], rubric: { levels: [], criteria: [] } }));
    const summary = await runBuild({ inference: inf, getCourse: store.getState, commit: (_t, c) => store.apply(c, { label: { key: 'b' }, source: 'ai' }), signal: new AbortController().signal }, targets);
    expect(inf.calls).toHaveLength(0);
    expect(summary.built).toBe(0);
  });
});

describe('runBuild', () => {
  const answer = (req: { task: string }) => {
    switch (req.task) {
      case 'folio_plan':
        return planDraft;
      case 'folio_quiz':
        return quizDraft(3);
      case 'folio_slides':
        return { slides: [1, 2, 3].map((n) => ({ layout: 'bullets', title: `S${n}`, bullets: ['a'], notes: '' })) };
      case 'folio_study':
        return { overview: 'o', points: [{ heading: 'h', explanation: 'e' }, { heading: 'h2', explanation: 'e2' }] };
      case 'folio_assignments':
        return { title: 'Leaf lab', prompt: 'Test leaves', steps: ['a', 'b'], rubric: { levels: [{ label: 'Good', points: 2 }, { label: 'OK', points: 1 }, { label: 'Weak', points: 0 }], criteria: [{ name: 'Method', descriptors: ['x', 'y', 'z'] }, { name: 'Write-up', descriptors: ['x', 'y', 'z'] }] } };
      case 'folio_discussions':
        return { discussions: [{ prompt: 'Why green?', followUps: [] }] };
      default:
        return { entries: [{ question: 'Q?', answer: 'A.' }] };
    }
  };

  it('builds every missing section, plans before slides, and leaves nothing stale', async () => {
    const store = new CourseStore(smallCourse());
    const order: string[] = [];
    const targets = missingTargets(store.getState());
    expect(targets).toHaveLength(14);
    const summary = await runBuild(
      {
        inference: fakeInference(answer),
        getCourse: store.getState,
        commit: (t: BuildTarget, commands) => {
          order.push(`${orderedLessons(store.getState()).findIndex((l) => l.id === t.lessonId)}:${t.kind}`);
          store.apply(commands, { label: { key: 'b' }, source: 'ai', undoable: false });
        },
        signal: new AbortController().signal,
      },
      targets,
    );
    expect(summary).toMatchObject({ built: 14, failed: 0, stopped: false, fatal: null });
    expect(order.indexOf('0:plan')).toBeLessThan(order.indexOf('0:slides'));
    expect(missingTargets(store.getState())).toEqual([]);
    expect(staleItems(store.getState())).toEqual([]);
  });

  it('writes plans in lesson order, each knowing the plans before it', async () => {
    const store = new CourseStore(smallCourse());
    const inf = fakeInference(answer);
    const order: string[] = [];
    await runBuild(
      {
        inference: inf,
        getCourse: store.getState,
        commit: (t: BuildTarget, commands) => {
          if (t.kind === 'plan') order.push(t.lessonId);
          store.apply(commands, { label: { key: 'b' }, source: 'ai', undoable: false });
        },
        signal: new AbortController().signal,
      },
      missingTargets(store.getState()),
    );
    expect(order).toEqual(store.getState().lessonOrder);
    const plans = inf.calls.filter((c) => c.task === 'folio_plan').map((c) => JSON.stringify(c));
    expect(plans[0]).not.toContain('The lessons before this one');
    expect(plans[1]).toContain('The lessons before this one');
    expect(plans[1]).toContain('Terms: Chlorophyll');
    expect(plans[1]).toContain('(Notes: Balance it together.)');
  });

  it('stops everything on an auth error', async () => {
    const store = new CourseStore(smallCourse());
    const inf = fakeInference(() => {
      throw new InferenceError('auth', 'bad key');
    });
    const summary = await runBuild(
      { inference: inf, getCourse: store.getState, commit: () => {}, signal: new AbortController().signal },
      missingTargets(store.getState()),
    );
    expect(summary.fatal?.kind).toBe('auth');
    // Only the first batch (four at a time) is ever sent.
    expect(inf.calls.length).toBeLessThanOrEqual(4);
  });
});
