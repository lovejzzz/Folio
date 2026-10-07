/**
 * R for the command line and the check-ups, as `node.ts` is Python's: the code a lesson gives students is run
 * before a reader ever sees it. Lines are run one at a time, as a student runs them, and what R says when one
 * stops is kept. It is not a sandbox: it is for code our own pipeline wrote.
 */
export interface LineRunner {
  /** A new session in the same working folder: names and attached packages are gone, files stay. */
  fresh(): Promise<void>;
  /** Run one line; the first line of R's message when it stops, else null. */
  run(line: string): Promise<string | null>;
  /** Make packages available before a `library()` call: a package that cannot be had is left for the line to fail on. */
  need(packages: string[]): Promise<void>;
  close(): void;
}

const BASE = ['stats', 'graphics', 'grDevices', 'utils', 'datasets', 'methods', 'base'];
const FRESH = `rm(list = ls(all.names = TRUE), envir = globalenv()); for (p in setdiff(sub("^package:", "", grep("^package:", search(), value = TRUE)), c(${BASE.map((p) => `"${p}"`).join(', ')}))) try(detach(paste0("package:", p), character.only = TRUE), silent = TRUE); setwd("/work")`;

/** Null where R cannot be had (the package is not installed, the interpreter does not start): the check is then skipped. */
/** The packages teachers' browsers can load: Folio's own copy. The check-ups use the same, so a package missing there is missing here. */
export const R_MIRROR = process.env.FOLIO_R_REPO ?? 'https://folio.university/api/runtime/webr-0.6.0';

export async function rRunner(lineMs = 60_000, repoUrl = R_MIRROR): Promise<LineRunner | null> {
  try {
    const { WebR } = await import('webr');
    const webR = new WebR({ interactive: false, repoUrl });
    await webR.init();
    await webR.evalRVoid('dir.create("/work", showWarnings = FALSE); setwd("/work"); options(width = 80)');
    const had = new Set<string>();
    return {
      fresh: () => webR.evalRVoid(FRESH),
      async need(packages) {
        const missing = packages.filter((p) => !had.has(p) && !BASE.includes(p));
        missing.forEach((p) => had.add(p));
        // One at a time: asked for together, a package the mirror does not hold took the ones it does hold down with it.
        for (const name of missing) await webR.installPackages([name], { quiet: true }).catch(() => undefined);
      },
      async run(line) {
        const shelter = await new webR.Shelter();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('The line ran too long and was stopped.')), lineMs)));
          await Promise.race([shelter.captureR(line, { withAutoprint: true, captureStreams: true, captureConditions: true }), late]);
          return null;
        } catch (error) {
          return String((error as Error).message ?? error).split('\n')[0]!.slice(0, 300);
        } finally {
          clearTimeout(timer);
          shelter.purge();
        }
      },
      close: () => webR.close(),
    };
  } catch {
    return null;
  }
}
