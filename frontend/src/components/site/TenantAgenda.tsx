/**
 * TenantAgenda — agenda pública do terreiro quando ele ainda não publicou o site.
 *
 * Destino de "Ver próximas giras" (bilhete, cancelamento, fila de espera): /{slug} mostra o
 * site publicado e, sem site, esta lista (GET /api/v1/public/agenda/{slug}) em vez do
 * "Site em preparação" sem saída. Reaproveita o calendário do site (modo lista).
 */
import React from 'react';
import { PublicShell } from '@/components/public';
import { GirasCalendar } from './sections/GirasCalendar';
import type { SiteGira } from './types';

export interface TenantAgendaData {
  tenant_name: string;
  tenant_slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  upcoming_giras: SiteGira[];
}

export function TenantAgenda({ agenda }: { agenda: TenantAgendaData }) {
  const brand = agenda.primary_color || undefined;
  return (
    <PublicShell
      title={`Próximas giras · ${agenda.tenant_name}`}
      description={`Agenda de giras de ${agenda.tenant_name}`}
      tenantName={agenda.tenant_name}
      logoUrl={agenda.logo_url}
      subtitle="Agenda de giras"
      brand={{ primary: agenda.primary_color, secondary: agenda.secondary_color }}
    >
      <div className="@container -mx-4 -my-8">
        <GirasCalendar
          config={{ display_mode: 'list', title: 'Próximas giras', bg_opacity: 0, title_font_size: 24 }}
          ctx={{ mode: 'public', slug: agenda.tenant_slug, giras: agenda.upcoming_giras, brandColor: brand }}
        />
      </div>
    </PublicShell>
  );
}

export default TenantAgenda;
