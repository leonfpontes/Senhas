/**
 * DurationField — duração em minutos digitada como "hh:mm" (aceita tempo quebrado: 00:45, 01:30).
 *
 *   <DurationField label="Prazo" value={minutos} onChange={setMinutos} min={5} max={48 * 60} />
 *
 * Digitação de cronômetro com máscara automática ("130" → "1:30"); ao sair do campo o texto é
 * normalizado ("00:90" → "01:30", "45" → "00:45"). Ao lado do campo aparece o tempo legível
 * ("1h30"). `onChange` recebe os minutos, ou `null` quando o campo é limpo. Fora de `min`/`max`
 * o campo mostra o erro sozinho (um `error` passado pelo chamador tem prioridade); o chamador
 * continua responsável por bloquear o salvar — use `durationRangeError` para a mesma regra.
 */
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { formatDuration, formatHHMM, maskDuration, parseDuration } from '@/lib/duration';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';

/** Mensagem de erro para minutos fora de `[min, max]` (string vazia quando ok ou vazio). */
export function durationRangeError(minutes: number | null | undefined, min?: number, max?: number): string {
  if (minutes == null) return '';
  if (min != null && minutes < min) return `Mínimo de ${formatDuration(min)}`;
  if (max != null && minutes > max) return `Máximo de ${formatDuration(max)}`;
  return '';
}

export interface DurationFieldProps extends FieldBaseProps {
  /** Duração em minutos. */
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  /** Limites em minutos. */
  min?: number;
  max?: number;
  placeholder?: string;
  name?: string;
  size?: 'small' | 'medium';
  inputClassName?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export function DurationField({
  value,
  onChange,
  min,
  max,
  placeholder = 'hh:mm',
  name,
  size = 'medium',
  inputClassName,
  onBlur,
  error,
  ...field
}: DurationFieldProps) {
  const [text, setText] = useState(() => (value != null ? formatHHMM(value) : ''));

  // Sincroniza quando o valor muda de fora (reset de formulário, edição) — não durante a digitação,
  // em que o texto ("1:3") ainda não é o "hh:mm" do valor que ele mesmo gerou.
  useEffect(() => {
    setText((current) => (parseDuration(current) === (value ?? null) ? current : value != null ? formatHHMM(value) : ''));
  }, [value]);

  const minutes = parseDuration(text);
  const rangeError = durationRangeError(minutes, min, max);

  const handleChange = (raw: string) => {
    const masked = maskDuration(raw);
    setText(masked);
    const parsed = parseDuration(masked);
    if (parsed !== (value ?? null)) onChange(parsed);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (minutes != null) setText(formatHHMM(minutes));
    onBlur?.(e);
  };

  return (
    <FieldWrapper {...field} error={error || rangeError || undefined}>
      {(control) => (
        <div className="relative flex w-full items-center">
          <Input
            {...control}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={placeholder}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className={cn('bg-input-bg tabular-nums', minutes != null && 'pr-20', size === 'small' && 'h-8 text-sm', inputClassName)}
          />
          {minutes != null && (
            <span
              data-slot="duration-readable"
              aria-hidden
              className="pointer-events-none absolute right-3 text-sm text-muted-foreground"
            >
              {formatDuration(minutes)}
            </span>
          )}
        </div>
      )}
    </FieldWrapper>
  );
}

export default DurationField;
