import { describe, expect, it } from 'vitest';
import { CourseStore, cmd, newId, orderedLessons, type Handout } from '@folio/core';
import { installedBefore, neverInstalled, packagesLine } from '../src/rLedger';
import { lessonContext } from '../src';
import { smallCourse } from './fake';

const sheet = (title: string, lines: string[]): Handout => ({ id: newId('x'), title, kind: 'worksheet', usedIn: 'Lab', copies: 'One each', blocks: [{ type: 'list', ordered: false, items: lines.map((l) => `\`${l}\``) }], key: '', supports: false });

function lab(brief: string, first: string[]) {
  const store = new CourseStore({ ...smallCourse(), brief });
  const [one] = orderedLessons(store.getState());
  store.apply([cmd('section.fill', { lessonId: one!.id, kind: 'plan', flags: [], content: { segments: [{ id: newId('x'), session: 0, kind: 'practice' as const, title: 'Lab', minutes: 30, description: 'Run the sheet.', teacherNotes: '' }], keyIdeas: ['k'], vocabulary: [], handouts: [sheet('Start', first)] } })], { label: { key: 'b' }, source: 'ai' });
  return store.getState();
}

describe('the R packages a course has had students install', () => {
  it('are what the brief names and what earlier lessons installed, and are told to each lesson', () => {
    const course = lab('Statistics labs in R with RStudio and the tidyverse.', ['install.packages(c("palmerpenguins", "gapminder"))', 'library(palmerpenguins)']);
    const [one, two] = orderedLessons(course);
    expect(installedBefore(course, one!)).toEqual(expect.arrayContaining(['tidyverse', 'ggplot2', 'dplyr']));
    expect(installedBefore(course, one!)).not.toContain('palmerpenguins');
    expect(installedBefore(course, two!)).toEqual(expect.arrayContaining(['tidyverse', 'palmerpenguins', 'gapminder']));
    expect(lessonContext(course, two!)).toContain('Before this lesson students have installed these R packages:');
    expect(packagesLine(course, two!)).toContain('is installed in this lesson first');
    // A course that does not work in R is told nothing of it.
    expect(packagesLine(lab('A seminar on Hobbes.', []), two!)).toBe('');
  });

  it('says once to the teacher which package a sheet loads that nobody installed, and nothing of what comes with R', () => {
    const course = lab('Statistics labs in R with RStudio and the tidyverse.', ['install.packages("palmerpenguins")']);
    const two = orderedLessons(course)[1]!;
    const sheets = [sheet('Plots', ['library(ggplot2)', 'library(palmerpenguins)', 'library(survival)', 'library(gapminder)', 'dplyr::glimpse(NHANES::NHANES)']), sheet('More', ['library(gapminder)', 'install.packages("infer")', 'library(infer)'])];
    const flags = neverInstalled(course, two, sheets);
    expect(flags.map((f) => (f.code === 'reviewNote' ? [f.values.where, /package (\w+),/.exec(f.values.text)?.[1]] : []))).toEqual([['Plots', 'gapminder'], ['Plots', 'NHANES']]);
  });
});
