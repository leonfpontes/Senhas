/**
 * StylePanel — botão "Estilo" do novo construtor (beta "Novo construtor do site"): troca
 * cores e fontes do site inteiro de uma vez. "Cores da casa" vem primeiro.
 */
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SITE_STYLES, houseStyle, type SiteStyle } from '../styles';

function useHouseColors(open: boolean): { primary: string; secondary: string } | null {
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

export function StylePanel({
  open,
  onOpenChange,
  activeId,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string | null;
  onApply: (style: SiteStyle) => void;
}) {
  const house = useHouseColors(open);
  const styles = house ? [houseStyle(house.primary, house.secondary), ...SITE_STYLES] : SITE_STYLES;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Estilo do site</SheetTitle>
          <SheetDescription>Muda cores e fontes do site todo. Textos, fotos e ordem ficam como estão. Dá para desfazer.</SheetDescription>
        </SheetHeader>
        <ul role="radiogroup" aria-label="Estilos" className="flex list-none flex-col gap-3 overflow-y-auto p-4">
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
                  <span className="flex w-24 shrink-0 flex-col" aria-hidden>
                    <span className="flex flex-1 items-center justify-center text-2xl text-white" style={{ background: `linear-gradient(135deg, ${s.heroFrom}, ${s.heroTo})`, fontFamily: s.titleFont }}>
                      Aa
                    </span>
                    <span className="flex h-4">
                      <span className="flex-1" style={{ background: s.bg }} />
                      <span className="flex-1" style={{ background: s.bgAlt }} />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-3">
                    <span className="flex items-center justify-between font-semibold">
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
      </SheetContent>
    </Sheet>
  );
}
