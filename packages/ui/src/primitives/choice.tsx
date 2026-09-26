import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Checkbox as AriaCheckbox,
  Switch as AriaSwitch,
  ToggleButton,
  ToggleButtonGroup,
  type CheckboxProps,
  type Key,
  type SwitchProps,
} from 'react-aria-components';
import { cx } from '../cx';

export function Checkbox({ children, className, ...props }: Omit<CheckboxProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaCheckbox {...props} className={cx('group flex cursor-default items-center gap-2.5 font-ui text-14 text-ink outline-none', className)}>
      <span
        aria-hidden
        className="flex size-4.5 shrink-0 items-center justify-center rounded-control border border-field bg-paper text-accent-ink transition-colors duration-120 group-data-selected:border-accent group-data-selected:bg-accent group-data-focus-visible:ring-2 group-data-focus-visible:ring-accent group-data-focus-visible:ring-offset-2 group-data-focus-visible:ring-offset-paper"
      >
        <Check size={12} strokeWidth={2.5} className="opacity-0 group-data-selected:opacity-100" />
      </span>
      {children}
    </AriaCheckbox>
  );
}

export function Switch({ children, className, ...props }: Omit<SwitchProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaSwitch {...props} className={cx('group flex cursor-default items-center justify-between gap-4 font-ui text-14 text-ink outline-none', className)}>
      {children}
      <span
        aria-hidden
        className="flex h-5 w-9 shrink-0 items-center rounded-full border border-field bg-well px-0.5 transition-colors duration-120 group-data-selected:border-accent group-data-selected:bg-accent group-data-focus-visible:ring-2 group-data-focus-visible:ring-accent group-data-focus-visible:ring-offset-2 group-data-focus-visible:ring-offset-paper"
      >
        <span className="size-3.5 rounded-full bg-ink-2 transition-transform duration-200 ease-ink group-data-selected:translate-x-4 group-data-selected:bg-accent-ink" />
      </span>
    </AriaSwitch>
  );
}

export interface SegmentOption<K extends string> {
  id: K;
  label: ReactNode;
}

export function SegmentedControl<K extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: SegmentOption<K>[];
  value: K | null;
  onChange: (value: K) => void;
  className?: string;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={value === null ? [] : [value]}
      onSelectionChange={(keys: Set<Key>) => {
        const [first] = [...keys];
        if (first !== undefined) onChange(String(first) as K);
      }}
      className={cx('inline-flex rounded-control border border-field bg-well p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleButton
          key={o.id}
          id={o.id}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-2.5 font-ui text-13 text-ink-2 outline-none transition-colors duration-120 data-hovered:text-ink data-selected:bg-paper data-selected:text-ink data-selected:shadow-sheet data-focus-visible:ring-2 data-focus-visible:ring-accent"
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
