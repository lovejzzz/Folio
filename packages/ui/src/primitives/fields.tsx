import type { ReactNode } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import { cx } from '../cx';

export const fieldClass =
  'w-full rounded-control border border-field bg-paper px-3 font-ui text-14 text-ink outline-none placeholder:text-ink-2 ' +
  'transition-colors duration-120 data-hovered:border-ink-2 data-focused:border-accent data-focused:ring-2 data-focused:ring-accent/25 data-invalid:border-critical ' +
  // A plain input or select given this look has no data-focused: it shows its focus the browser's way.
  'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25';

interface FieldProps extends Omit<AriaTextFieldProps, 'className' | 'children'> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  className?: string;
  /** Hide the label visually but keep it for screen readers. */
  labelHidden?: boolean;
}

function FieldLabel({ children, hidden }: { children: ReactNode; hidden?: boolean }) {
  return <Label className={cx('mb-1.5 block font-ui text-13 font-medium text-ink', hidden && 'sr-only')}>{children}</Label>;
}

function FieldFoot({ description, error }: { description?: ReactNode; error?: ReactNode }) {
  return (
    <>
      {description && (
        <Text slot="description" className="mt-1.5 block font-ui text-13 text-ink-2">
          {description}
        </Text>
      )}
      <FieldError className="mt-1.5 block font-ui text-13 text-critical">{error}</FieldError>
    </>
  );
}

export function TextField({ label, description, error, placeholder, className, labelHidden, ...props }: FieldProps) {
  return (
    <AriaTextField {...props} isInvalid={Boolean(error) || props.isInvalid} className={cx('block', className)}>
      <FieldLabel hidden={labelHidden}>{label}</FieldLabel>
      <Input placeholder={placeholder} className={cx(fieldClass, 'h-9')} />
      <FieldFoot description={description} error={error} />
    </AriaTextField>
  );
}

export function TextArea({ label, description, error, placeholder, className, labelHidden, rows = 4, ...props }: FieldProps & { rows?: number }) {
  return (
    <AriaTextField {...props} isInvalid={Boolean(error) || props.isInvalid} className={cx('block', className)}>
      <FieldLabel hidden={labelHidden}>{label}</FieldLabel>
      <AriaTextArea placeholder={placeholder} rows={rows} className={cx(fieldClass, 'resize-y py-2 leading-relaxed')} />
      <FieldFoot description={description} error={error} />
    </AriaTextField>
  );
}
