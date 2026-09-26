import { courseFromOutline, generateOutline, type NewCourseRequest } from '@folio/ai';
import { MATERIAL_KINDS } from '@folio/core';
import { Button, Skeleton } from '@folio/ui';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { useDraft } from '../../state/draft';
import { currentInference, errorMessage } from '../../state/model';
import { createSession } from '../../state/session';

function OutlineSkeleton({ lessons }: { lessons: number }) {
  return (
    <ol className="mt-8 border-t border-rule" aria-hidden>
      {Array.from({ length: lessons }, (_, i) => (
        <li key={i} className="flex gap-4 border-t border-rule py-5 first:border-t-0">
          <span className="w-10 pt-1 text-center font-mono text-13 text-ink-3">{String(i + 1).padStart(2, '0')}</span>
          <div className="flex-1 space-y-3">
            <span className="block h-5 w-1/2 animate-shimmer rounded-full bg-well" />
            <Skeleton lines={2} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function requestFromDraft(): NewCourseRequest | null {
  const d = useDraft.getState();
  if (!d.brief.trim() && !d.files.length) return null;
  return {
    brief: d.brief || d.files.map((f) => f.title).join(', '),
    lessonCount: d.lessons,
    minutesPerLesson: 50,
    quizSize: 5,
    level: d.level,
    language: d.language,
    materials: d.materials.length ? d.materials : MATERIAL_KINDS,
    sources: d.files,
  };
}

/** Draft the outline once per attempt; StrictMode-safe, and harmless if the teacher leaves. */
function useOutline(attempt: number): string | null {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(-1);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const req = requestFromDraft();
    const inference = currentInference();
    if (started.current === attempt || !req || !inference) return;
    started.current = attempt;
    setError(null);
    generateOutline(inference, req)
      .then(async (outline) => {
        if (!mounted.current) return;
        const course = courseFromOutline(req, outline);
        await createSession(course);
        await navigate({ to: '/c/$courseId/plan', params: { courseId: course.id }, replace: true });
        useDraft.getState().reset();
      })
      .catch((e: unknown) => {
        if (mounted.current) setError(errorMessage(e));
      });
  }, [attempt, navigate]);
  return error;
}

function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div role="alert" className="mt-10">
      <h1 className="font-display text-36 text-ink">{t.plan.failed}</h1>
      <p className="mt-2 font-ui text-14 text-ink-2">{error}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onPress={onRetry}>
          {t.common.retry}
        </Button>
        <Button variant="quiet" onPress={() => void navigate({ to: '/' })}>
          {t.nav.back}
        </Button>
      </div>
    </div>
  );
}

/** The first model call: an outline only, drafted while the teacher watches. */
export function NewCourse() {
  const t = useT();
  const draft = useDraft();
  const [attempt, setAttempt] = useState(0);
  const error = useOutline(attempt);
  if (!draft.brief.trim() && !draft.files.length) return <Navigate to="/" />;
  if (!currentInference()) return <Navigate to="/" />;
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-24 pt-8 md:px-8 md:pt-12">
        <section className="rounded-sheet bg-paper px-5 py-8 shadow-sheet md:px-12 md:py-12" aria-busy={!error}>
          <p className="font-ui text-13 font-medium text-ink-2">{t.plan.title}</p>
          <blockquote lang={draft.language} className="mt-3 border-l-2 border-rule-strong pl-4 font-reading text-17 italic leading-7 text-ink-2">
            {draft.brief}
          </blockquote>
          {error ? (
            <Failed error={error} onRetry={() => setAttempt((a) => a + 1)} />
          ) : (
            <>
              <h1 className="mt-8 font-display text-36 text-ink" aria-live="polite">
                {t.plan.drafting}
              </h1>
              <p className="mt-1 font-ui text-14 text-ink-2">{t.plan.draftingNote}</p>
              <OutlineSkeleton lessons={draft.lessons} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
