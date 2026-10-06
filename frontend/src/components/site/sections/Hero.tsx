/**
 * Hero — capa do site: título, subtítulo, logo opcional e o CTA "Retirar senha".
 * Cor do texto por contraste (`heroForeground`); o CTA inverte a cor do texto.
 */
import React from 'react';
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { buttonVariants } from '@/components/ui/button';
import type { SectionConfig, SectionContext } from '../types';
import { heroBackground, heroForeground, marginPreset, senhaUrl } from '../lib';
import { FontLink, useSectionTypography } from './SectionShell';

const LOGO_SIZES: Record<string, { xs: number; md: number }> = {
  xl: { xs: 220, md: 300 },
  lg: { xs: 160, md: 200 },
  md: { xs: 100, md: 140 },
  sm: { xs: 68, md: 90 },
  xs: { xs: 44, md: 56 },
};

const PADDING_CLASS = {
  wide: 'px-[15px] @min-[900px]:px-[30px]',
  medium: 'px-[30px] @min-[900px]:px-[10%]',
  contained: 'px-6 @min-[900px]:px-12',
} as const;

const GAP_CLASS = {
  wide: 'gap-6 @min-[900px]:gap-16',
  medium: 'gap-6 @min-[900px]:gap-12',
  contained: 'gap-6 @min-[900px]:gap-8',
} as const;

export interface HeroProps {
  config: SectionConfig;
  ctx: SectionContext;
}

export function Hero({ config, ctx }: HeroProps) {
  const { fontFamily, fontStyle, importUrl } = useSectionTypography(config);
  const { background, bgType } = heroBackground(config);
  const fg = heroForeground(config);
  const ctaFg = pickForeground(fg);
  const preset = marginPreset(config);

  const titleSize = Number(config.font_size || 48);
  const titleWeight = Number(config.font_weight || 700);
  const subtitleSize = Math.max(16, Math.round(titleSize * 0.6));

  const title = String(config.title || '');
  const subtitle = String(config.subtitle || '');
  const logoUrl = config.logo_image_url ? String(config.logo_image_url) : '';
  const showLogo = String(config.logo_mode || 'none') === 'logo' && Boolean(logoUrl);
  const logoRight = String(config.logo_position || 'left') === 'right';
  const logoSize = LOGO_SIZES[String(config.logo_size || 'md')] ?? LOGO_SIZES.md;
  const isPreview = ctx.mode === 'preview';

  const logo = showLogo ? (
    // Imagem enviada pelo terreiro, servida pela nossa API — não passa pelo otimizador.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className="size-[var(--logo-xs)] shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] @min-[900px]:size-[var(--logo-md)]"
      style={{ '--logo-xs': `${logoSize.xs}px`, '--logo-md': `${logoSize.md}px` } as React.CSSProperties}
    />
  ) : null;

  return (
    <section
      data-slot="site-section"
      data-section="hero"
      aria-label="Capa"
      className={cn(
        'flex min-h-[380px] flex-col items-center justify-center py-12 text-center text-[var(--fg)]',
        showLogo && '@min-[900px]:flex-row',
        showLogo && preset === 'wide' ? '@min-[900px]:justify-between' : 'justify-center',
        showLogo ? GAP_CLASS[preset] : 'gap-0',
        PADDING_CLASS[preset],
      )}
      style={{ background, fontFamily, fontStyle, '--fg': fg } as React.CSSProperties}
    >
      <FontLink url={importUrl} />
      {bgType === 'image' && !config.bg_image_url && isPreview && (
        <p className="absolute text-xs opacity-60">sem imagem</p>
      )}
      {!logoRight && logo}
      <div className="flex min-w-0 max-w-[720px] flex-col items-center">
        <h1
          className="leading-[1.15] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]"
          style={{
            fontSize: `clamp(${Math.round(titleSize * 0.55)}px, ${((titleSize / 1280) * 100).toFixed(2)}cqw, ${titleSize}px)`,
            fontWeight: titleWeight,
          }}
        >
          {title || (isPreview ? 'Nome do terreiro' : '')}
        </h1>
        {subtitle && (
          <p
            className="mt-4 max-w-[640px] opacity-90 [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]"
            style={{ fontSize: `clamp(16px, ${((subtitleSize / 1280) * 100).toFixed(2)}cqw, ${subtitleSize}px)` }}
          >
            {subtitle}
          </p>
        )}
        <a
          href={senhaUrl(ctx.slug)}
          data-testid="hero-cta"
          tabIndex={isPreview ? -1 : undefined}
          aria-disabled={isPreview || undefined}
          onClick={isPreview ? (e) => e.preventDefault() : undefined}
          className={cn(
            buttonVariants({ size: 'touch' }),
            'mt-8 bg-[var(--cta-bg)] text-[var(--cta-fg)] shadow-lg hover:bg-[var(--cta-bg)] hover:opacity-90 focus-visible:ring-[var(--cta-bg)]/60',
          )}
          style={{ '--cta-bg': fg, '--cta-fg': ctaFg, fontFamily } as React.CSSProperties}
        >
          <Ticket aria-hidden />
          Retirar senha
        </a>
      </div>
      {logoRight && logo}
    </section>
  );
}

export default Hero;
