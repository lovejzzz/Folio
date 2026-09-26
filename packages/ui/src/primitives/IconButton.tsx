import { forwardRef, type ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cx } from '../cx';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  /** Required: icon buttons are named for screen readers and get a tooltip. */
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
  tooltip?: boolean;
  active?: boolean;
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = 'md', tooltip = true, active = false, className, ...props },
  ref,
) {
  const button = (
    <AriaButton
      ref={ref}
      aria-label={label}
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-control text-ink-2 outline-none transition-colors duration-120 ease-ink',
        'data-hovered:bg-well data-hovered:text-ink data-pressed:bg-rule data-disabled:opacity-45',
        'data-focus-visible:ring-2 data-focus-visible:ring-accent data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-paper',
        size === 'sm' ? 'size-7' : 'size-8',
        active && 'bg-accent-tint text-accent data-hovered:bg-accent-tint data-hovered:text-accent',
        className,
      )}
    >
      {children}
    </AriaButton>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
});
