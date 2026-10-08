/**
 * MultiCombobox — escolha de VÁRIOS itens com busca (Popover + Command), irmão do `Combobox`.
 * Os escolhidos aparecem como etiquetas embaixo do botão, cada uma com "x" para tirar.
 *
 *   <MultiCombobox label="Médiuns" options={mediuns.map((m) => ({ value: m.id, label: m.nome }))}
 *                  value={ids} onChange={setIds} placeholder="Escolha os médiuns" />
 *
 * `value` é a lista de `value` das opções escolhidas (na ordem em que foram escolhidas).
 * `dot` (cor CSS) mostra uma bolinha ao lado do rótulo — usado nos grupos da corrente.
 */
import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FieldWrapper, type FieldBaseProps } from './FieldWrapper';
import type { ComboboxOption } from './Combobox';

export interface MultiComboboxOption extends ComboboxOption {
  /** Cor da bolinha ao lado do rótulo (hex/CSS). */
  dot?: string;
}

export interface MultiComboboxProps extends FieldBaseProps {
  options: MultiComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Texto do botão com N escolhidos (padrão: "N escolhidos"). */
  countLabel?: (n: number) => string;
  name?: string;
}

function Dot({ color }: { color?: string }) {
  if (!color) return null;
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nenhuma opção encontrada.',
  countLabel = (n) => `${n} ${n === 1 ? 'escolhido' : 'escolhidos'}`,
  name,
  ...field
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value.map((v) => byValue.get(v)).filter((o): o is MultiComboboxOption => Boolean(o));

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <FieldWrapper {...field}>
      {(control) => (
        <div className="flex flex-col gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            {name && <input type="hidden" name={name} value={value.join(',')} />}
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-controls={`${control.id}-listbox`}
                id={control.id}
                aria-describedby={control['aria-describedby']}
                aria-invalid={control['aria-invalid']}
                aria-required={control['aria-required']}
                disabled={control.disabled}
                className={cn(
                  'h-9 w-full justify-between bg-input-bg font-normal shadow-xs hover:bg-input-bg',
                  selected.length === 0 && 'text-muted-foreground',
                )}
              >
                <span className="truncate">{selected.length ? countLabel(selected.length) : placeholder}</span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0">
              <Command>
                <CommandInput placeholder={searchPlaceholder} />
                <CommandList id={`${control.id}-listbox`}>
                  <CommandEmpty>{emptyText}</CommandEmpty>
                  <CommandGroup>
                    {options.map((opt) => {
                      const marcado = value.includes(opt.value);
                      return (
                        <CommandItem
                          key={opt.value}
                          value={opt.value}
                          keywords={[opt.label, ...(opt.keywords ?? [])]}
                          disabled={opt.disabled}
                          data-checked={marcado || undefined}
                          onSelect={() => toggle(opt.value)}
                        >
                          <Check aria-hidden className={cn('size-4', marcado ? 'opacity-100' : 'opacity-0')} />
                          <Dot color={opt.dot} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {opt.label}
                              {marcado && <span className="sr-only"> (escolhido)</span>}
                            </span>
                            {opt.description && (
                              <span className="truncate text-xs text-muted-foreground">{opt.description}</span>
                            )}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selected.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Escolhidos">
              {selected.map((opt) => (
                <li
                  key={opt.value}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted py-0.5 pr-1 pl-2.5 text-sm"
                >
                  <Dot color={opt.dot} />
                  <span className="truncate">{opt.label}</span>
                  {!control.disabled && (
                    <button
                      type="button"
                      onClick={() => toggle(opt.value)}
                      aria-label={`Tirar ${opt.label}`}
                      className="rounded-full p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FieldWrapper>
  );
}

export default MultiCombobox;
