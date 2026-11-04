/**
 * GiraCard — estado em palavras do terreiro e um botão primário por estado.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { GiraCard, giraPhase, type GiraCardData, type GiraCardPermissions } from '@/components/admin/GiraCard';

jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

const NOW = new Date('2026-10-06T10:00:00');
const at = (iso: string) => new Date(iso).toISOString();

const ALL: GiraCardPermissions = { canEdit: true, canDelete: true, canViewPorta: true, canViewTickets: true };

function renderCard(gira: Partial<GiraCardData>, extra: Record<string, unknown> = {}) {
  const handlers = {
    onShare: jest.fn(),
    onConfigure: jest.fn(),
    onRelease: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  render(
    <GiraCard
      gira={{ id: 'g1', nome: 'Gira de Caboclos', data_inicio: at('2026-10-10T20:00:00'), is_active: true, ...gira }}
      permissions={ALL}
      now={NOW}
      {...handlers}
      {...extra}
    />,
  );
  return handlers;
}

const primaryButtons = () =>
  screen
    .queryAllByRole('button')
    // "Editar <gira>" é o cartão inteiro (clique para editar, 04/11/2026), não uma ação primária.
    .filter((b) => !b.getAttribute('aria-label')?.startsWith('Mais ações') && !b.hasAttribute('data-camada-de-abrir'));

describe('GiraCard', () => {
  it('sem senhas configuradas → "Configurar senhas"', () => {
    const h = renderCard({ max_tickets: null });
    expect(screen.getByText('Senhas ainda não configuradas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Configurar senhas/ }));
    expect(h.onConfigure).toHaveBeenCalled();
    expect(primaryButtons()).toHaveLength(1);
  });

  it('emissão agendada → "Liberar agora", com a data de abertura em palavras', () => {
    const h = renderCard({
      max_tickets: 50,
      release_start_at: at('2026-10-07T18:00:00'),
      release_end_at: at('2026-10-10T19:00:00'),
    });
    expect(screen.getByText('Agendada')).toBeInTheDocument();
    expect(screen.getByTestId('gira-timeline')).toHaveTextContent('Senhas abrem amanhã 18h → fecham sáb 10/10, 19h → gira 20h');
    fireEvent.click(screen.getByRole('button', { name: /Liberar agora/ }));
    expect(h.onRelease).toHaveBeenCalled();
    expect(screen.getByTestId('gira-timeline')).toBeInTheDocument();
  });

  it('senhas abertas → "Compartilhar link" e contagem "12 de 50 senhas"', () => {
    const h = renderCard(
      { max_tickets: 50, release_start_at: at('2026-10-05T10:00:00'), release_end_at: at('2026-10-10T19:00:00') },
      { issued: 12 },
    );
    expect(screen.getByText('Senhas abertas')).toBeInTheDocument();
    expect(screen.getByTestId('gira-timeline')).toHaveTextContent('Senhas abertas até sáb 10/10, 19h → gira 20h');
    expect(screen.getByTestId('gira-counts')).toHaveTextContent('12 de 50 senhas');
    fireEvent.click(screen.getByRole('button', { name: /Compartilhar link/ }));
    expect(h.onShare).toHaveBeenCalled();
  });

  it('dia da gira → "Abrir Porta" com a gira na URL e "na fila"', () => {
    renderCard(
      { data_inicio: at('2026-10-06T12:00:00'), max_tickets: 50, release_start_at: at('2026-10-05T10:00:00'), release_end_at: at('2026-10-06T11:00:00') },
      { issued: 12, waiting: 3 },
    );
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByTestId('gira-timeline')).toHaveTextContent('Gira hoje 12h');
    expect(screen.getByRole('link', { name: /Abrir a Porta/ })).toHaveAttribute('href', '/admin/porta?gira=g1');
    expect(screen.getByTestId('gira-counts')).toHaveTextContent('12 de 50 senhas · 3 na fila');
  });

  it('dia da gira sem permissão de Porta → cai para "Compartilhar link"', () => {
    renderCard(
      { data_inicio: at('2026-10-06T12:00:00'), max_tickets: 50 },
      { permissions: { ...ALL, canViewPorta: false } },
    );
    expect(screen.queryByRole('link', { name: /Abrir a Porta/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compartilhar link/ })).toBeInTheDocument();
  });

  it('agendada não mostra ocupação: nada de barra em gira que nem abriu senha', () => {
    renderCard(
      { max_tickets: 50, release_start_at: at('2026-10-07T18:00:00'), release_end_at: at('2026-10-10T19:00:00') },
      { issued: 0 },
    );
    expect(screen.queryByTestId('gira-counts')).not.toBeInTheDocument();
  });

  it('aberta e cheia → selo "Lotada"', () => {
    renderCard(
      { max_tickets: 50, release_start_at: at('2026-10-05T10:00:00'), release_end_at: at('2026-10-10T19:00:00') },
      { issued: 50 },
    );
    expect(screen.getByText('Lotada')).toBeInTheDocument();
  });

  it('gira realizada não tem botão primário', () => {
    renderCard({ data_inicio: at('2026-10-01T20:00:00'), max_tickets: 50 });
    expect(screen.getByText('Gira realizada')).toBeInTheDocument();
    expect(primaryButtons()).toHaveLength(0);
  });

  it('sem nenhuma permissão de edição não mostra configurar/liberar nem o menu de edição', () => {
    renderCard(
      { max_tickets: null },
      { permissions: { canEdit: false, canDelete: false, canViewPorta: false, canViewTickets: false } },
    );
    expect(screen.queryByRole('button', { name: /Configurar senhas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument();
  });

  it('giraPhase: inativa vence qualquer outro estado', () => {
    expect(giraPhase({ id: 'x', nome: 'x', data_inicio: at('2026-10-10T20:00:00'), is_active: false, max_tickets: 10 }, NOW)).toBe(
      'inativa',
    );
  });
});
