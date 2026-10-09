/**
 * Peças de tela da Área do Médium (out/2026) — o visual de aplicativo que substituiu a faixa areia,
 * os títulos em Fraunces e os rótulos em caixa-alta. Toda tela da Área monta com elas:
 *
 * - `MediumPage` + `MediumPageHeader`: coluna com respiro padrão e título da tela (sem serifa).
 * - `MediumSection`: bloco com título curto e, se houver, um link à direita ("Ver agenda").
 * - `MediumList` + `MediumListItem`: lista agrupada num cartão (Item do shadcn), linha com ícone em
 *   caixinha, título, descrição e seta — como "Comunicado da casa · Escala de trabalho" nos apps
 *   de terreiro. Linha com `href` vira link; com `onClick`, botão; sem nenhum, só informação.
 * - `IconTile`: a caixinha do ícone, no tom da marca (`bg-primary/10 text-brand`, travado nos
 *   testes de contraste) ou num tom de situação (`bg-X/15 text-X-strong`).
 * - `StatusBadge`: etiqueta de situação (Badge do shadcn) nos mesmos tons.
 *
 * Alvos de toque ≥ 48 px (P2) e ícone sempre com texto (P12): a linha inteira é o alvo.
 */
import React from 'react';
import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

export type MediumTom = 'marca' | 'sucesso' | 'atencao' | 'perigo' | 'info' | 'neutro';

const TILE_TOM: Record<MediumTom, string> = {
  marca: 'bg-primary/10 text-brand',
  sucesso: 'bg-success/15 text-success-strong',
  atencao: 'bg-warning/15 text-warning-strong',
  perigo: 'bg-destructive/15 text-destructive-strong',
  info: 'bg-info/15 text-info-strong',
  neutro: 'bg-muted text-muted-foreground',
};

/** Coluna padrão das telas da Área (abaixo do cabeçalho, acima da barra inferior). */
export function MediumPage({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-6 px-4 pt-5 pb-8', className)} {...rest} />;
}

export function MediumPageHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-base text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function MediumSection({
  id,
  title,
  action,
  className,
  children,
  ...rest
}: Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  /** Usado no `aria-labelledby`; precisa ser único na tela. */
  id: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby={id} {...rest}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 id={id} className="text-base leading-tight font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Link discreto à direita do título da seção ("Ver agenda"). */
export function MediumSectionLink({
  href,
  children,
  icon: Icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="-my-2 inline-flex min-h-12 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-brand outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
      {!Icon && <ChevronRight className="size-4" aria-hidden />}
    </Link>
  );
}

export function IconTile({
  icon: Icon,
  tom = 'marca',
  className,
}: {
  icon: LucideIcon;
  tom?: MediumTom;
  className?: string;
}) {
  return (
    <ItemMedia
      aria-hidden
      className={cn('size-11 rounded-xl [&_svg]:size-5', TILE_TOM[tom], className)}
    >
      <Icon />
    </ItemMedia>
  );
}

const BADGE_TOM: Record<MediumTom, string> = {
  marca: 'bg-primary/10 text-brand',
  sucesso: 'bg-success/15 text-success-strong',
  atencao: 'bg-warning/15 text-warning-strong',
  perigo: 'bg-destructive/15 text-destructive-strong',
  info: 'bg-info/15 text-info-strong',
  neutro: 'bg-muted text-muted-foreground',
};

export function StatusBadge({
  tom = 'neutro',
  className,
  ...rest
}: React.ComponentProps<typeof Badge> & { tom?: MediumTom }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent px-2.5 py-0.5 text-sm font-semibold', BADGE_TOM[tom], className)}
      {...rest}
    />
  );
}

/** Cartão branco com as linhas separadas por um fio (lista agrupada). */
export function MediumList({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  const linhas = React.Children.toArray(children).filter(Boolean);
  return (
    <ItemGroup
      className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-xs', className)}
      {...rest}
    >
      {linhas.map((linha, i) => (
        <React.Fragment key={(linha as React.ReactElement).key ?? i}>
          {i > 0 && <ItemSeparator aria-hidden />}
          <div role="listitem">{linha}</div>
        </React.Fragment>
      ))}
    </ItemGroup>
  );
}

export interface MediumListItemProps {
  icon?: LucideIcon;
  tom?: MediumTom;
  /** Mídia própria no lugar do ícone (ex.: caixinha de data). */
  media?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Etiquetas e detalhes embaixo da descrição. */
  meta?: React.ReactNode;
  /** Conteúdo à direita (antes da seta). */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}

export function MediumListItem({
  icon,
  tom,
  media,
  title,
  description,
  meta,
  trailing,
  href,
  onClick,
  className,
  'data-testid': testId,
}: MediumListItemProps) {
  const navega = Boolean(href || onClick);
  const corpo = (
    <>
      {media ?? (icon && <IconTile icon={icon} tom={tom} />)}
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="w-full text-base leading-snug font-semibold">{title}</ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-none text-sm text-pretty">
            {description}
          </ItemDescription>
        )}
        {meta && <div className="mt-1.5 flex flex-wrap gap-1.5">{meta}</div>}
      </ItemContent>
      {(trailing || navega) && (
        <ItemActions className="self-center">
          {trailing}
          {navega && <ChevronRight className="size-5 text-muted-foreground" aria-hidden />}
        </ItemActions>
      )}
    </>
  );
  const classes = cn(
    'min-h-16 flex-nowrap gap-3.5 rounded-none px-4 py-3.5',
    navega && 'active:bg-accent',
    className,
  );
  if (href) {
    return (
      <Item asChild className={classes}>
        <Link href={href} data-testid={testId}>
          {corpo}
        </Link>
      </Item>
    );
  }
  if (onClick) {
    return (
      <Item asChild className={classes}>
        <button type="button" onClick={onClick} className="w-full text-left" data-testid={testId}>
          {corpo}
        </button>
      </Item>
    );
  }
  return (
    <Item className={classes} data-testid={testId}>
      {corpo}
    </Item>
  );
}
