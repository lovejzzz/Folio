import { briefWithAnswers, clarifyCourse, courseFromOutline, generateOutline, lessonsToPlan, minutesToPlan, type Clarification, type ClarifyDraft, type NewCourseRequest, type Usage } from '@folio/ai';
import { guessLessons, guessMinutes, guessQuizSize, guessSessions } from '../../lib/brief';
import { MATERIAL_KINDS } from '@folio/core';
import { Button, Skeleton } from '@folio/ui';
import { FileText } from 'lucide-react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { ownSyllabus, useDraft } from '../../state/draft';
import { currentInference, errorMessage } from '../../state/model';
import { createSession } from '../../state/session';
import { recordUsage } from '../../state/spend';
import { clarifyText } from './clarifyText';
import { Questions } from './Questions';

function OutlineSkeleton({ lessons }: { lessons: number }) {
  return (
    <ol className="mt-8 border-t border-rule" aria-hidden>
      {Array.from({ length: lessons }, (_, i) => (
        <li key={i} className="flex gap-4 border-t border-rule py-5 first:border-t-0">
          <span className="w-10 pt-1 text-center font-mono text-13 text-ink-2">{String(i + 1).padStart(2, '0')}</span>
          <div className="flex-1 space-y-3">
            <span className="block h-5 w-1/2 animate-shimmer rounded-full bg-well" />
            <Skeleton lines={2} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * What the teacher gave. The lessons are null unless the teacher set them or the brief says, and the minutes 0
 * unless the brief says: the syllabus, the teacher's answers or a default fill them in.
 */
function requestFromDraft(): NewCourseRequest | null {
  const d = useDraft.getState();
  if (!d.brief.trim() && !d.files.length) return null;
  const stated = !d.lessonsFromFiles && (d.pinned.lessons || guessLessons(d.brief) !== null);
  return {
    brief: d.brief || d.files.map((f) => f.title).join(', '),
    lessonCount: stated ? d.lessons : null,
    minutesPerLesson: guessMinutes(d.brief) ?? 0,
    sessions: guessSessions(d.brief) ?? undefined,
    quizSize: guessQuizSize(d.brief) ?? 5,
    level: d.level,
    language: d.language,
    locale: typeof navigator === 'undefined' ? '' : navigator.language,
    materials: d.materials.length ? d.materials : MATERIAL_KINDS,
    ...(d.delivery !== 'inperson' ? { delivery: d.delivery } : {}),
    sources: d.files,
  };
}

/** The request, with what Folio read from the brief and files and what the teacher answered. */
function withAnswers(req: NewCourseRequest, read: ClarifyDraft | null, answers: Clarification[]): NewCourseRequest {
  return {
    ...req,
    brief: briefWithAnswers(req.brief, answers),
    lessonCount: lessonsToPlan({ ...req, defaultLessons: useDraft.getState().lessons }, read, answers),
    minutesPerLesson: minutesToPlan(req.minutesPerLesson, read, answers),
    level: req.level || read?.level || '',
    syllabus: ownSyllabus(read, req.sources),
  };
}

type Phase = { kind: 'reading' } | { kind: 'asking'; read: ClarifyDraft } | { kind: 'drafting'; req: NewCourseRequest };

/** Read the brief and files first; ask if anything is unclear. If reading fails, plan from what was given. */
function useClarify(usages: Usage[]): [Phase, (p: Phase) => void] {
  const [phase, setPhase] = useState<Phase>({ kind: 'reading' });
  const started = useRef(false);
  useEffect(() => {
    const req = requestFromDraft();
    const inference = currentInference((u) => usages.push(u));
    if (started.current || !req || !inference) return;
    started.current = true;
    const defaultLessons = useDraft.getState().lessons;
    clarifyCourse(inference, { brief: req.brief, sources: req.sources, language: req.language, locale: req.locale, level: req.level, lessonCount: req.lessonCount, defaultLessons, sessions: req.sessions, delivery: req.delivery })
      .then((read) => setPhase(read.questions.length ? { kind: 'asking', read } : { kind: 'drafting', req: withAnswers(req, read, []) }))
      .catch(() => setPhase({ kind: 'drafting', req: withAnswers(req, null, []) }));
  }, [usages]);
  return [phase, setPhase];
}

/** Draft the outline once per attempt; StrictMode-safe, and harmless if the teacher leaves. */
function useOutline(req: NewCourseRequest | null, attempt: number, usages: Usage[]): string | null {
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
    const inference = currentInference((u) => usages.push(u));
    if (started.current === attempt || !req || !inference) return;
    started.current = attempt;
    setError(null);
    generateOutline(inference, req)
      .then(async (outline) => {
        if (!mounted.current) return;
        const course = courseFromOutline(req, outline);
        // Counted in with the course when it is written.
        recordUsage(course.id, usages);
        const store = await createSession(course);
        // Loaded only when there is a syllabus to check: shared with the syllabus page, it would otherwise be bundled with the first page.
        if (course.syllabus) void import('../../state/syllabusCheck').then((m) => m.checkOwnSyllabus(store));
        await navigate({ to: '/c/$courseId/plan', params: { courseId: course.id }, replace: true });
        useDraft.getState().reset();
      })
      .catch((e: unknown) => {
        if (mounted.current) setError(errorMessage(e));
      });
  }, [req, attempt, navigate, usages]);
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

/** What the teacher gave: their words, and the files they dropped in. */
function Given() {
  const { brief, files, language } = useDraft();
  return (
    <div className="mt-3 space-y-3">
      {brief.trim() && (
        <blockquote lang={language} className="line-clamp-4 border-l-2 border-rule-strong pl-4 font-reading text-17 italic leading-7 text-ink-2">
          {brief}
        </blockquote>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.title}-${i}`} className="flex h-7 items-center gap-1.5 rounded-full bg-well px-2.5 font-ui text-13 text-ink">
              <FileText size={14} strokeWidth={1.5} className="text-ink-2" aria-hidden />
              <span className="max-w-64 truncate">{f.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Waiting({ title, note, lessons }: { title: string; note: string; lessons: number }) {
  return (
    <>
      <h1 className="mt-8 font-display text-36 text-ink" aria-live="polite">
        {title}
      </h1>
      <p className="mt-1 font-ui text-14 text-ink-2">{note}</p>
      <OutlineSkeleton lessons={lessons} />
    </>
  );
}

/** Folio reads the brief and files, asks about anything unclear, then drafts the outline while the teacher watches. */
export function NewCourse() {
  const t = useT();
  const draft = useDraft();
  const [usages] = useState<Usage[]>(() => []);
  const [phase, setPhase] = useClarify(usages);
  const [attempt, setAttempt] = useState(0);
  const error = useOutline(phase.kind === 'drafting' ? phase.req : null, attempt, usages);
  usePageTitle(t.library.newCourse);
  if (!draft.brief.trim() && !draft.files.length) return <Navigate to="/" />;
  if (!currentInference()) return <Navigate to="/" />;
  const answer = (read: ClarifyDraft, answers: Clarification[]) => {
    const req = requestFromDraft();
    if (req) setPhase({ kind: 'drafting', req: withAnswers(req, read, answers) });
  };
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-24 pt-8 md:px-8 md:pt-12">
        <section className="rounded-sheet bg-paper px-5 py-8 shadow-sheet md:px-12 md:py-12" aria-busy={phase.kind !== 'asking' && !error}>
          <p className="font-ui text-13 font-medium text-ink-2">{t.plan.title}</p>
          <Given />
          {error ? (
            <Failed error={error} onRetry={() => setAttempt((a) => a + 1)} />
          ) : phase.kind === 'reading' ? (
            <Waiting title={clarifyText.reading} note={clarifyText.readingNote} lessons={draft.lessonsFromFiles ? 4 : draft.lessons} />
          ) : phase.kind === 'asking' ? (
            <Questions questions={phase.read.questions} onDone={(answers) => answer(phase.read, answers)} />
          ) : (
            <Waiting title={t.plan.drafting} note={clarifyText.draftingNote(phase.req.lessonCount)} lessons={Math.min(phase.req.lessonCount ?? 6, 8)} />
          )}
        </section>
      </main>
    </div>
  );
}
