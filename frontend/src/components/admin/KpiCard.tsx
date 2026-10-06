/**
 * KpiCard — card de indicador (único no app; `components/platform/KpiCard.tsx` reexporta este).
 *
 *   <KpiCard label="Receita" value="R$ 1.200" icon={<Wallet />} color="#10b981" subtitle="+12%" />
 *
 * `color` tinge o ícone (fundo a 13%, ícone na cor). `highlight` acrescenta a linha de destaque no
 * topo (usado no observatório da plataforma). `sub` e `glow` existem só por compatibilidade com as
 * chamadas antigas da plataforma — prefira `subtitle`.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
  label:     string;
  value:     string | number;
  icon?:     React.ReactNode;
  /** Cor (hex/rgb) do ícone e do destaque; padrão: cor primária do terreiro. */
  color?:    string;
  loading?:  boolean;
  subtitle?: string;
  /** @deprecated use `subtitle`. */
  sub?:      string;
  /** Linha de destaque no topo do card na cor `color`. */
  highlight?: boolean;
  /** @deprecated sem efeito — mantido para as chamadas antigas da plataforma. */
  glow?:     string;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label, value, icon, color, loading, subtitle, sub, highlight, className,
}) => {
  const accent = color ?? 'var(--primary-text)';
  const caption = subtitle ?? sub;

  return (
    <Card
      data-slot="kpi-card"
      className={cn('relative h-full gap-0 overflow-hidden py-5', className)}
      style={highlight ? { borderColor: `color-mix(in srgb, ${accent} 25%, transparent)` } : undefined}
    >
      {highlight && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      )}
      <div className="flex items-start justify-between gap-2 px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">{label}</p>
          {loading ? (
            <Skeleton data-testid="kpi-skeleton" className="mt-1.5 h-8 w-20" />
          ) : (
            <p className="mt-1 text-2xl leading-none font-extrabold tracking-tight text-foreground">{value}</p>
          )}
          {caption && <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>}
        </div>
        {icon && (
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[1.4rem]"
            style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)` }}
          >
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
};

export default KpiCard;
