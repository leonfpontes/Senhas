/**
 * DateTimeField — data + hora em ISO local ("YYYY-MM-DDTHH:mm", o mesmo formato do
 * `<input type="datetime-local">`), no desenho do `SeletorDeData` do design system (jornadas v2):
 * um campo só, que mostra "sáb, 6 de dezembro · 19h00" e abre o calendário com a hora.
 *
 *   <DateTimeField label="Início" value={inicio} onChange={setInicio} />
 *
 * Acessível pelo teclado: o campo é um botão (Enter ou Espaço abre); dentro, a data também se
 * digita ("dd/mm/aaaa"), as setas andam pelos dias do calendário e a hora é um campo próprio.
 * Esc ou "Pronto" fecham e devolvem o foco ao campo. O leitor de tela ouve o rótulo e o valor.
 *
 * `onChange(null)` quando a data é limpa; sem hora informada assume 00:00.
 */
import React, { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  brToIsoDate,
  isoToBrDate,
  joinIsoDateTime,
  maskBrDate,
  parseIsoDate,
  splitIsoDateTime,
  toIsoDate,
} from '@/lib/dateIso';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';

export interface DateTimeFieldProps extends FieldBaseProps {
  /** ISO local "YYYY-MM-DDTHH:mm" (aceita também com segundos/fuso — só data e hora são usadas). */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Limites em ISO (só a data é usada). */
  min?: string;
  max?: string;
  size?: 'small' | 'medium';
  inputClassName?: string;
  /** Passo do campo de hora em segundos (padrão 300 = 5 min). */
  step?: number;
  name?: string;
  /** Texto do campo vazio. */
  placeholder?: string;
}

/** "sáb, 6 de dezembro · 19h00" (com o ano quando não é o ano corrente). */
export function rotuloDataHora(date: string, time: string, hoje: Date = new Date()): string {
  const d = parseIsoDate(date);
  if (!d) return '';
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  const ano = d.getFullYear() !== hoje.getFullYear() ? ` de ${d.getFullYear()}` : '';
  const [h = '00', m = '00'] = (time || '00:00').split(':');
  return `${dia}, ${d.getDate()} de ${mes}${ano} · ${Number(h)}h${m.padStart(2, '0')}`;
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
  placeholder = 'Escolher dia e hora',
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToBrDate(date));
  const dataId = useId();
  const horaId = useId();

  // Sincroniza o texto quando o valor muda de fora (reset de formulário, edição).
  useEffect(() => {
    setText(isoToBrDate(date));
  }, [date]);

  const selected = parseIsoDate(date) ?? undefined;
  // O calendário acompanha a data digitada (senão fica no mês de hoje com o dia escolhido fora).
  const [mes, setMes] = useState<Date | undefined>(selected);
  useEffect(() => {
    if (date) setMes(parseIsoDate(date) ?? undefined);
  }, [date]);
  const minDate = parseIsoDate(min?.slice(0, 10));
  const maxDate = parseIsoDate(max?.slice(0, 10));

  const commitText = (next: string) => {
    const masked = maskBrDate(next);
    setText(masked);
    if (masked === '') {
      if (date) onChange(null);
      return;
    }
    const iso = brToIsoDate(masked);
    if (iso && iso !== date) onChange(joinIsoDateTime(iso, time));
  };

  const rotulo = date ? rotuloDataHora(date, time) : '';
  const rotuloDoDialogo = `${typeof label === 'string' ? label : 'Data'}: dia e hora`;

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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              id={control.id}
              aria-describedby={control['aria-describedby']}
              aria-invalid={control['aria-invalid']}
              aria-haspopup="dialog"
              disabled={disabled}
              data-slot="datetime-trigger"
              className={cn(
                'h-9 w-full justify-start gap-2.5 bg-input-bg px-3 text-left font-normal',
                size === 'small' && 'h-8 text-sm',
                !date && 'text-muted-foreground',
                inputClassName,
              )}
            >
              <CalendarDays aria-hidden className="shrink-0 text-muted-foreground" />
              <span className="truncate">{rotulo || placeholder}</span>
            </Button>
          </PopoverTrigger>
          {name && <input type="hidden" name={name} value={date ? (joinIsoDateTime(date, time) ?? '') : ''} />}
          <PopoverContent align="start" className="w-auto p-3" aria-label={rotuloDoDialogo}>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={dataId} className="text-xs font-semibold">
                    Data
                  </Label>
                  <Input
                    id={dataId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd/mm/aaaa"
                    value={text}
                    onChange={(e) => commitText(e.target.value)}
                    onBlur={() => {
                      if (text && !brToIsoDate(text)) setText(isoToBrDate(date));
                    }}
                    className="h-9 w-32 bg-input-bg"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={horaId} className="text-xs font-semibold">
                    Hora
                  </Label>
                  <Input
                    id={horaId}
                    type="time"
                    step={step}
                    value={time}
                    onChange={(e) => {
                      if (date) onChange(joinIsoDateTime(date, e.target.value));
                    }}
                    className="h-9 w-[6.5rem] bg-input-bg"
                  />
                </div>
              </div>
              <Calendar
                mode="single"
                selected={selected}
                month={mes}
                onMonthChange={setMes}
                disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
                onSelect={(d) => {
                  if (d) onChange(joinIsoDateTime(toIsoDate(d), time));
                }}
                className="p-0"
              />
              <Button type="button" className="self-end" onClick={() => setOpen(false)}>
                Pronto
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </FieldWrapper>
  );
}

export default DateTimeField;
