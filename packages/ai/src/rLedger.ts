import { orderedLessons, type Course, type Flag, type Handout, type Lesson } from '@folio/core';

/**
 * The R packages a course has had students install, lesson by lesson. Each lesson is written on its own, and loaded what it
 * liked: a first lab installed two packages, the second called `library(gapminder)` and the seventh three more that
 * no student had, and no check set a lesson's libraries against what the course had installed. The lines stop on every
 * laptop in the room.
 */

/** What comes with R itself: loaded without installing. */
const WITH_R = new Set(['base', 'stats', 'graphics', 'grDevices', 'utils', 'datasets', 'methods', 'tools', 'parallel', 'grid', 'splines', 'stats4', 'MASS', 'lattice', 'Matrix', 'nlme', 'survival', 'boot', 'cluster', 'class', 'nnet', 'rpart', 'spatial', 'mgcv', 'foreign', 'KernSmooth', 'codetools']);
/** Loading the tidyverse loads these; installing it installs them. */
const TIDYVERSE = ['ggplot2', 'dplyr', 'tidyr', 'readr', 'tibble', 'stringr', 'forcats', 'purrr', 'lubridate'];

const LOADED = /\b(?:library|require)\(\s*["']?([A-Za-z][\w.]*)|\b([A-Za-z][\w.]*):::?[A-Za-z_.]/g;
const INSTALLED = /install\.packages\(([^)]*\)?)\)?/g;

const loadedIn = (text: string) => [...new Set([...text.matchAll(LOADED)].map((m) => (m[1] ?? m[2])!))];
const installedIn = (text: string) => [...text.matchAll(INSTALLED)].flatMap((m) => [...m[1]!.matchAll(/\\?["']([A-Za-z][\w.]*)\\?["']/g)].map((q) => q[1]!));
const withTheirs = (names: string[]) => [...new Set(names.flatMap((n) => (n === 'tidyverse' ? [n, ...TIDYVERSE] : [n])))];

/** Everything a lesson gives students or tells the teacher to have them do. */
const textOf = (course: Course, lesson: Lesson, handouts: Handout[] = lesson.handouts) => JSON.stringify([lesson.segments, handouts, lesson.taskIds.map((id) => course.tasks[id])]);

/** The packages students have by the start of a lesson: those the brief or the setup names, and those earlier lessons installed. */
export function installedBefore(course: Course, lesson: Lesson): string[] {
  const given = `${course.brief}\n${(course.setup ?? []).join('\n')}`;
  const earlier = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id));
  const used = new Set(orderedLessons(course).flatMap((l) => loadedIn(textOf(course, l))));
  // A package the teacher's own words name is one their students have: "RStudio with the tidyverse".
  const named = [...used, 'tidyverse', ...TIDYVERSE].filter((p) => new RegExp(`(?<!\\w)${p.replace('.', '\\.')}(?!\\w)`).test(given));
  return withTheirs([...named, ...earlier.flatMap((l) => installedIn(textOf(course, l)))]);
}

/** Whether the course works in R at all: its brief says so, or a lesson written so far loads a package. */
const inR = (course: Course) => /\bRStudio\b|\btidyverse\b|\bggplot2?\b|\b(?:in|using|with|through) R\b|\bR (?:labs?|code|scripts?|programming|sessions?|and RStudio)\b/.test(course.brief);

/** Told to a lesson's writers: what students have, and that anything else is installed where it is first used. */
export function packagesLine(course: Course, lesson: Lesson): string {
  if (!inR(course)) return '';
  const have = installedBefore(course, lesson);
  return `${have.length ? `Before this lesson students have installed these R packages: ${have.join(', ')}.` : 'Students have installed no R packages before this lesson.'} What comes with R needs no installing. A package this lesson loads that is not among them is installed in this lesson first, by a line students run (\`install.packages("name")\`) where it is first used; no lesson loads a package students were never told to install.`;
}

/** The packages a lesson's sheets load that students have never installed, each said to the teacher once. */
export function neverInstalled(course: Course, lesson: Lesson, handouts: Handout[]): Flag[] {
  if (!inR(course)) return [];
  const have = new Set([...installedBefore(course, lesson), ...withTheirs(installedIn(textOf(course, lesson, handouts)))]);
  const seen = new Set<string>();
  return handouts.flatMap((h) =>
    loadedIn(JSON.stringify(h.blocks))
      .filter((p) => !WITH_R.has(p) && !have.has(p) && !seen.has(p) && Boolean(seen.add(p)))
      .map((p): Flag => ({ code: 'reviewNote', values: { where: h.title, text: `"${h.title}" loads the R package ${p}, which nothing in the course so far has students install: on their computers the line stops. Add a line that installs it (install.packages("${p}")) before it is loaded, or name it in the course's setup.` } })),
  );
}
