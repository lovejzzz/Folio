import { isCourseFormatError, newId, type Course } from '@folio/core';
import { Button, Dialog, IconButton, Menu, MenuItem, fieldClass, cx } from '@folio/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { Copy, FolderOpen, MoreHorizontal, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { CourseCard } from '../../components/CourseCard';
import { EmptySheets } from '../../components/Illustrations';
import { useT } from '../../i18n';
import { useAccount } from '../../state/account';
import { download } from '../../lib/exporter';
import { useCourseList } from '../../state/courseList';
import { deleteCourse, isQuotaError, loadCourse, saveCourse, type CourseSummary } from '../../state/db';
import { copyCourseMedia, restoreMedia } from '../../state/media';
import { toast } from '../../state/toasts';
import { dropSession } from '../../state/session';

async function saveFolio(course: Course): Promise<void> {
  const [{ writeFolio, slugFilename, MIME }, { backupMedia }] = await Promise.all([import('@folio/export/files'), import('../../lib/exportMedia')]);
  download({ name: slugFilename(course.title, '', '', 'folio'), mime: MIME.folio, bytes: writeFolio(course, undefined, await backupMedia(course)) });
}

function CardMenu({ course, onChanged, onDelete }: { course: CourseSummary; onChanged: () => void; onDelete: () => void }) {
  const t = useT();
  const duplicate = async () => {
    const full = await loadCourse(course.id);
    if (!full) return;
    const now = new Date().toISOString();
    const copy = { ...full, id: newId('c'), title: t.library.copyOf(full.title), createdAt: now, updatedAt: now };
    // The pictures first: a copy that opens before they are there would show empty places.
    await copyCourseMedia(full.id, copy.id);
    await saveCourse(copy);
    onChanged();
  };
  return (
    <Menu label={t.library.actions(course.title)} trigger={<IconButton size="sm" tooltip={false} label={t.library.actions(course.title)}><MoreHorizontal size={16} strokeWidth={1.5} /></IconButton>}>
      <MenuItem id="dup" icon={<Copy size={15} />} onAction={() => void duplicate()}>
        {t.library.duplicate}
      </MenuItem>
      <MenuItem id="save" icon={<Save size={15} />} onAction={() => void loadCourse(course.id).then((c) => c && saveFolio(c))}>
        {t.library.exportFolio}
      </MenuItem>
      <MenuItem id="del" icon={<Trash2 size={15} />} danger onAction={onDelete}>
        {t.library.deleteCourse}
      </MenuItem>
    </Menu>
  );
}

/** The list follows every change by itself; the refresh is kept for callers that ask for one. */
function useCourses(): [CourseSummary[] | null, () => void] {
  return [useCourseList(), () => {}];
}

function Header() {
  const t = useT();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const open = async (f: File) => {
    try {
      const { readFolioFile } = await import('@folio/export/files');
      const { course: read, media } = readFolioFile(new Uint8Array(await f.arrayBuffer()));
      // Opening a backup never replaces a course already here: it arrives as a copy.
      const course = (await loadCourse(read.id)) ? { ...read, id: newId('c'), title: t.library.copyOf(read.title) } : read;
      for (const m of media) await restoreMedia(course.id, m);
      await saveCourse(course);
      toast({ message: t.library.imported(course.title) });
      await navigate({ to: '/c/$courseId/map', params: { courseId: course.id } });
    } catch (error) {
      const message = isCourseFormatError(error) ? t.library.importErrors[error.code] : isQuotaError(error) ? t.errors.storageFull : t.errors.generic;
      toast({ message, tone: 'critical' });
    }
  };
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-48 leading-none text-ink">{t.library.title}</h1>
        <p className="mt-2 font-ui text-14 text-ink-2">{t.library.lede}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onPress={() => file.current?.click()}>
          <FolderOpen size={16} strokeWidth={1.5} aria-hidden />
          {t.library.import}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".folio,.json,application/zip,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void open(f);
          }}
        />
        <Link to="/" className="inline-flex h-8 items-center gap-2 rounded-control bg-accent px-3 font-ui text-14 font-medium text-accent-ink outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-desk">
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          {t.library.newCourse}
        </Link>
      </div>
    </div>
  );
}

function DeleteDialog({ course, onClose, onDeleted }: { course: CourseSummary | null; onClose: () => void; onDeleted: () => void }) {
  const t = useT();
  const signedIn = useAccount((s) => Boolean(s.user));
  return (
    <Dialog isOpen={course !== null} onOpenChange={(o) => !o && onClose()} title={t.library.deleteCourse} size="sm">
      <div className="px-6 pb-6">
        <p className="mt-2 font-ui text-14 leading-relaxed text-ink-2">{course && (signedIn ? t.library.deleteConfirmAccount(course.title) : t.library.deleteConfirm(course.title))}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" onPress={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            variant="destructive"
            onPress={async () => {
              if (course) {
                dropSession(course.id);
                await deleteCourse(course.id);
              }
              onClose();
              onDeleted();
              toast({ message: t.library.deleted });
            }}
          >
            {t.common.delete}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Every course on this device, as paper cards. */
export function Library() {
  const t = useT();
  const [courses, refresh] = useCourses();
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<CourseSummary | null>(null);
  usePageTitle(t.library.title);
  const shown = (courses ?? []).filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-6xl px-5 pb-24 pt-8 md:px-8 md:pt-12">
        <Header />
        {courses && courses.length > 0 && (
          <label className="relative mt-8 block max-w-sm">
            <span className="sr-only">{t.library.search}</span>
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-2.5 text-ink-2" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.library.search} className={cx(fieldClass, 'h-9 pl-9')} />
          </label>
        )}
        {courses && courses.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <EmptySheets />
            <p className="mt-6 font-display text-28 text-ink">{t.library.empty}</p>
            <p className="mt-1 font-ui text-14 text-ink-2">{t.library.emptyHint}</p>
          </div>
        )}
        {courses && courses.length > 0 && shown.length === 0 && <p className="mt-10 font-ui text-14 text-ink-2">{t.library.noMatch}</p>}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CourseCard key={c.id} course={c} menu={<CardMenu course={c} onChanged={refresh} onDelete={() => setDeleting(c)} />} />
          ))}
        </div>
      </main>
      <DeleteDialog course={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />
    </div>
  );
}
