import { CourseStore, cmd, newId, orderedLessons, type Handout, type Task } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { codeUnits, lessonCodeFaults, sheetsRun, workRun, type LineRunner } from '../src';
import { fakeInference, smallCourse } from './fake';

/** An R that knows two things: a folder nobody has, and names that were never made. */
function fakeR(): LineRunner & { ran: string[]; sessions: number } {
  let names = new Set<string>();
  const files = new Set<string>();
  const r = {
    ran: [] as string[],
    sessions: 0,
    fresh: async () => void ((names = new Set()), (r.sessions += 1)),
    need: async () => undefined,
    run: async (line: string) => {
      r.ran.push(line);
      if (/^setwd\("~/.test(line)) return 'Error in `setwd("~/stats")`: cannot change working directory';
      const wrote = /write\.csv\(.*"([^"]+\.csv)"/.exec(line)?.[1];
      if (wrote) files.add(wrote);
      const read = /read\.csv\("([^"]+)"\)/.exec(line)?.[1];
      if (read && !files.has(read)) return `Error in \`file(file, "rt")\`: cannot open file '${read}'`;
      const made = /^\s*([\w.]+)\s*<-/.exec(line)?.[1];
      const used = /\(([a-z_]+)[$)]/.exec(line)?.[1];
      if (used && !made && !names.has(used) && used !== 'mtcars') return `Error: object '${used}' not found`;
      if (made) names.add(made);
      return null;
    },
  };
  return r;
}

const sheet = (title: string, lines: string[]): Handout => ({ id: newId('x'), title, kind: 'worksheet', usedIn: 'Lab', copies: 'One each', blocks: [{ type: 'para', text: 'Run each line.' }, { type: 'list', ordered: false, items: lines.map((l) => `\`${l}\``) }], key: '', supports: false });

function labCourse(second: string[]) {
  const store = new CourseStore(smallCourse());
  const [first, next] = orderedLessons(store.getState());
  const note = 'Before class run `write.csv(mtcars, "cars.csv")` and put the file in the lab folder. Mention `IQR()` when it comes up.';
  const plan = (lessonId: string, handouts: Handout[], teacherNotes = '') => cmd('section.fill', { lessonId, kind: 'plan', flags: [], content: { segments: [{ id: newId('x'), session: 0, kind: 'practice' as const, title: 'Lab', minutes: 30, description: 'Students run the sheet.', teacherNotes }], keyIdeas: ['k'], vocabulary: [], handouts } });
  store.apply([plan(first!.id, [sheet('Import', ['cars_df <- read.csv("cars.csv")', 'dim(cars_df)'])], note), plan(next!.id, [sheet('Summaries', second)])], { label: { key: 'b' }, source: 'ai' });
  return store.getState();
}

describe('the R a lesson gives students, run as they run it', () => {
  it('reads code from whole lines only, and runs the teacher’s preparation first', () => {
    const course = labCourse(['mean(cars_df$mpg)']);
    const units = codeUnits(course, orderedLessons(course)[0]!);
    // `IQR()` in a sentence of the notes is a mention, not a line to run.
    expect(units.map((u) => [u.kind, u.lines])).toEqual([['notes', ['write.csv(mtcars, "cars.csv")']], ['handout', ['cars_df <- read.csv("cars.csv")', 'dim(cars_df)']]]);
  });

  it('finds a sheet that uses a table nobody loaded and a folder nobody has, and none in one that loads its own', async () => {
    const stale = labCourse(['setwd("~/stats")', 'mean(cars_df$mpg)']);
    const faults = await lessonCodeFaults(fakeR(), stale, orderedLessons(stale)[1]!);
    expect(faults.map((f) => [f.title, f.line, f.error.slice(0, 22)])).toEqual([['Summaries', 'setwd("~/stats")', 'Error in `setwd("~/sta'], ['Summaries', 'mean(cars_df$mpg)', "Error: object 'cars_df"]]);
    // The file the first lesson's teacher made is there for the second: a sheet that reads it runs.
    const sound = labCourse(['cars_df <- read.csv("cars.csv")', 'mean(cars_df$mpg)', 'answer <- c(...)', 'mean(answer)']);
    const r = fakeR();
    expect(await lessonCodeFaults(r, sound, orderedLessons(sound)[1]!)).toEqual([]);
    // A line for the student to complete is not run, and what it would have made is not missed.
    expect(r.ran).not.toContain('answer <- c(...)');
  });

  it('corrects what stops and keeps the correction only when the sheet then runs', async () => {
    const course = labCourse(['setwd("~/stats")', 'cars_df <- read.csv("cars.csv")']);
    const lesson = orderedLessons(course)[1]!;
    const fixer = fakeInference(() => ({ changes: [{ find: '`setwd("~/stats")`', replace: '`getwd()`' }] }));
    const out = await sheetsRun(fixer, fakeR(), course, lesson, lesson.handouts);
    expect(JSON.stringify(out.handouts)).toContain('getwd()');
    expect(out.flags).toEqual([]);
    // A correction that changes nothing leaves the sheet as written, with R's own words for the teacher.
    const idle = await sheetsRun(fakeInference(() => ({ changes: [] })), fakeR(), course, lesson, lesson.handouts);
    expect(idle.handouts).toEqual(lesson.handouts);
    expect(idle.flags[0]).toMatchObject({ code: 'reviewNote', values: { where: 'Summaries' } });
    expect(JSON.stringify(idle.flags[0])).toContain('cannot change working directory');
    // A line the sheet gives as broken on purpose is left alone, and is no fault to report.
    const exercise = await sheetsRun(fakeInference(() => ({ changes: [{ find: '`setwd("~/stats")`', replace: '`getwd()`' }], meant: ['setwd("~/stats")'] })), fakeR(), course, lesson, lesson.handouts);
    expect([exercise.handouts, exercise.flags]).toEqual([lesson.handouts, []]);
    // No R, no check.
    expect(await sheetsRun(fixer, undefined, course, lesson, lesson.handouts)).toEqual({ handouts: lesson.handouts, flags: [] });
  });

  it('runs the work a lesson sets, and notes on the piece the line of its own that stops', async () => {
    const course = labCourse(['x <- 1']);
    const lesson = orderedLessons(course)[1]!;
    const work: Task = { id: newId('t'), lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'ai', edited: false, flags: [], kind: 'assignment', title: 'Lab report', prompt: 'p', steps: ['Run:\n`mean(scores)`'], rubricId: null, answerKey: '', toward: '' };
    const [noted] = await workRun(fakeInference(() => ({ changes: [] })), fakeR(), course, lesson, [work]);
    expect(JSON.stringify(noted!.flags)).toContain("object 'scores' not found");
  });
});
