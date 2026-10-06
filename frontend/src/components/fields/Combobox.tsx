/**
 * Combobox — seleção com busca (Popover + Command). Para listas longas (médiuns, associados,
 * contas); para poucas opções fixas use o `Select` do shadcn.
 *
 *   <Combobox label="Médium" options={mediuns.map((m) => ({ value: m.id, label: m.nome }))}
 *             value={mediumId} onChange={setMediumId} placeholder="Selecione..." />
 *
 * `value` é o `value` da opção selecionada (ou null). A busca compara rótulo e `keywords`.
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

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Termos extras que a busca também considera. */
  keywords?: string[];
}

export interface ComboboxProps extends FieldBaseProps {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Mostra o "x" para limpar a seleção. */
  clearable?: boolean;
  /** Carregando opções (busca remota): mostra texto no lugar da lista vazia. */
  loading?: boolean;
  /** Busca controlada pelo chamador (ex.: consulta à API a cada digitação). */
  onSearchChange?: (term: string) => void;
  size?: 'small' | 'medium';
  name?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nenhuma opção encontrada.',
  clearable = false,
  loading = false,
  onSearchChange,
  size = 'medium',
  name,
  ...field
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  return (
    <FieldWrapper {...field}>
      {(control) => (
        <Popover open={open} onOpenChange={setOpen}>
          {name && <input type="hidden" name={name} value={value ?? ''} />}
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
                'w-full justify-between bg-input-bg font-normal shadow-xs hover:bg-input-bg',
                size === 'small' ? 'h-8 text-sm' : 'h-9',
                !selected && 'text-muted-foreground',
              )}
            >
              <span className="truncate">{selected ? selected.label : placeholder}</span>
              <span className="flex shrink-0 items-center gap-1">
                {clearable && selected && !control.disabled && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Limpar seleção"
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(null);
                      }
                    }}
                  >
                    <X className="size-3.5" />
                  </span>
                )}
                <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0"
          >
            <Command shouldFilter={!onSearchChange}>
              <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
              <CommandList id={`${control.id}-listbox`}>
                <CommandEmpty>{loading ? 'Carregando...' : emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      keywords={[opt.label, ...(opt.keywords ?? [])]}
                      disabled={opt.disabled}
                      onSelect={(v) => {
                        onChange(v === value && clearable ? null : v);
                        setOpen(false);
                      }}
                    >
                      <Check
                        aria-hidden
                        className={cn('size-4', opt.value === value ? 'opacity-100' : 'opacity-0')}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="truncate text-xs text-muted-foreground">{opt.description}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FieldWrapper>
  );
}

export default Combobox;
