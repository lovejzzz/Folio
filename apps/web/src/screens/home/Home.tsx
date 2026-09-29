import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { setBrief, useDraft } from '../../state/draft';
import { BriefComposer } from './BriefComposer';
import { examplesForThisVisit } from './examples';

/** Below the fold and read from IndexedDB, so it loads after the first paint. */
const RecentCourses = lazy(() => import('./RecentCourses').then((m) => ({ default: m.RecentCourses })));

function Examples() {
  const t = useT();
  const navigate = useNavigate();
  const set = useDraft((s) => s.set);
  const [examples] = useState(() => examplesForThisVisit(t.home.examples));
  return (
    <div className="mt-12 flex flex-col items-center gap-3 text-center font-ui text-14 text-ink-2">
      <ul className="flex flex-wrap items-center justify-center gap-2" aria-label={t.home.tryLabel}>
        {examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => {
                set({ pinned: { level: false, lessons: false } });
                setBrief(example);
                document.getElementById('brief')?.focus();
              }}
              className="min-h-8 rounded-full border border-rule px-3.5 py-1 font-ui text-13 leading-5 text-ink-2 outline-none transition-colors duration-120 hover:border-field hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void import('../../lib/sample').then((m) => m.openSample(navigate))}
        className="rounded-control px-1 text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t.home.sample}
      </button>
    </div>
  );
}

export function Home() {
  const t = useT();
  usePageTitle();
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:pt-20">
        <h1 className="mb-8 text-center font-display text-48 leading-none tracking-tight text-ink md:mb-10 md:text-64">
          {t.home.question}
        </h1>
        <BriefComposer />
        <Examples />
        <Suspense fallback={null}>
          <RecentCourses />
        </Suspense>
      </main>
      <footer className="no-print flex flex-col items-center gap-3 pb-10 text-center">
        <p className="font-display text-18 italic text-ink-2">{t.tagline}</p>
        <Link to="/privacy" className="rounded-control px-1 font-ui text-13 text-ink-2 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          {t.privacy.link}
        </Link>
      </footer>
    </div>
  );
}
