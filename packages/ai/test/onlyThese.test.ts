import { MATERIAL_KINDS, orderedLessons, parseCourse, type Course, type MaterialKind } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { homeworkLine, inClassPieces } from '../src/continuity';
import { onlyThese, sectionPrompt } from '../src/prompts';

/** A lesson Folio really wrote (statistics with R, the frozen batch), with only some of its materials chosen. */
const real = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/batch1-stats.json', import.meta.url), 'utf8')) as unknown);
const lesson = orderedLessons(real)[0]!;
const chosen = (kinds: MaterialKind[]): Course => ({ ...real, materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'] });

describe('what a writer is told exists', () => {
  it('is nothing more than usual when everything is chosen', () => {
    expect(onlyThese(chosen([...MATERIAL_KINDS]))).toBe('');
    expect(sectionPrompt(chosen([...MATERIAL_KINDS]), lesson, 'slides')).not.toContain('Not written, and not to be had');
  });

  it('names what is written and what is not, to every writer: slides alone', () => {
    const said = onlyThese(chosen(['slides']));
    expect(said).toContain('only these written for this course: a slide deck.');
    for (const absent of ['a lesson plan (with its handouts and worksheets)', 'a practice quiz', 'a study guide', 'graded work written out']) expect(said).toContain(absent);
    for (const kind of ['slides', 'quiz', 'study', 'faq', 'discussions', 'assignments'] as const) expect(sectionPrompt(chosen(['slides']), lesson, kind)).toContain(said);
  });

  it('tells the plan\'s writer too, who took slides and a guide for granted: a plan with slides and no quiz or guide', () => {
    const said = sectionPrompt(chosen(['plan', 'slides']), lesson, 'plan');
    expect(said).toContain('only these written for this course: a lesson plan (with its handouts and worksheets); a slide deck.');
    expect(said).toMatch(/Not written, and not to be had by anyone: [^.]*a practice quiz[^.]*a study guide/);
  });

  it('counts graded work as written where rubrics are chosen, since it is', () => {
    expect(onlyThese(chosen(['rubrics']))).toContain('only these written for this course: graded work written out (assignments, test papers); rubrics.');
  });

  it('gives a plan written before and since set aside as background only: its facts, never itself or its sheets', () => {
    const quiz = sectionPrompt(chosen(['quiz', 'study']), lesson, 'study');
    expect(quiz).toContain('the teacher has since taken the lesson plan out of what they use');
    // The plan's own account is there, so the guide agrees with what was taught…
    expect(quiz).toContain('Text columns show length, the number of unique values');
    // …and its sheets are not given as something students hold.
    expect(quiz).not.toContain('The sheets students are handed in this lesson');
    expect(sectionPrompt(chosen(['plan', 'study']), lesson, 'study')).toContain('The sheets students are handed in this lesson');
  });

  it('leaves a graded piece to the teacher where no graded work is written: named, its brief and rubric never described (as slides written alone did)', () => {
    const said = onlyThese(chosen(['slides']));
    expect(said).toContain('The graded pieces of this course are the teacher\'s own to write out');
    expect(said).toContain('nothing is said of what its brief, paper, answer key or rubric holds');
    expect(onlyThese(chosen(['slides', 'assignments']))).not.toContain('the teacher\'s own to write out');
    expect(onlyThese(chosen(['slides', 'rubrics']))).not.toContain('the teacher\'s own to write out');
  });

  it('does not tell a plan that a piece\'s brief is written and given out with its rubric when no graded work is written (as a plan written alone was told)', () => {
    const alone = chosen(['plan']);
    const line = homeworkLine(alone, lesson);
    expect(line).toContain('graded work that the teacher writes out themselves');
    expect(line).toContain('"Weekly lab worksheets"');
    expect(line).not.toMatch(/its brief is written|given out|with its rubric/);
    expect(inClassPieces(alone)).toBe('');
    // With graded work written, the plan is told as before.
    expect(homeworkLine(chosen(['plan', 'assignments']), lesson)).not.toContain('writes out themselves');
    expect(homeworkLine(chosen(['plan', 'rubrics']), lesson)).not.toContain('writes out themselves');
  });
});

