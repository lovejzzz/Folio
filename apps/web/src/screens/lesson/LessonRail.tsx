import { orderedLessons } from '@folio/core';
import { IconButton, StatusMark, cx } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { useCourse } from '../../state/session';
import { cellState, enabledKinds } from '@folio/core';

/** Lesson navigation: 208 px, collapsible to numbers. */
export function LessonRail({ currentId }: { currentId: string }) {
  const t = useT();
  const course = useCourse();
  const { railCollapsed, set } = usePrefs();
  const kinds = enabledKinds(course);
  return (
    // From a wide screen only: beside a document on a tablet held upright it left the page 368px, and a rubric's table pushed the
    // whole screen sideways. Below that the lessons are reached from the overview and the bar, as on a phone.
    <nav aria-label={t.lesson.rail} className={cx('no-print sticky top-14 hidden h-below-header shrink-0 overflow-y-auto border-r border-rule py-4 lg:block', railCollapsed ? 'w-14 px-2' : 'w-52 px-3')}>
      <div className={cx('mb-2 flex items-center', railCollapsed ? 'justify-center' : 'justify-between pl-2')}>
        {!railCollapsed && <span className="font-ui text-12 font-medium text-ink-2">{t.lesson.rail}</span>}
        <IconButton size="sm" label={railCollapsed ? t.lesson.expandRail : t.lesson.collapseRail} onPress={() => set({ railCollapsed: !railCollapsed })}>
          {railCollapsed ? <PanelLeftOpen size={16} strokeWidth={1.5} /> : <PanelLeftClose size={16} strokeWidth={1.5} />}
        </IconButton>
      </div>
      <ol className="space-y-0.5">
        {orderedLessons(course).map((lesson, i) => {
          const states = kinds.map((k) => cellState(course, lesson, k));
          const mark = states.includes('attention') ? 'attention' : states.includes('stale') ? 'stale' : null;
          return (
            <li key={lesson.id}>
              <Link
                to="/c/$courseId/lesson/$lessonId"
                params={{ courseId: course.id, lessonId: lesson.id }}
                aria-current={lesson.id === currentId ? 'page' : undefined}
                title={railCollapsed ? lesson.title : undefined}
                className={cx(
                  'flex items-start gap-2 rounded-control py-2 font-ui text-13 leading-5 text-ink-2 outline-none transition-colors duration-120 hover:bg-well hover:text-ink focus-visible:ring-2 focus-visible:ring-accent current:bg-accent-tint current:text-ink',
                  railCollapsed ? 'justify-center px-1' : 'px-2',
                )}
              >
                <span className="font-mono text-12 leading-5 text-ink-2 tabular">{String(i + 1).padStart(2, '0')}</span>
                {!railCollapsed && (
                  <span className="line-clamp-2 min-w-0 flex-1" lang={course.language}>
                    {lesson.title}
                  </span>
                )}
                {!railCollapsed && mark && <StatusMark kind={mark} label={mark === 'attention' ? t.map.attention : t.map.stale} className="mt-1" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
