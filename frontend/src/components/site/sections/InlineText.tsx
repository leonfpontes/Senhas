/**
 * InlineText — texto do site que vira editável na prévia do editor (beta "Novo construtor
 * do site"). No site público e na prévia sem edição, é só o texto.
 *
 * Por que não controlado: o React não pode reescrever o conteúdo de um `contentEditable`
 * enquanto a pessoa digita (o cursor pula). O texto entra pelo `textContent` quando o
 * elemento não está em foco, e cada tecla grava na config (`edit.patch`), para o painel
 * lateral e o desfazer acompanharem.
 */
import React, { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { SectionEdit } from '../types';

type Tag = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'dt' | 'dd';

export interface InlineTextProps {
  value: string;
  /** Chave da config que este texto edita. */
  field: string;
  edit?: SectionEdit;
  as?: Tag;
  /** Permite Enter (quebra de linha). Título é uma linha só. */
  multiline?: boolean;
  /** Mostrado em cinza na prévia quando o texto está vazio. */
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Grava fora da config direta (itens de lista): recebe o texto novo. */
  onText?: (text: string) => void;
}

export function InlineText({ value, field, edit, as: Tag = 'span', multiline, placeholder, className, style, onText }: InlineTextProps) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !edit) return;
    if (document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value, edit]);

  if (!edit) {
    if (!value) return null;
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }

  const write = (text: string) => (onText ? onText(text) : edit.patch({ [field]: text }));

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline || undefined}
      aria-label={placeholder}
      spellCheck
      data-inline-text={field}
      data-placeholder={placeholder}
      className={cn(
        'cursor-text rounded-sm outline-none [overflow-wrap:anywhere]',
        'hover:outline-dashed hover:outline-1 hover:outline-offset-4 focus:outline-2 focus:outline-solid focus:outline-offset-4 focus:outline-[#2E6A4E]',
        'empty:before:pointer-events-none empty:before:italic empty:before:opacity-50 empty:before:content-[attr(data-placeholder)]',
        multiline && 'whitespace-pre-line',
        className,
      )}
      style={style}
      onInput={(e) => write((e.currentTarget as HTMLElement).innerText.replace(/\n$/, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
      }}
      onPaste={(e) => {
        // Cola só o texto, sem formatação de outro site.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
      }}
    />
  );
}

export default InlineText;
