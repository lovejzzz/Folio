import type { FromR, LineRunner, ToR } from './rProtocol';

export type { LineRunner } from './rProtocol';

/**
 * Folio's side of R. The runner page is put in a frame that may run scripts and nothing else; it is started
 * only when a lesson with R is written, and what it sends back is a stranger's: where each message came from is
 * checked, and so is what it holds.
 */

export interface RHostOptions {
  /** The R runner page's address, on this site. */
  runnerUrl: string;
  /** Where R's files are, as a full address ending in a slash: the runner page's policy allows this folder alone. */
  runtimeUrl: string;
}

const BOOT_MS = 240_000;
const LINE_MS = 90_000;

export function browserR(options: RHostOptions): LineRunner {
  let frame: HTMLIFrameElement | null = null;
  let ready: Promise<void> | null = null;
  let seq = 0;
  const waiting = new Map<number, (error: string | null) => void>();
  const close = (): void => {
    frame?.remove();
    frame = null;
    ready = null;
    for (const done of waiting.values()) done('R was closed.');
    waiting.clear();
  };
  const open = (): Promise<void> =>
    (ready ??= new Promise<void>((resolve, reject) => {
      const made = document.createElement('iframe');
      made.setAttribute('sandbox', 'allow-scripts');
      made.setAttribute('aria-hidden', 'true');
      made.hidden = true;
      made.src = options.runnerUrl;
      const late = setTimeout(() => (close(), reject(new Error('R did not start in time.'))), BOOT_MS);
      addEventListener('message', function heard(event: MessageEvent<FromR>) {
        if (!frame || event.source !== made.contentWindow) return;
        const m = event.data;
        if (m?.t === 'hello') {
          made.contentWindow?.postMessage({ t: 'boot', base: options.runtimeUrl } satisfies ToR, '*');
        } else if (m?.t === 'ready') {
          clearTimeout(late);
          resolve();
        } else if (m?.t === 'failed') {
          clearTimeout(late);
          removeEventListener('message', heard);
          close();
          reject(new Error(String(m.message).slice(0, 300)));
        } else if (m?.t === 'done' && typeof m.id === 'number') {
          waiting.get(m.id)?.(typeof m.error === 'string' ? m.error.slice(0, 300) : null);
          waiting.delete(m.id);
        }
      });
      frame = made;
      document.body.append(made);
    }));
  const ask = async (m: { t: 'fresh' } | { t: 'run'; line: string } | { t: 'need'; packages: string[] }, ms = LINE_MS): Promise<string | null> => {
    await open();
    return new Promise<string | null>((resolve) => {
      const id = ++seq;
      // A line that never ends takes R with it: the next one starts R again.
      const late = setTimeout(() => (waiting.delete(id), close(), resolve('The line ran too long and was stopped.')), ms);
      waiting.set(id, (error) => (clearTimeout(late), resolve(error)));
      frame?.contentWindow?.postMessage({ ...m, id } as ToR, '*');
    });
  };
  return {
    fresh: async () => void (await ask({ t: 'fresh' })),
    run: (line) => ask({ t: 'run', line }),
    need: async (packages) => void (await ask({ t: 'need', packages }, BOOT_MS)),
    close,
  };
}
