import { enabledKinds } from '@folio/core';
import { Button } from '@folio/ui';
import { useEffect, useRef, useState } from 'react';
import { googleRoute } from '../../app/router';
import { Message, linkClass } from '../../app/errors';
import { SimpleHeader } from '../../components/AppHeader';
import { usePageTitle } from '../../app/usePageTitle';
import { googleClientId } from '../../components/drawers/exportOptions';
import { useT, type Messages } from '../../i18n';
import { makeExport } from '../../lib/exporter';
import { exportErrorMessage } from '../../lib/exportErrors';
import { finishGoogleSignIn, startGoogleSignIn, uploadToGoogleDocs, type GoogleExportRequest } from '../../lib/google';

type Step = { kind: 'signingIn' | 'working' } | { kind: 'failed'; message: string; request: GoogleExportRequest | null };

const signIn = (request: GoogleExportRequest) => window.location.assign(startGoogleSignIn(googleClientId(), window.location.origin, request));

/** Make the course a Google Doc and become it. Returns without a document only by throwing. */
async function makeDoc(token: string, request: GoogleExportRequest): Promise<string> {
  const { loadSession } = await import('../../state/session');
  const store = await loadSession(request.courseId);
  if (!store) throw new Error('The course is not in this browser.');
  const course = store.getState();
  // Opened without a choice (a bookmark): the whole course, as Export's "Whole course" would give.
  const kinds = request.kinds.length ? request.kinds : enabledKinds(course);
  const file = await makeExport({ course, kinds, audience: request.audience, format: 'docx', ...(request.lessons ? { lessonIds: request.lessons } : {}) });
  return uploadToGoogleDocs(token, file.name, file.bytes);
}

type Failure = Extract<Step, { kind: 'failed' }>;

/**
 * On arrival: back from Google, make the document and become it; otherwise go to Google to sign in.
 * Resolves only when something went wrong. The token is taken out of the address at once.
 */
async function arrive(asked: GoogleExportRequest | null, t: Messages): Promise<Failure> {
  let reply: ReturnType<typeof finishGoogleSignIn>;
  try {
    reply = finishGoogleSignIn(window.location.hash);
  } catch (error) {
    return { kind: 'failed', message: exportErrorMessage(error, t), request: null };
  } finally {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  if (!reply) {
    if (!asked) return { kind: 'failed', message: t.export.failed, request: null };
    signIn(asked);
    return new Promise<never>(() => {});
  }
  const { request } = reply;
  if ('error' in reply) return { kind: 'failed', message: exportErrorMessage(reply.error, t), request };
  try {
    window.location.replace(await makeDoc(reply.token, request));
    return await new Promise<never>(() => {});
  } catch (error) {
    return { kind: 'failed', message: exportErrorMessage(error, t), request };
  }
}

function Failed({ step }: { step: Failure }) {
  const t = useT();
  const { request } = step;
  return (
    <Message
      title={t.export.google.failedTitle}
      body={step.message}
      action={
        request ? (
          <Button variant="primary" onPress={() => signIn(request)}>
            {t.export.google.tryAgain}
          </Button>
        ) : (
          <a href="/library" className={linkClass}>
            {t.export.google.backToFolio}
          </a>
        )
      }
    />
  );
}

/** The tab Export opens for Google Docs: it goes to Google to sign in, comes back, makes the document and turns into it. */
export function GoogleExportScreen() {
  const t = useT();
  const { course, kinds, audience, lessons } = googleRoute.useSearch();
  const [step, setStep] = useState<Step>(() => ({ kind: window.location.hash ? 'working' : 'signingIn' }));
  const begun = useRef(false);
  usePageTitle(t.export.formats.google);
  useEffect(() => {
    // Strict mode runs this twice; Google's reply can be read only once.
    if (begun.current) return;
    begun.current = true;
    const asked: GoogleExportRequest | null = course ? { courseId: course, kinds: kinds ?? [], audience: audience ?? 'student', ...(lessons ? { lessons } : {}) } : null;
    void arrive(asked, t).then(setStep);
    // Once, on arrival: what was asked is read from the address the tab opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (step.kind === 'failed') return <Failed step={step} />;
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-md px-5 pt-24 text-center">
        <p role="status" className="font-ui text-16 text-ink-2">
          {step.kind === 'signingIn' ? t.export.google.signingIn : t.export.google.working}
        </p>
      </main>
    </div>
  );
}
