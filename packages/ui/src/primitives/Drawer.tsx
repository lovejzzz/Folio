import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FocusScope } from 'react-aria';
import { cx } from '../cx';
import { useMediaQuery } from '../useMediaQuery';
import { IconButton } from './IconButton';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * One drawer at a time, 400 px on the right. At 1280 px and wider it sits
 * beside the sheet; below that it overlays, and on phones it is a bottom sheet.
 * Esc closes it and focus returns to whatever opened it.
 */
export function Drawer({ isOpen, onClose, title, closeLabel, children, footer }: DrawerProps) {
  const docked = useMediaQuery('(min-width: 1280px)');
  const phone = useMediaQuery('(max-width: 767px)');
  const titleId = useId();
  if (!isOpen) return null;
  const panel = (
    <FocusScope contain={!docked} restoreFocus autoFocus>
      <aside
        role="dialog"
        aria-modal={!docked}
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        className={cx(
          'flex flex-col bg-paper outline-none',
          docked && 'sticky top-14 h-below-header w-100 shrink-0 border-l border-rule animate-drawer-in',
          !docked && !phone && 'fixed inset-y-0 right-0 z-40 w-100 max-w-full shadow-overlay animate-drawer-in',
          phone && 'fixed inset-x-0 bottom-0 top-12 z-40 rounded-t-sheet shadow-overlay animate-sheet-up',
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-rule pl-5 pr-3">
          <h2 id={titleId} className="font-ui text-16 font-semibold text-ink">
            {title}
          </h2>
          <IconButton label={closeLabel} onPress={onClose} tooltip={false}>
            <X size={18} strokeWidth={1.5} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <footer className="shrink-0 border-t border-rule p-4">{footer}</footer>}
      </aside>
    </FocusScope>
  );
  if (docked) return panel;
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-30 bg-scrim animate-fade-in" onClick={onClose} />
      {panel}
    </>
  );
}
