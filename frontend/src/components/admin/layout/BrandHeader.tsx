/**
 * BrandHeader — topo da barra lateral (jornadas v2, J1 · 11): a marca GiraHub e, abaixo, a casa num
 * bloco — o logo (ou as iniciais na cor da casa), o nome e a linha do plano, que leva à assinatura.
 * No modo recolhido (ícones) mostra só o avatar da casa.
 */
import React from 'react';
import Link from 'next/link';
import { useTenant } from '@/providers/ThemeProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';

export interface BrandHeaderProps {
  /** Compacto (sidebar recolhida em ícones). */
  collapsed?: boolean;
  /** Linha do plano sob o nome da casa ("Plano Basic", "Premium · mês grátis"). */
  plano?: string | null;
}

const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function iniciais(nome: string): string {
  const partes = nome.split(/\s+/).filter((p) => p && !LIGACOES.has(p.toLowerCase()));
  const sem = partes.filter((p) => !/^(terreiro|tenda|casa|centro|templo|ylê|ile|ilê)$/i.test(p));
  const usar = (sem.length ? sem : partes).slice(0, 2);
  return usar.map((p) => p.charAt(0).toUpperCase()).join('') || 'T';
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({ collapsed = false, plano }) => {
  const { tenantName, logoUrl } = useTenant();
  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const nome = tenantName || 'Meu Terreiro';

  return (
    <div
      data-slot="brand-header"
      className="flex flex-col gap-3 px-3 pt-4 pb-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1"
    >
      {!collapsed && <GiraHubLogo className="px-1 text-sidebar-foreground group-data-[collapsible=icon]:hidden" />}
      <div className="flex items-center gap-2.5 rounded-lg bg-sidebar-accent px-2.5 py-2 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
        <Avatar className="size-8 shrink-0">
          {logoUrl && !logoFailed && (
            <AvatarImage src={logoUrl} alt="Logo do terreiro" onError={() => setLogoFailed(true)} className="object-cover" />
          )}
          <AvatarFallback className="bg-primary text-[0.75rem] font-bold text-primary-foreground">{iniciais(nome)}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm leading-tight font-semibold text-sidebar-foreground">{nome}</p>
            {plano && (
              <Link
                href="/admin/billing"
                className="block truncate text-[0.75rem] font-medium text-[color:var(--color-ouro-300)] hover:underline"
                aria-label={`${plano} — ver assinatura`}
              >
                {plano}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandHeader;
