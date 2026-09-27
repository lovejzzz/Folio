import { enabledKinds } from '@folio/core';
import { Button, IconButton, Kbd, MaterialIcon, Menu, MenuItem, MenuSeparator, cx, useMediaQuery } from '@folio/ui';
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { BookMarked, ChevronDown, Download, History, Library, MoreHorizontal, Plus, Redo2, Search, Settings, Undo2 } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { HeaderDivider, HomeLink } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { redo, undo } from '../../state/edit';
import { useCourse, useStore } from '../../state/session';
import { useUi } from '../../state/ui';
import { BuildStatus } from './BuildStatus';
import { useChangeCount } from './useChangeCount';

const tabClass =
  'flex h-8 items-center gap-1.5 rounded-control px-2.5 font-ui text-14 text-ink-2 outline-none transition-colors duration-120 hover:bg-well hover:text-ink focus-visible:ring-2 focus-visible:ring-accent current:text-ink current:bg-paper current:shadow-sheet';

function ViewNav() {
  const t = useT();
  const course = useCourse();
  const navigate = useNavigate();
  const match = useMatchRoute();
  const first = course.lessonOrder[0];
  const inMaterial = Boolean(match({ to: '/c/$courseId/m/$kind', fuzzy: true }));
  return (
    <nav aria-label={t.nav.more} className="hidden items-center gap-1 md:flex">
      <Link to="/c/$courseId/map" params={{ courseId: course.id }} className={tabClass}>
        {t.nav.map}
      </Link>
      {first && (
        <Link
          to="/c/$courseId/lesson/$lessonId"
          params={{ courseId: course.id, lessonId: first }}
          className={tabClass}
          activeOptions={{ includeSearch: false }}
          data-status={match({ to: '/c/$courseId/lesson/$lessonId', fuzzy: true }) ? 'active' : undefined}
        >
          {t.nav.lessons}
        </Link>
      )}
      <Menu
        label={t.map.grid}
        trigger={
          <AriaButton className={cx(tabClass, 'data-pressed:bg-well')} data-status={inMaterial ? 'active' : undefined}>
            {t.nav.materials}
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          </AriaButton>
        }
      >
        {enabledKinds(course).map((kind) => (
          <MenuItem key={kind} id={kind} icon={<MaterialIcon kind={kind} size={16} />} onAction={() => void navigate({ to: '/c/$courseId/m/$kind', params: { courseId: course.id, kind } })}>
            {t.materials[kind]}
          </MenuItem>
        ))}
      </Menu>
    </nav>
  );
}

function MoreMenu() {
  const t = useT();
  const navigate = useNavigate();
  const store = useStore();
  const { toggleDrawer, setCommandOpen } = useUi();
  // Below sm the header has no room for the search button, so it lives here.
  const narrow = useMediaQuery('(max-width: 639px)');
  return (
    <Menu
      label={t.nav.more}
      trigger={
        <IconButton label={t.nav.more} tooltip={false}>
          <MoreHorizontal size={18} strokeWidth={1.5} />
        </IconButton>
      }
    >
      {narrow && (
        <MenuItem id="search" icon={<Search size={16} />} onAction={() => setCommandOpen(true)}>
          {t.nav.commandBar}
        </MenuItem>
      )}
      <MenuItem id="undo" icon={<Undo2 size={16} />} hint={<Kbd>⌘Z</Kbd>} isDisabled={!store.canUndo()} onAction={() => undo()}>
        {t.common.undo}
      </MenuItem>
      <MenuItem id="redo" icon={<Redo2 size={16} />} hint={<Kbd>⇧⌘Z</Kbd>} isDisabled={!store.canRedo()} onAction={() => redo()}>
        {t.common.redo}
      </MenuItem>
      <MenuItem id="export" icon={<Download size={16} />} onAction={() => toggleDrawer('export')}>
        {t.command.exportItem}
      </MenuItem>
      <MenuItem id="sources" icon={<BookMarked size={16} />} onAction={() => toggleDrawer('sources')}>
        {t.command.sourcesItem}
      </MenuItem>
      <MenuSeparator />
      <MenuItem id="new" icon={<Plus size={16} />} onAction={() => void navigate({ to: '/' })}>
        {t.command.newCourse}
      </MenuItem>
      <MenuItem id="library" icon={<Library size={16} />} onAction={() => void navigate({ to: '/library' })}>
        {t.nav.library}
      </MenuItem>
      <MenuItem id="settings" icon={<Settings size={16} />} onAction={() => void navigate({ to: '/settings' })}>
        {t.nav.settings}
      </MenuItem>
    </Menu>
  );
}

function Actions() {
  const t = useT();
  const { drawer, toggleDrawer, setCommandOpen } = useUi();
  const changes = useChangeCount();
  const planning = useCourse().status === 'planning';
  return (
    <div className="flex items-center gap-1">
      <span className="hidden sm:contents">
        <IconButton label={`${t.nav.commandBar} (⌘K)`} onPress={() => setCommandOpen(true)}>
          <Search size={18} strokeWidth={1.5} />
        </IconButton>
      </span>
      {!planning && (
        <>
          {changes > 0 ? (
            // A dot on a clock icon went unnoticed; the count in words says there is work waiting, and how much.
            <Button
              variant="quiet"
              aria-label={`${t.changes.title}, ${t.changes.toReview(changes)}`}
              onPress={() => toggleDrawer('changes')}
              className={cx('gap-1.5 bg-attention-tint px-2.5 text-ink data-hovered:bg-attention-tint data-hovered:text-ink', drawer === 'changes' && 'ring-1 ring-inset ring-attention/40')}
            >
              <History size={16} strokeWidth={1.75} aria-hidden className="text-attention" />
              <span className="tabular">{t.changes.toReview(changes)}</span>
            </Button>
          ) : (
            <IconButton label={t.changes.title} active={drawer === 'changes'} onPress={() => toggleDrawer('changes')}>
              <History size={18} strokeWidth={1.5} />
            </IconButton>
          )}
          <span className="hidden sm:contents">
            {/* Named: a bookmark icon alone didn't say that the teacher's own notes live here. */}
            <Button variant="quiet" onPress={() => toggleDrawer('sources')} className={cx('gap-1.5 px-2.5', drawer === 'sources' && 'bg-well text-ink')}>
              <BookMarked size={16} strokeWidth={1.75} aria-hidden />
              {t.sources.title}
            </Button>
            <Button variant={drawer === 'export' ? 'primary' : 'secondary'} onPress={() => toggleDrawer('export')} className="ml-1">
              <Download size={16} strokeWidth={1.75} aria-hidden />
              {t.export.title}
            </Button>
          </span>
        </>
      )}
      <MoreMenu />
    </div>
  );
}

export function CourseHeader() {
  const course = useCourse();
  const t = useT();
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-desk px-3 md:px-5">
      <HomeLink compact />
      <HeaderDivider />
      <Link
        to="/c/$courseId/map"
        params={{ courseId: course.id }}
        lang={course.language}
        className="min-w-0 max-w-64 truncate rounded-control px-1 font-ui text-14 font-semibold text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent lg:max-w-80"
      >
        {course.title || t.common.untitled}
      </Link>
      {course.status !== 'planning' && <ViewNav />}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <BuildStatus />
        <Actions />
      </div>
    </header>
  );
}
