import { Minus, Plus } from 'lucide-react';
import { Button, Group, Input, Label, NumberField, type NumberFieldProps } from 'react-aria-components';
import { cx } from '../cx';

interface NumberStepperProps extends Omit<NumberFieldProps, 'className'> {
  label: string;
  unit?: string;
  className?: string;
}

const stepClass =
  'flex size-8 items-center justify-center text-ink-2 outline-none data-hovered:bg-well data-hovered:text-ink data-pressed:bg-rule data-disabled:opacity-35 data-focus-visible:ring-2 data-focus-visible:ring-inset data-focus-visible:ring-accent';

export function NumberStepper({ label, unit, className, ...props }: NumberStepperProps) {
  return (
    <NumberField {...props} className={cx('flex items-center justify-between gap-4', className)}>
      <Label className="font-ui text-14 text-ink">{label}</Label>
      <Group className="flex h-8 items-center overflow-hidden rounded-control border border-field bg-paper data-focus-within:border-accent">
        <Button slot="decrement" className={stepClass}>
          <Minus size={14} strokeWidth={1.75} aria-hidden />
        </Button>
        <Input className="h-full w-10 border-x border-rule bg-transparent text-center font-ui text-14 text-ink tabular-nums outline-none" />
        <Button slot="increment" className={stepClass}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </Button>
      </Group>
      {unit && <span className="sr-only">{unit}</span>}
    </NumberField>
  );
}
