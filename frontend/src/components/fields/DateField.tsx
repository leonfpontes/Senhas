/**
 * DateField — data em ISO ("YYYY-MM-DD") com digitação "dd/mm/aaaa" e calendário pt-BR em Popover.
 *
 *   <DateField label="Data da gira" value={data} onChange={setData} min="2026-01-01" />
 *
 * Acessível pelo teclado: o campo aceita digitar a data (máscara automática); o botão do
 * calendário abre o Popover, onde as setas navegam pelos dias e Enter seleciona.
 * `onChange` dispara com a data válida completa, ou `null` quando o campo é limpo.
 */
import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { brToIsoDate, isoToBrDate, maskBrDate, parseIsoDate, toIsoDate } from '@/lib/dateIso';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';

export interface DateFieldProps extends FieldBaseProps {
  /** ISO "YYYY-MM-DD" (ou ISO completo — só a data é usada). */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Limites em ISO "YYYY-MM-DD". */
  min?: string;
  max?: string;
  placeholder?: string;
  name?: string;
  size?: 'small' | 'medium';
  inputClassName?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = 'dd/mm/aaaa',
  name,
  size = 'medium',
  inputClassName,
  onBlur,
  ...field
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToBrDate(value));
  const [open, setOpen] = useState(false);

  // Sincroniza o texto quando o valor muda de fora (reset de formulário, edição).
  useEffect(() => {
    setText(isoToBrDate(value));
  }, [value]);

  const selected = parseIsoDate(value) ?? undefined;
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);

  const commitText = (next: string) => {
    const masked = maskBrDate(next);
    setText(masked);
    if (masked === '') {
      // Limpou o campo (havia texto ou valor): avisa o chamador.
      if (text !== '' || value) onChange(null);
      return;
    }
    const iso = brToIsoDate(masked);
    if (iso && iso !== value) onChange(iso);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Texto incompleto/inválido ao sair: volta ao último valor válido.
    if (text && !brToIsoDate(text)) setText(isoToBrDate(value));
    onBlur?.(e);
  };

  return (
    <FieldWrapper {...field}>
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
            onChange={(e) => commitText(e.target.value)}
            onBlur={handleBlur}
            className={cn('bg-input-bg pr-10', size === 'small' && 'h-8 text-sm', inputClassName)}
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1.5 size-7 text-muted-foreground"
                aria-label="Abrir calendário"
                disabled={control.disabled}
              >
                <CalendarDays />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selected}
                defaultMonth={selected}
                disabled={[
                  ...(minDate ? [{ before: minDate }] : []),
                  ...(maxDate ? [{ after: maxDate }] : []),
                ]}
                onSelect={(date) => {
                  if (date) {
                    const iso = toIsoDate(date);
                    setText(isoToBrDate(iso));
                    onChange(iso);
                  }
                  setOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </FieldWrapper>
  );
}

export default DateField;
