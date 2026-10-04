/** How long printing waits on pictures before going ahead without the ones still missing. */
const WAIT_MS = 20_000;

const pending = (root: HTMLElement) => root.querySelector('[data-media-pending]') !== null;

/** Resolves once nothing under `root` is still being read from this device. */
function settled(root: HTMLElement): Promise<void> {
  if (!pending(root)) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (pending(root)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root, { childList: true, subtree: true });
  });
}

function loaded(img: HTMLImageElement): Promise<void> {
  // Asked for now, wherever it sits on the page: a picture left to load on scroll would print as a blank.
  img.loading = 'eager';
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/**
 * Resolves when every picture under `root` has loaded or failed, so a printed page has its pictures. It never
 * rejects and never waits forever: after a while the page prints with what it has.
 */
export function picturesReady(root: HTMLElement | null): Promise<void> {
  if (!root) return Promise.resolve();
  const all = settled(root).then(() => Promise.all([...root.querySelectorAll('img')].map(loaded)));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, WAIT_MS));
  return Promise.race([all.then(() => undefined), timeout]);
}
