/**
 * DateTimeField — data + hora em ISO local ("YYYY-MM-DDTHH:mm", o mesmo formato do
 * `<input type="datetime-local">`). DateField para a data e Input de hora ao lado.
 *
 *   <DateTimeField label="Início" value={inicio} onChange={setInicio} />
 *
 * `onChange(null)` quando a data é limpa; sem hora informada assume 00:00.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { joinIsoDateTime, splitIsoDateTime } from '@/lib/dateIso';
import { DateField, type DateFieldProps } from './DateField';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';

export interface DateTimeFieldProps
  extends FieldBaseProps,
    Pick<DateFieldProps, 'min' | 'max' | 'size' | 'inputClassName'> {
  /** ISO local "YYYY-MM-DDTHH:mm" (aceita também com segundos/fuso — só data e hora são usadas). */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Passo do campo de hora em segundos (padrão 300 = 5 min). */
  step?: number;
  name?: string;
}

export function DateTimeField({
  value,
  onChange,
  min,
  max,
  size,
  inputClassName,
  step = 300,
  name,
  label,
  helperText,
  error,
  required,
  disabled,
  id,
  className,
  fullWidth,
}: DateTimeFieldProps) {
  const { date, time } = splitIsoDateTime(value);

  return (
    <FieldWrapper
      label={label}
      helperText={helperText}
      error={error}
      required={required}
      disabled={disabled}
      id={id}
      className={className}
      fullWidth={fullWidth}
    >
      {(control) => (
        <div className="flex gap-2">
          <DateField
            id={control.id}
            value={date}
            onChange={(iso) => onChange(joinIsoDateTime(iso, time))}
            min={min?.slice(0, 10)}
            max={max?.slice(0, 10)}
            size={size}
            inputClassName={inputClassName}
            disabled={disabled}
            error={Boolean(error)}
            required={required}
            name={name ? `${name}_date` : undefined}
            className="flex-1"
          />
          <Input
            type="time"
            aria-label="Hora"
            aria-invalid={control['aria-invalid']}
            name={name ? `${name}_time` : undefined}
            step={step}
            value={time}
            disabled={disabled}
            onChange={(e) => {
              if (date) onChange(joinIsoDateTime(date, e.target.value));
            }}
            className={cn('w-[6.5rem] shrink-0 bg-input-bg', size === 'small' && 'h-8 text-sm', inputClassName)}
          />
        </div>
      )}
    </FieldWrapper>
  );
}

export default DateTimeField;
