import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@folio/ui';
import { useT } from '../i18n';
import { SimpleHeader } from '../components/AppHeader';

function Message({ title, body, action }: { title: string; body?: string; action: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-md px-5 pt-24 text-center">
        <h1 className="font-display text-36 text-ink">{title}</h1>
        {body && <p className="mt-3 font-ui text-16 leading-relaxed text-ink-2">{body}</p>}
        <div className="mt-8 flex justify-center">{action}</div>
      </main>
    </div>
  );
}

export function CourseNotFound() {
  const t = useT();
  return (
    <Message
      title={t.errors.notFound}
      body={t.errors.notFoundHint}
      action={
        <Link to="/library" className="font-ui text-14 font-medium text-accent underline-offset-4 hover:underline">
          {t.nav.library}
        </Link>
      }
    />
  );
}

export function RouteError({ reset }: ErrorComponentProps) {
  const t = useT();
  return (
    <Message
      title={t.errors.generic}
      action={
        <Button variant="primary" onPress={reset}>
          {t.common.retry}
        </Button>
      }
    />
  );
}
