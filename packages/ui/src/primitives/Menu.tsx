import type { ReactElement, ReactNode } from 'react';
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover, Separator, type MenuItemProps } from 'react-aria-components';
import { cx } from '../cx';

export const popoverClass =
  'min-w-48 rounded-sheet border border-rule bg-paper p-1 shadow-overlay outline-none data-entering:animate-pop-in data-exiting:animate-fade-out';

export function Menu({ trigger, children, label }: { trigger: ReactElement; children: ReactNode; label: string }) {
  return (
    <MenuTrigger>
      {trigger}
      <Popover placement="bottom end" offset={6} className={popoverClass}>
        <AriaMenu aria-label={label} className="outline-none">
          {children}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

export function MenuItem({ children, icon, hint, danger, ...props }: Omit<MenuItemProps, 'children' | 'className'> & { children: ReactNode; icon?: ReactNode; hint?: ReactNode; danger?: boolean }) {
  return (
    <AriaMenuItem
      {...props}
      className={cx(
        'flex h-8 cursor-default items-center gap-2.5 rounded-control px-2.5 font-ui text-14 outline-none data-focused:bg-well data-disabled:opacity-45',
        danger ? 'text-critical' : 'text-ink',
      )}
    >
      {icon && <span className="text-ink-2" aria-hidden>{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-ink-2">{hint}</span>}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <Separator className="my-1 h-px bg-rule" />;
}
