/**
 * Utilitários do Bilhete (jornada pública do consulente).
 *
 * Tipo do bilhete = `PublicTicketResponse` do backend
 * (GET /api/v1/public/{tenant_slug}/ticket/{ticket_id}), mais os formatadores de data,
 * o gerador de .ics e o link do WhatsApp. Movidos de `pages/public/[tenant]/ticket/[ticketId].tsx`
 * para serem reutilizados na emissão, na fila de espera e no cancelamento.
 */

export interface Acompanhante {
  ticket_number: string;
  name: string;
}

export interface PublicTicket {
  ticket_number: string;
  status: string;
  status_label: string;
  waitlisted: boolean;
  cancellable: boolean;
  cancel_reason: string | null;
  gira_name: string;
  gira_date: string;
  gira_date_iso: string | null;
  gira_local: string | null;
  horario: string | null;
  recados: string | null;
  tenant_name: string;
  tenant_slug: string;
  tenant_address: string | null;
  maps_url: string | null;
  tenant_logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  consulente_name: string;
  acompanhantes: Acompanhante[];
}

/** Status em que a senha não vale mais para o dia (sem ações de agenda/cancelar). */
export const DONE_STATUSES = new Set(['cancelled', 'no_show', 'waitlist_expired', 'completed']);

export function isTicketDone(ticket: Pick<PublicTicket, 'status'>): boolean {
  return DONE_STATUSES.has(ticket.status);
}

/** "Quinta-feira, 8 de outubro às 19h" a partir do ISO; cai no texto do backend se faltar. */
export function formatGiraDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo',
  }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace(':00', 'h').replace(':', 'h');
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} às ${hora}`;
}

/** "qui, 8 de out · 19h" — versão curta para o cabeçalho da casca pública. */
export function formatGiraDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo',
  }).format(d).replace(/\./g, '');
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace(':00', 'h').replace(':', 'h');
  return `${dia} · ${hora}`;
}

/** Evento .ics de 2h começando na gira (ou no horário escolhido, se houver). */
export function buildIcs(t: PublicTicket): string | null {
  if (!t.gira_date_iso) return null;
  const start = new Date(t.gira_date_iso);
  if (Number.isNaN(start.getTime())) return null;
  if (t.horario) {
    // Horário escolhido é no fuso de Brasília (UTC-3 fixo desde 2019): troca só a hora, mantém o dia da gira.
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
    const chosen = new Date(`${ymd}T${t.horario}:00-03:00`);
    if (!Number.isNaN(chosen.getTime())) start.setTime(chosen.getTime());
  }
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const location = [t.gira_local, t.tenant_address].filter(Boolean).join(' · ');
  const description = [`Senha ${t.ticket_number}`, t.recados].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GiraHub//Senha//PT', 'BEGIN:VEVENT',
    `UID:${t.tenant_slug}-${t.ticket_number}-${stamp(start)}@girahub`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${t.gira_name} — ${t.tenant_name}`)}`,
    location ? `LOCATION:${esc(location)}` : '',
    `DESCRIPTION:${esc(description)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** Dispara o download de um arquivo .ics no navegador. */
export function downloadIcs(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Texto do bilhete para compartilhar (WhatsApp). */
export function buildShareText(t: PublicTicket, link?: string): string {
  const linhas = [
    `Senha ${t.ticket_number} — ${t.gira_name}`,
    t.tenant_name,
    formatGiraDate(t.gira_date_iso, t.gira_date),
    t.horario ? `Horário escolhido: ${t.horario}` : null,
    [t.gira_local, t.tenant_address].filter(Boolean).join(' · ') || null,
    link ?? null,
  ];
  return linhas.filter(Boolean).join('\n');
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Agenda do terreiro — destino de "Ver próximas giras".
 *
 * `/{slug}` mostra o site publicado e, sem site publicado, a agenda pública de giras
 * (pages/[tenantSlug]/index.tsx). Não usar `/public/{slug}`: ela redireciona para a
 * próxima gira com emissão — em geral a mesma gira de onde a pessoa veio.
 */
export function tenantAgendaPath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

/** Página do bilhete (mesmo formato do `rescue_link` do backend, mas relativo). */
export function ticketPagePath(slug: string, ticketId: string): string {
  return `/public/${encodeURIComponent(slug)}/ticket/${encodeURIComponent(ticketId)}`;
}

/** Último segmento de um link do tipo .../ticket/{id} (rescue_link do emit-ticket). */
export function ticketIdFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const clean = link.split(/[?#]/)[0].replace(/\/+$/, '');
  const last = clean.split('/').pop();
  return last && last.length > 0 ? last : null;
}
