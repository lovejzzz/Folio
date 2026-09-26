import { forwardRef, type ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cx } from '../cx';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-ui font-medium rounded-control select-none outline-none ' +
  'transition-colors duration-120 ease-ink cursor-default data-disabled:opacity-45 data-focus-visible:ring-2 data-focus-visible:ring-accent data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-paper';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink data-hovered:brightness-110 data-pressed:brightness-95',
  secondary: 'bg-paper text-ink border border-field data-hovered:bg-well data-pressed:bg-rule',
  quiet: 'text-ink-2 data-hovered:bg-well data-hovered:text-ink data-pressed:bg-rule',
  destructive: 'bg-critical text-paper data-hovered:brightness-110 data-pressed:brightness-95',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-13',
  md: 'h-8 px-3 text-14',
  lg: 'h-11 px-5 text-16',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, ...props },
  ref,
) {
  return <AriaButton ref={ref} {...props} className={cx(base, variants[variant], sizes[size], className)} />;
});
