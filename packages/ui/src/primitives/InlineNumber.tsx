import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Input, NumberField } from 'react-aria-components';
import { cx } from '../cx';
import { fitsRange } from './numberRange';

export interface InlineNumberProps {
  /** Accessible name, e.g. "Minutes for step 2". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  minValue: number;
  maxValue: number;
  /** Decimal places allowed; 0 (whole numbers) by default. */
  fractionDigits?: number;
  /** What the field takes, shown for a moment when something else was typed: "Whole minutes, 1 to 600." */
  hint: string;
  /** A unit after the number, such as "min". */
  unit?: ReactNode;
  /** Shown when there is no number yet (a NaN value). */
  placeholder?: string;
  className?: string;
}

const HINT_MS = 4000;

/**
 * A number that reads as part of the sentence around it and edits in place.
 * Letters and signs are refused as they are typed and values are kept within
 * range on commit (React Aria's NumberField); either way a short hint says
 * what the field takes, so nothing changes silently.
 */
export function InlineNumber({ label, value, onChange, minValue, maxValue, fractionDigits = 0, hint, unit, placeholder, className }: InlineNumberProps) {
  const typed = useRef('');
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [showHint]);
  const check = () => {
    if (!fitsRange(typed.current, minValue, maxValue, fractionDigits)) setShowHint(true);
    typed.current = '';
  };
  return (
    <NumberField
      aria-label={label}
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      step={fractionDigits ? undefined : 1}
      formatOptions={{ maximumFractionDigits: fractionDigits, useGrouping: false }}
      onChange={(next) => {
        if (!Number.isNaN(next) && next !== value) onChange(next);
      }}
      className={cx('inline-flex flex-col', className)}
    >
      <Group className="inline-flex items-baseline">
        <Input
          size={String(maxValue).length + (fractionDigits ? fractionDigits + 1 : 0)}
          onInput={(e) => (typed.current = e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') check();
            else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && /[^\d.,]/.test(e.key)) setShowHint(true);
          }}
          onBlur={check}
          placeholder={placeholder}
          className="field-sizing-content -ml-1 h-6 min-w-6 rounded-control bg-transparent px-1 tabular-nums outline-none transition-colors duration-120 hover:bg-well focus:bg-paper focus:ring-2 focus:ring-accent"
        />
        {unit}
      </Group>
      <span role="status" className={cx('font-ui text-12 leading-4 text-attention', !showHint && 'sr-only')}>
        {showHint ? hint : ''}
      </span>
    </NumberField>
  );
}
