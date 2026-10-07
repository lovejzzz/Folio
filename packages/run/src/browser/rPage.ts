/**
 * The R runner page. It sits in a frame with no origin and no storage, as the Python runner does, with one
 * difference its policy spells out: R fetches its own files, so the page may connect to the one folder on
 * Folio's site that holds them, and to nothing else. It runs lines the host sends and says how each ended.
 */
import type { FromR, ToR } from './rProtocol';

interface R {
  init(): Promise<void>;
  evalRVoid(code: string): Promise<void>;
  installPackages(packages: string[], options: { quiet: boolean }): Promise<void>;
  Shelter: new () => Promise<{ captureR(code: string, options: Record<string, boolean>): Promise<unknown>; purge(): void }>;
}

const BASE = ['stats', 'graphics', 'grDevices', 'utils', 'datasets', 'methods', 'base'];
const FRESH = `rm(list = ls(all.names = TRUE), envir = globalenv()); for (p in setdiff(sub("^package:", "", grep("^package:", search(), value = TRUE)), c(${BASE.map((p) => `"${p}"`).join(', ')}))) try(detach(paste0("package:", p), character.only = TRUE), silent = TRUE); setwd("/work")`;
const say = (m: FromR): void => parent.postMessage(m, '*');
const first = (error: unknown): string => String((error as Error)?.message ?? error).split('\n')[0]!.slice(0, 300);

let r: R | null = null;
const had = new Set<string>();

async function boot(base: string): Promise<void> {
  // The address is checked by the page's policy, which names the one folder scripts and files may come from.
  const lib = (await import(/* @vite-ignore */ `${base}webr.js`)) as { WebR: new (options: object) => R; ChannelType: { PostMessage: unknown } };
  const made = new lib.WebR({ baseUrl: base, repoUrl: base.replace(/\/$/, ''), channelType: lib.ChannelType.PostMessage });
  await made.init();
  await made.evalRVoid('dir.create("/work", showWarnings = FALSE); setwd("/work"); options(width = 80)');
  r = made;
}

async function answer(m: Exclude<ToR, { t: 'boot' }>): Promise<string | null> {
  if (!r) return 'R has not started.';
  if (m.t === 'fresh') return r.evalRVoid(FRESH).then(() => null);
  if (m.t === 'need') {
    const missing = m.packages.filter((p) => /^[A-Za-z][\w.]{0,60}$/.test(p) && !had.has(p) && !BASE.includes(p));
    missing.forEach((p) => had.add(p));
    if (missing.length) await r.installPackages(missing, { quiet: true }).catch(() => undefined);
    return null;
  }
  const shelter = await new r.Shelter();
  try {
    await shelter.captureR(m.line, { withAutoprint: true, captureStreams: true, captureConditions: true });
    return null;
  } catch (error) {
    return first(error);
  } finally {
    shelter.purge();
  }
}

addEventListener('message', (event: MessageEvent<ToR>) => {
  if (event.source !== parent) return;
  const m = event.data;
  if (m?.t === 'boot') void boot(String(m.base)).then(() => say({ t: 'ready' }), (error) => say({ t: 'failed', message: first(error) }));
  else if (m && typeof m.id === 'number') void answer(m).then((error) => say({ t: 'done', id: m.id, error }), (error) => say({ t: 'done', id: m.id, error: first(error) }));
});
say({ t: 'hello' });
