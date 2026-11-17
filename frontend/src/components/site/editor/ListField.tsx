/**
 * ListField — lista de itens editável no painel (linhas de trabalho, rotina, perguntas…):
 * cada item é um cartão com seus campos, mover para cima/baixo e remover. Remover não
 * pede confirmação porque o desfazer devolve o item.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/fields';

export interface ListFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

type Item = Record<string, unknown>;

export function ListField({
  items,
  onChange,
  fields,
  addLabel,
  itemLabel,
  max = 30,
  suggestions,
}: {
  items: Item[];
  onChange: (items: Item[]) => void;
  fields: ListFieldDef[];
  addLabel: string;
  /** Nome curto de cada item ("Linha 1"). */
  itemLabel: (i: number) => string;
  max?: number;
  /** Itens prontos que a casa pode adicionar com um toque (ex.: perguntas comuns). */
  suggestions?: { label: string; item: Item }[];
}) {
  const set = (i: number, key: string, value: string) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const empty = Object.fromEntries(fields.map((f) => [f.key, '']));
  const unused = (suggestions ?? []).filter((s) => !items.some((it) => JSON.stringify(it) === JSON.stringify(s.item)));

  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1">
            <span className="mr-auto text-xs font-semibold text-muted-foreground">{itemLabel(i)}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Subir ${itemLabel(i)}`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Descer ${itemLabel(i)}`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${itemLabel(i)}`} className="text-destructive hover:text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
          {fields.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={String(it[f.key] ?? '')}
              placeholder={f.placeholder}
              multiline={f.multiline}
              rows={f.multiline ? 3 : undefined}
              onChange={(e) => set(i, f.key, e.target.value)}
            />
          ))}
        </div>
      ))}
      {items.length < max && (
        <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...items, empty])}>
          <Plus aria-hidden /> {addLabel}
        </Button>
      )}
      {unused.length > 0 && items.length < max && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Sugestões para começar (a resposta é sempre da casa):</span>
          <div className="flex flex-wrap gap-2">
            {unused.map((s) => (
              <Button key={s.label} type="button" variant="secondary" size="sm" onClick={() => onChange([...items, s.item])}>
                <Plus aria-hidden /> {s.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
