import { enabledKinds, orderedLessons, type Course } from '@folio/core';
import { MaterialIcon } from '@folio/ui';
import type { useNavigate } from '@tanstack/react-router';
import { BookMarked, Download, FileText, History, Library, Moon, Plus, Settings, Undo2, LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Messages } from '../../i18n';
import { shortcut } from '../../lib/shortcut';
import { undo } from '../../state/edit';
import { usePrefs } from '../../state/prefs';
import { useUi } from '../../state/ui';

export interface CommandItem {
  id: string;
  group: 'goTo' | 'materials' | 'actions';
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const icon = (node: ReactNode) => <span className="text-ink-2">{node}</span>;

export function commandItems(course: Course, t: Messages, navigate: ReturnType<typeof useNavigate>): CommandItem[] {
  const ui = useUi.getState();
  const lessons: CommandItem[] = orderedLessons(course).map((l, i) => ({
    id: `l:${l.id}`,
    group: 'goTo',
    label: `${t.common.lesson(i + 1)} · ${l.title}`,
    icon: icon(<FileText size={16} strokeWidth={1.5} />),
    run: () => void navigate({ to: '/c/$courseId/lesson/$lessonId', params: { courseId: course.id, lessonId: l.id } }),
  }));
  const materials: CommandItem[] = enabledKinds(course).map((kind) => ({
    id: `m:${kind}`,
    group: 'materials',
    label: t.materials[kind],
    icon: icon(<MaterialIcon kind={kind} size={16} />),
    run: () => void navigate({ to: '/c/$courseId/m/$kind', params: { courseId: course.id, kind } }),
  }));
  const theme = usePrefs.getState();
  const dark = theme.theme === 'dark' || (theme.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const actions: CommandItem[] = [
    { id: 'a:map', group: 'goTo', label: t.nav.map, icon: icon(<LayoutGrid size={16} strokeWidth={1.5} />), run: () => void navigate({ to: '/c/$courseId/map', params: { courseId: course.id } }) },
    { id: 'a:export', group: 'actions', label: t.command.exportItem, icon: icon(<Download size={16} strokeWidth={1.5} />), run: () => ui.openDrawer('export') },
    { id: 'a:changes', group: 'actions', label: t.command.changesItem, icon: icon(<History size={16} strokeWidth={1.5} />), run: () => ui.openDrawer('changes') },
    { id: 'a:sources', group: 'actions', label: t.command.sourcesItem, icon: icon(<BookMarked size={16} strokeWidth={1.5} />), run: () => ui.openDrawer('sources') },
    { id: 'a:undo', group: 'actions', label: t.command.undo, hint: shortcut('⌘Z'), icon: icon(<Undo2 size={16} strokeWidth={1.5} />), run: () => undo() },
    { id: 'a:theme', group: 'actions', label: t.command.toggleTheme, icon: icon(<Moon size={16} strokeWidth={1.5} />), run: () => theme.set({ theme: dark ? 'light' : 'dark' }) },
    { id: 'a:new', group: 'actions', label: t.command.newCourse, icon: icon(<Plus size={16} strokeWidth={1.5} />), run: () => void navigate({ to: '/' }) },
    { id: 'a:library', group: 'actions', label: t.command.libraryItem, icon: icon(<Library size={16} strokeWidth={1.5} />), run: () => void navigate({ to: '/library' }) },
    { id: 'a:settings', group: 'actions', label: t.command.settingsItem, icon: icon(<Settings size={16} strokeWidth={1.5} />), run: () => void navigate({ to: '/settings' }) },
  ];
  return [actions[0]!, ...lessons, ...materials, ...actions.slice(1)];
}

/** Loose matching: every word of the query appears somewhere in the label. */
export function matches(label: string, query: string): boolean {
  const hay = label.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
