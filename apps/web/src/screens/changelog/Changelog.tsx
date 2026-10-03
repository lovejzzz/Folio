import { useEffect, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';

/**
 * What changed in each release, newest first. The entries and their pictures are served from public/changelog,
 * fetched when the page opens, so the app carries none of them.
 */

interface Section {
  heading: string;
  body?: string;
  bullets?: string[];
  image?: { src: string; alt: string; width: number; height: number };
  compare?: { before: string; after: string };
}

export interface Release {
  version: string;
  date: string;
  title: string;
  lede: string;
  sections: Section[];
}

type Loaded = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; releases: Release[] };

function useReleases(): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fetch('/changelog/changelog.json')
      .then((r) => (r.ok ? (r.json() as Promise<Release[]>) : Promise.reject(new Error(String(r.status)))))
      .then((releases) => live && setLoaded({ state: 'ready', releases }))
      .catch(() => live && setLoaded({ state: 'failed' }));
    return () => {
      live = false;
    };
  }, []);
  return loaded;
}

function Compare({ compare }: { compare: NonNullable<Section['compare']> }) {
  const t = useT();
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-control border border-rule bg-well p-4">
        <p className="font-ui text-12 font-medium uppercase tracking-wide text-critical">{t.changelog.before}</p>
        <p className="mt-2 font-reading text-16 leading-6 text-ink-2">{compare.before}</p>
      </div>
      <div className="rounded-control border border-rule bg-accent-tint p-4">
        <p className="font-ui text-12 font-medium uppercase tracking-wide text-accent">{t.changelog.after}</p>
        <p className="mt-2 font-reading text-16 leading-6 text-ink">{compare.after}</p>
      </div>
    </div>
  );
}

function ReleaseSection({ section }: { section: Section }) {
  return (
    <section className="mt-12">
      <h3 className="font-display text-28 text-ink">{section.heading}</h3>
      {section.body && <p className="mt-3 font-reading text-17 leading-7 text-ink-2">{section.body}</p>}
      {section.bullets && (
        <ul className="mt-4 space-y-2">
          {section.bullets.map((b) => (
            <li key={b} className="flex gap-3 font-reading text-16 leading-7 text-ink-2">
              <span aria-hidden className="mt-3 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {section.compare && <Compare compare={section.compare} />}
      {section.image && (
        <figure className="mt-6 overflow-hidden rounded-sheet border border-rule bg-well shadow-sheet">
          <img src={section.image.src} alt={section.image.alt} width={section.image.width} height={section.image.height} loading="lazy" className="block h-auto w-full" />
        </figure>
      )}
    </section>
  );
}

function ReleaseEntry({ release }: { release: Release }) {
  return (
    <article id={`v${release.version}`} className="mt-16 border-t border-rule pt-12">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-accent px-3 py-1 font-mono text-13 text-accent-ink">v{release.version}</span>
        <span className="font-ui text-13 text-ink-2">{release.date}</span>
      </div>
      <h2 className="mt-5 font-display text-36 leading-tight text-ink">{release.title}</h2>
      <p className="mt-4 font-reading text-18 leading-8 text-ink-2">{release.lede}</p>
      {release.sections.map((s) => (
        <ReleaseSection key={s.heading} section={s} />
      ))}
    </article>
  );
}

/** Folio's changelog: every release with what changed, in words and pictures. Linked from About. */
export function Changelog() {
  const t = useT();
  usePageTitle(t.changelog.title);
  const loaded = useReleases();
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-3xl px-5 pb-24 pt-8 md:pt-12">
        <p className="font-ui text-13 font-medium uppercase tracking-wide text-accent">{t.changelog.eyebrow}</p>
        <h1 className="mt-3 font-display text-48 leading-none text-ink">{t.changelog.title}</h1>
        <p className="mt-6 font-reading text-18 text-ink-2">{t.changelog.lede}</p>
        {loaded.state === 'loading' && <p className="mt-16 font-ui text-14 text-ink-2">{t.changelog.loading}</p>}
        {loaded.state === 'failed' && (
          <p role="alert" className="mt-16 rounded-control bg-critical-tint px-4 py-3 font-ui text-14 text-critical">
            {t.changelog.failed}
          </p>
        )}
        {loaded.state === 'ready' && loaded.releases.map((r) => <ReleaseEntry key={r.version} release={r} />)}
      </main>
    </div>
  );
}
