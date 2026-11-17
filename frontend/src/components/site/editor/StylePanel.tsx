/**
 * StylePanel — estilos prontos do novo construtor (beta "Novo construtor do site"): troca
 * cores e fontes do site inteiro de uma vez. "Cores da casa" vem primeiro.
 */
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';
import { SITE_STYLES, houseStyle, type SiteStyle } from '../styles';

export function useHouseColors(open: boolean): { primary: string; secondary: string } | null {
  const [colors, setColors] = useState<{ primary: string; secondary: string } | null>(null);
  useEffect(() => {
    if (!open || colors) return;
    apiClient
      .get('/api/v1/admin/tenant/branding')
      .then((res) => {
        const b = res.data ?? {};
        const p = typeof b.primary_color === 'string' ? b.primary_color : '';
        const s = typeof b.secondary_color === 'string' ? b.secondary_color : '';
        // Índigo e lilás eram o padrão antigo do painel, não escolha da casa.
        if (p && p.toLowerCase() !== '#4f46e5') setColors({ primary: p, secondary: s && s.toLowerCase() !== '#818cf8' ? s : '#E9B04A' });
      })
      .catch(() => undefined);
  }, [open, colors]);
  return colors;
}

/** Lista de estilos prontos (radio). Usada no Sheet e no painel lateral do estúdio. */
export function StyleChoices({ activeId, onApply, load = true }: { activeId: string | null; onApply: (style: SiteStyle) => void; load?: boolean }) {
  const house = useHouseColors(load);
  const styles = house ? [houseStyle(house.primary, house.secondary), ...SITE_STYLES] : SITE_STYLES;
  return (
    <ul role="radiogroup" aria-label="Estilos" className="flex list-none flex-col gap-3 p-0">
      {styles.map((s) => {
        const selected = activeId === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onApply(s)}
              className={cn(
                'flex w-full items-stretch gap-3 overflow-hidden rounded-xl border-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                selected ? 'border-brand' : 'border-border hover:border-foreground/40',
              )}
            >
              <span className="flex w-20 shrink-0 flex-col" aria-hidden>
                <span className="flex flex-1 items-center justify-center text-2xl text-white" style={{ background: `linear-gradient(135deg, ${s.heroFrom}, ${s.heroTo})`, fontFamily: s.titleFont }}>
                  Aa
                </span>
                <span className="flex h-4">
                  <span className="flex-1" style={{ background: s.bg }} />
                  <span className="flex-1" style={{ background: s.bgAlt }} />
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 pr-3">
                <span className="flex items-center justify-between text-sm font-semibold">
                  {s.label}
                  {selected && <Check className="size-4 text-brand" aria-hidden />}
                </span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
