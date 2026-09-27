import { docLabels, project } from '@folio/core';
import { Button, cx } from '@folio/ui';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { printRoute } from '../../app/router';
import { DocView } from '../../components/DocView';
import { useT } from '../../i18n';
import { pinTheme } from '../../state/prefs';
import { useCourse } from '../../state/session';

/** The print view is the sheet, without chrome. "Save as PDF" from here gives the PDF. */
export function PrintScreen() {
  const t = useT();
  const course = useCourse();
  const { kinds, audience, lessons } = printRoute.useSearch();
  const l = docLabels(course.language);
  // This view stands for paper, so it is light on screen too.
  useEffect(() => {
    pinTheme('light');
    return () => pinTheme(null);
  }, []);
  useEffect(() => {
    document.title = `${course.title} · ${audience === 'teacher' ? l.teacherCopy : l.studentCopy}`;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setTimeout(() => window.print(), 300);
    });
    return () => {
      cancelled = true;
    };
  }, [course.title, audience, l]);
  return (
    <div className="bg-paper">
      <div className="no-print sticky top-0 flex items-center justify-between gap-4 border-b border-rule bg-desk px-5 py-3">
        <p className="font-ui text-13 text-ink-2">{t.export.printHint}</p>
        <Button variant="primary" onPress={() => window.print()}>
          <Printer size={16} strokeWidth={1.5} aria-hidden />
          {t.export.printNow}
        </Button>
      </div>
      <main id="main" className="mx-auto max-w-sheet px-6 py-12 print:max-w-none print:p-0" lang={course.language}>
        <header className="mb-12">
          <p className="font-ui text-12 text-ink-2">{audience === 'teacher' ? l.teacherCopy : l.studentCopy}</p>
          <h1 className="mt-2 font-display text-64 leading-none text-ink">{course.title}</h1>
        </header>
        {kinds.map((kind, i) => (
          <section key={kind} className={cx(i > 0 && 'print-break mt-16', kind === 'rubrics' && 'print-landscape')}>
            <DocView doc={project(course, kind, { audience, ...(lessons ? { lessonIds: lessons } : {}) })} />
          </section>
        ))}
      </main>
    </div>
  );
}
