/**
 * /[tenantSlug] sem site publicado: agenda pública de giras em vez do "Site em preparação".
 * E o Bilhete: "Ver próximas giras" vai para /{slug}; WhatsApp usa a página do bilhete.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import TenantPublicSitePage from '../../pages/[tenantSlug]/index';
import { Bilhete, errorCode, isTimeSlotError, type PublicTicket } from '../../components/public';

const AGENDA = {
  tenant_name: 'Tenda Luz',
  tenant_slug: 'tenda-luz',
  logo_url: null,
  primary_color: '#2E7D32',
  secondary_color: null,
  upcoming_giras: [
    {
      id: 'g1',
      nome: 'Gira de Pretos Velhos',
      data_hora: new Date(Date.now() + 3 * 86400000).toISOString(),
      descricao: null,
      has_tickets: true,
      has_sponsor_tickets: false,
      release_start_at: null,
      release_end_at: null,
    },
  ],
};

const TICKET: PublicTicket = {
  ticket_number: '0007',
  status: 'emitted',
  status_label: 'Confirmada',
  waitlisted: false,
  cancellable: true,
  cancel_reason: null,
  gira_name: 'Gira de Pretos Velhos',
  gira_date: '10/10/2026 às 19:00',
  gira_date_iso: null,
  gira_local: null,
  horario: null,
  recados: null,
  tenant_name: 'Tenda Luz',
  tenant_slug: 'tenda-luz',
  tenant_address: null,
  maps_url: null,
  tenant_logo_url: null,
  primary_color: null,
  secondary_color: null,
  consulente_name: 'Maria',
  acompanhantes: [],
};

describe('Agenda pública do terreiro', () => {
  it('sem site publicado mostra as próximas giras com link de senha', () => {
    render(<TenantPublicSitePage site={null} agenda={AGENDA} />);
    expect(screen.getAllByText('Gira de Pretos Velhos').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Retire sua senha/i })[0]).toHaveAttribute('href', '/public/gira/g1');
    expect(screen.queryByText(/Site em preparação/)).not.toBeInTheDocument();
  });

  it('slug que não é terreiro continua em "Site em preparação"', () => {
    render(<TenantPublicSitePage site={null} agenda={null} />);
    expect(screen.getByText(/Site em preparação/)).toBeInTheDocument();
  });
});

describe('Bilhete — links', () => {
  it('"Ver próximas giras" vai para a agenda e o WhatsApp leva a página do bilhete', () => {
    render(<Bilhete ticket={TICKET} ticketId="abc-123" />);
    expect(screen.getByRole('link', { name: /Ver próximas giras/i })).toHaveAttribute('href', '/tenda-luz');
    const wa = decodeURIComponent(screen.getByRole('link', { name: /Enviar no WhatsApp/i }).getAttribute('href') || '');
    expect(wa).toContain('/public/tenda-luz/ticket/abc-123');
  });

  it('shareLink explícito tem prioridade', () => {
    render(<Bilhete ticket={TICKET} shareLink="https://x.test/public/tenda-luz/ticket/zzz" />);
    const wa = decodeURIComponent(screen.getByRole('link', { name: /Enviar no WhatsApp/i }).getAttribute('href') || '');
    expect(wa).toContain('https://x.test/public/tenda-luz/ticket/zzz');
  });
});

describe('error_code da emissão', () => {
  it('lê do corpo {error_code} e reconhece recusas por horário', () => {
    const err = { status: 410, response: { data: { error_code: 'TIME_SLOT_FULL', message: 'x' } } };
    expect(errorCode(err)).toBe('TIME_SLOT_FULL');
    expect(isTimeSlotError(err)).toBe(true);
    expect(isTimeSlotError({ status: 410, response: { data: { detail: 'Todas as senhas…' } } })).toBe(false);
    expect(errorCode({ response: { data: { detail: { error_code: 'TENANT_DEACTIVATED' } } } })).toBe('TENANT_DEACTIVATED');
  });
});
