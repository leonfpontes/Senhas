/**
 * SectionShell — moldura comum das seções do site: fundo (cor + transparência),
 * fonte do Google (via <Head>), cor de texto por contraste e container por
 * "margem lateral".
 *
 * Valores dinâmicos vão em `style`/variáveis CSS (`--fg`); as classes Tailwind
 * são estáticas. Responsividade por container query (`@min-[900px]`), para a
 * mesma seção servir o site público e o quadro da prévia.
 */
import React from 'react';
import Head from 'next/head';
import { cn } from '@/lib/utils';
import type { SectionConfig } from '../types';
import { MARGIN_CONTAINER_CLASS, fontImportUrl, marginPreset, sectionBackground, sectionForeground } from '../lib';

export interface SectionShellProps {
  config: SectionConfig;
  /** Cor de fundo padrão quando `bg_color` não está definido. */
  defaultBg: string;
  defaultFg?: string;
  /** Classe do `<section>` (fundo). */
  className?: string;
  /** Classe do container interno. */
  innerClassName?: string;
  /** `false` para seções que controlam o próprio container (Hero). */
  withContainer?: boolean;
  children: React.ReactNode;
  id?: string;
  'aria-label'?: string;
  'data-section'?: string;
}

export function useSectionTypography(config: SectionConfig) {
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  return {
    fontFamily,
    fontStyle: String(config.font_style || 'normal'),
    importUrl: fontImportUrl(fontFamily),
  };
}

/** `<link>` da fonte do Google, deduplicado pelo `key`. */
export function FontLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Head>
      <link key={`site-font-${url}`} rel="stylesheet" href={url} />
    </Head>
  );
}

export function SectionShell({
  config,
  defaultBg,
  defaultFg = '#111111',
  className,
  innerClassName,
  withContainer = true,
  children,
  id,
  'aria-label': ariaLabel,
  'data-section': dataSection,
}: SectionShellProps) {
  const { fontFamily, fontStyle, importUrl } = useSectionTypography(config);
  const background = sectionBackground(config, defaultBg);
  const fg = sectionForeground(config, defaultBg, defaultFg);
  const preset = marginPreset(config);

  return (
    <section
      id={id}
      aria-label={ariaLabel}
      data-slot="site-section"
      data-section={dataSection}
      className={cn('py-12 text-[var(--fg)] @min-[900px]:py-16', className)}
      style={{ background, fontFamily, fontStyle, '--fg': fg } as React.CSSProperties}
    >
      <FontLink url={importUrl} />
      {withContainer ? (
        <div className={cn(MARGIN_CONTAINER_CLASS[preset], innerClassName)}>{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

/** Título de seção com tamanho/peso vindos da config. */
export function SectionTitle({
  config,
  children,
  className,
  defaultSize = 28,
  as: Tag = 'h2',
}: {
  config: SectionConfig;
  children: React.ReactNode;
  className?: string;
  defaultSize?: number;
  as?: 'h2' | 'h3' | 'p';
}) {
  const size = Number(config.title_font_size || defaultSize);
  const weight = Number(config.title_font_weight || 700);
  return (
    <Tag
      className={cn('mb-4 leading-tight', className)}
      style={{ fontSize: `clamp(${Math.round(size * 0.78)}px, ${((size / 1280) * 100).toFixed(2)}cqw, ${size}px)`, fontWeight: weight }}
    >
      {children}
    </Tag>
  );
}

/** Texto de corpo com tamanho/peso vindos da config. */
export function SectionBody({
  config,
  children,
  className,
  defaultSize = 16,
  as: Tag = 'p',
}: {
  config: SectionConfig;
  children: React.ReactNode;
  className?: string;
  defaultSize?: number;
  as?: 'p' | 'div';
}) {
  const size = Number(config.body_font_size || defaultSize);
  const weight = Number(config.body_font_weight || 400);
  return (
    <Tag className={cn('leading-relaxed whitespace-pre-line', className)} style={{ fontSize: size, fontWeight: weight }}>
      {children}
    </Tag>
  );
}

/** Placeholder discreto da prévia quando um campo ainda está vazio. */
export function PreviewHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-sm italic opacity-50', className)}>{children}</p>;
}
