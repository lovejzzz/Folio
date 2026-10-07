import { rRunner } from '@folio/run/r';
import { describe, expect, it } from 'vitest';
import { STATEMENT, joined } from '../src/sheetCode';

// R itself, as the check-ups use it. It ships with the package; only library() calls need the network, and none is made here.
describe('R on the command line', () => {
  it('runs a line, says why one stops, and forgets names but not files in a new session', async () => {
    const r = await rRunner();
    expect(r).not.toBeNull();
    try {
      expect(await r!.run('x <- c(38, 41, 44, 46, 49, 54, 58, 63, 70)')).toBeNull();
      expect(await r!.run('stopifnot(round(sd(x), 2) == 10.65)')).toBeNull();
      expect(await r!.run('setwd("~/stats")')).toMatch(/cannot change working directory/);
      // The default bins of a histogram: the same as the ones a sheet then asked for "to compare".
      expect(await r!.run('stopifnot(identical(hist(c(2, 3, 4, 4, 5, 6, 7, 9, 12, 24), plot = FALSE)$breaks, seq(0, 25, 5)))')).toBeNull();
      expect(await r!.run('write.csv(mtcars, "cars.csv", row.names = FALSE)')).toBeNull();
      // Which code set in a sentence is a statement to run: R is asked, not a pattern.
      const statement = async (code: string) => (await r!.run(STATEMENT(code))) === null;
      expect(await Promise.all(['fit <- lm(mpg ~ wt, data = mtcars)', 'summary(mtcars$mpg)', 'mtcars |> head(3)', 'mean()', 'x', '2 + 2', 'mtcars$mpg', 'ggplot(mtcars, aes(x = mpg)) +', 'lm(mpg ~'].map(statement))).toEqual([true, true, true, false, false, false, false, false, false]);
      // A statement over several lines is run as one: alone, its first line "does not run".
      expect(await r!.run('summary(mtcars$mpg) +')).toMatch(/unexpected end of input|unexpected/);
      expect(joined(['fit <- lm(mpg ~ wt,', '  data = mtcars)', 'coef(fit)', 'mtcars |>', '  head(2)'])).toEqual(['fit <- lm(mpg ~ wt,\n  data = mtcars)', 'coef(fit)', 'mtcars |>\n  head(2)']);
      for (const step of joined(['fit <- lm(mpg ~ wt,', '  data = mtcars)', 'coef(fit)', 'mtcars |>', '  head(2)'])) expect(await r!.run(step)).toBeNull();
      await r!.fresh();
      expect(await r!.run('mean(x)')).toMatch(/object 'x' not found/);
      expect(await r!.run('stopifnot(ncol(read.csv("cars.csv")) == 11)')).toBeNull();
    } finally {
      r!.close();
    }
  }, 120_000);
});
