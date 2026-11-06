/**
 * PublicShell — casca das páginas públicas do consulente (/public/*).
 *
 * Cabeçalho compacto do terreiro (logo 40px, nome, linha curta), fundo claro, coluna de
 * 28rem, base 16px. As cores do terreiro entram como variáveis CSS no wrapper
 * (`--primary`, `--primary-foreground`, ...), então `bg-primary`/`text-primary-foreground`
 * dos componentes shadcn mostram a marca sem tocar no <html> (o TenantAwareThemeProvider
 * só conhece o tenant logado, não o terreiro visitado).
 *
 *   <PublicShell title="Senha 0042 · Tenda" tenantName="Tenda" logoUrl={logo} subtitle="qui, 8 de out · 19h"
 *                brand={{ primary: '#2E7D32' }} footer={<Button size="touch" className="w-full">Pegar minha senha</Button>}>
 *     ...
 *   </PublicShell>
 */
import React from 'react';
import Head from 'next/head';
import { cn } from '@/lib/utils';
import { WCAG_AA_CONTRAST, contrastRatio, corDaCasa, parseColor, pickForeground } from '@/lib/brand';
import PoweredByGiraHubFooter from '@/components/shared/PoweredByGiraHubFooter';
import { fraunces } from '@/components/landing/fonts';

export interface PublicBrand {
  primary?: string | null;
  secondary?: string | null;
  font?: string | null;
}

export interface PublicShellProps {
  /** `<title>` da página. */
  title: string;
  description?: string;
  /** Páginas com dados pessoais (bilhete, cancelamento) não devem ser indexadas. */
  noindex?: boolean;
  tenantName?: string | null;
  logoUrl?: string | null;
  /** Linha curta sob o nome (data da gira, "Inscrição em curso"...). */
  subtitle?: React.ReactNode;
  /** Conteúdo extra à direita do cabeçalho (ex.: selo "Associado"). */
  headerExtra?: React.ReactNode;
  brand?: PublicBrand;
  /** Barra fixa no rodapé (CTA principal). O conteúdo ganha respiro para não ficar coberto. */
  footer?: React.ReactNode;
  /** Oculta o cabeçalho do terreiro (páginas sem tenant resolvido). */
  hideHeader?: boolean;
  /** Coluna de 42rem em vez de 28rem (formulários longos, como a inscrição em curso). */
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Casa sem cor escolhida: verde folha do GiraHub (ADR 0011 do design system, jornadas v2). */
export const DEFAULT_PUBLIC_PRIMARY = '#2E6A4E';

/**
 * Cor da marca para TEXTO sobre o fundo claro da casca (links, número do bilhete).
 * Primárias claras (amarelo, verde-limão) somem no branco: escurece em passos de 10%
 * em direção ao preto até atingir contraste AA (4,5) com o branco. Use `text-(color:--brand-text)`
 * no lugar de `text-primary` dentro do PublicShell; `bg-primary` + `text-primary-foreground`
 * continuam corretos para botões.
 */
export function brandTextColor(primary: string): string {
  const rgb = parseColor(primary);
  if (!rgb) return primary;
  for (let i = 0; i <= 10; i += 1) {
    const f = 1 - i / 10;
    const hex = `#${rgb.map((c) => Math.round(c * f).toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(hex, '#ffffff') >= WCAG_AA_CONTRAST) return i === 0 ? primary : hex;
  }
  return '#000000';
}

/** Variáveis CSS da marca para o wrapper. Exportado para testes e para quem precisar só das cores. */
export function brandStyle(brand?: PublicBrand): React.CSSProperties {
  const primary = corDaCasa(brand?.primary) || DEFAULT_PUBLIC_PRIMARY;
  const secondary = brand?.secondary?.trim() || primary;
  return {
    '--primary': primary,
    '--primary-foreground': pickForeground(primary, brand?.font ?? undefined),
    '--secondary': secondary,
    '--secondary-foreground': pickForeground(secondary),
    '--ring': primary,
    '--brand-text': brandTextColor(primary),
  } as React.CSSProperties;
}

export function PublicShell({
  title,
  description,
  noindex,
  tenantName,
  logoUrl,
  subtitle,
  headerExtra,
  brand,
  footer,
  hideHeader,
  wide,
  className,
  children,
}: PublicShellProps) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const column = wide ? 'max-w-2xl' : 'max-w-md';
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const initial = (tenantName || '').trim().charAt(0).toUpperCase();
  // "Terreiro Filhos de Fé" → "FF": as iniciais das palavras principais (sem "de", "do", "da"…).
  const iniciais =
    (tenantName || '')
      .split(/\s+/)
      .filter((w) => w && !/^(de|da|do|das|dos|e|terreiro|tenda|casa|centro)$/i.test(w))
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || initial;

  // A barra fixa de baixo muda de altura (botão, prazo, aviso de dados, quebra de linha no celular):
  // o fim do conteúdo reserva a altura REAL dela, para o "Powered by GiraHub" não ficar por baixo.
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const [footerHeight, setFooterHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = footerRef.current;
    if (!footer || !el) return;
    const medir = () => setFooterHeight(el.getBoundingClientRect().height);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [footer]);

  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        {noindex && <meta name="robots" content="noindex" />}
      </Head>
      <div
        data-slot="public-shell"
        style={{
          ...brandStyle(brand),
          // A altura medida já inclui o env(safe-area-inset-bottom) da barra; mais 1rem de respiro.
          ...(footer && footerHeight !== null ? { paddingBottom: `calc(${footerHeight}px + 1rem)` } : {}),
        }}
        className={cn(
          // Jornada 3 v2: superfície "terra" (areia + tinta, títulos em Fraunces); a cor da casa continua no --primary.
          fraunces.variable,
          'public-terra flex min-h-screen flex-col bg-background text-base text-foreground antialiased',
          footer && footerHeight === null && 'pb-[calc(11rem+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {!hideHeader && (tenantName || logoUrl) && (
          // Jornada 3 v2: a faixa na cor da casa, com a inicial num círculo claro e o endereço da casa.
          <header className="bg-primary text-primary-foreground">
            <div className={cn('mx-auto flex w-full items-center gap-3 px-4 py-3.5', column)}>
              {showLogo ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo de terreiro vem de host não allow-listado; onError cai na inicial
                <img
                  src={logoUrl as string}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-full bg-white object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[color:var(--brand-text,#2E6A4E)]"
                >
                  {iniciais || '•'}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1.0625rem] font-semibold leading-tight">{tenantName}</p>
                {subtitle && <p className="truncate text-sm opacity-90">{subtitle}</p>}
              </div>
              {headerExtra}
            </div>
          </header>
        )}

        <main className={cn('mx-auto flex w-full flex-1 flex-col gap-4 px-4 py-4', column)}>
          {children}
          <PoweredByGiraHubFooter />
        </main>

        {footer && (
          <div
            ref={footerRef}
            data-slot="public-shell-footer"
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className={cn('mx-auto w-full px-4 py-3', column)}>{footer}</div>
          </div>
        )}
      </div>
    </>
  );
}

export default PublicShell;
