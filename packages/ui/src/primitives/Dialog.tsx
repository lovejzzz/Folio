import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { cx } from '../cx';

interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Place near the top, as for a command bar. */
  top?: boolean;
  isDismissable?: boolean;
  className?: string;
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Dialog({ isOpen, onOpenChange, title, children, size = 'md', top, isDismissable = true, className }: DialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className={cx(
        'fixed inset-0 z-50 flex justify-center bg-scrim px-4 backdrop-blur-none data-entering:animate-fade-in data-exiting:animate-fade-out',
        top ? 'items-start pb-4 pt-28' : 'items-center py-4',
      )}
    >
      {/* Never taller than the screen: a long dialog on a phone scrolls inside itself, its buttons still in reach. */}
      <Modal className={cx('max-h-full w-full overflow-y-auto overscroll-contain rounded-sheet border border-rule bg-paper shadow-overlay outline-none data-entering:animate-pop-in', widths[size], className)}>
        <AriaDialog className="outline-none">
          <Heading slot="title" className={cx(top ? 'sr-only' : 'px-6 pt-5 font-display text-28 text-ink')}>
            {title}
          </Heading>
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
