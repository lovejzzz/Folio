import { rRunner } from '@folio/run/r';
import { describe, expect, it } from 'vitest';

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
      await r!.fresh();
      expect(await r!.run('mean(x)')).toMatch(/object 'x' not found/);
      expect(await r!.run('stopifnot(ncol(read.csv("cars.csv")) == 11)')).toBeNull();
    } finally {
      r!.close();
    }
  }, 120_000);
});
