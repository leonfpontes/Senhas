/**
 * Tests for ActivationSection — painel de ativação do Observatório.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ActivationSection, { whatsappLink, type ActivationData, type ActivationTenant } from '@/components/platform/ActivationSection';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }));

function tenant(over: Partial<ActivationTenant>): ActivationTenant {
  return {
    tenant_id: 't1', tenant_name: 'TU São Jorge Guerreiro', slug: 'tu-sao-jorge', created_at: '2026-09-30T15:58:00Z',
    days_since_signup: 5, inactive: false, plan: 'premium', is_trial: true, trial_ends_at: '2026-10-30T15:58:00Z',
    trial_days_left: 24, paying: false, stage: 'aguardando_senha', giras: 4, giras_configuradas: 3,
    next_gira_at: '2026-10-06T22:30:00Z', public_tickets: 0, door_used: false, principal_dor: null,
    onboarding_emails: {}, last_activity_at: '2026-09-30T16:16:00Z', days_since_activity: 5,
    contact: { name: 'André Luiz', email: 'andre@example.com', phone: '11987654321' },
    ...over,
  };
}

const DATA: ActivationData = {
  window_days: 60,
  total: 3,
  by_stage: { sem_gira: 1, sem_senhas: 0, aguardando_senha: 1, recebendo: 1, usou_porta: 0, ativado: 0 },
  tenants: [
    tenant({}),
    tenant({
      tenant_id: 't2', tenant_name: 'Pai Joaquim', slug: 'pai-joaquim', stage: 'recebendo', public_tickets: 4,
      trial_days_left: 6, days_since_activity: 0, principal_dor: 'mediuns', onboarding_emails: { d1: '2026-09-25T13:00:00Z', d3: '2026-09-27T13:00:00Z' },
    }),
    tenant({
      tenant_id: 't3', tenant_name: 'Casa Antiga', slug: 'casa-antiga', stage: 'sem_gira', giras: 0, giras_configuradas: 0,
      next_gira_at: null, is_trial: false, trial_days_left: null, plan: 'free', inactive: true, contact: null,
      days_since_activity: null, last_activity_at: null,
    }),
  ],
};

describe('ActivationSection', () => {
  beforeEach(() => mockPush.mockClear());

  it('resume os estágios', () => {
    render(<ActivationSection data={DATA} />);
    const summary = screen.getByTestId('activation-summary');
    expect(within(summary).getByText('Sem gira: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Aguardando 1ª senha: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Ativado: 0')).toBeInTheDocument();
  });

  it('mostra estágio, giras, trial, atividade e contato de cada terreiro', () => {
    render(<ActivationSection data={DATA} />);
    const row = within(screen.getByTestId('activation-row-tu-sao-jorge'));
    expect(row.getByText('Aguardando 1ª senha')).toBeInTheDocument();
    expect(row.getByText('3/4')).toBeInTheDocument();
    expect(row.getByText('Trial: 24d')).toBeInTheDocument();
    expect(row.getByText('há 5d')).toBeInTheDocument();
    expect(row.getByText('André Luiz')).toBeInTheDocument();
    expect(row.getByRole('link', { name: /WhatsApp de André Luiz/ })).toHaveAttribute('href', 'https://wa.me/5511987654321');
    expect(row.getByRole('link', { name: /E-mail de André Luiz/ })).toHaveAttribute('href', 'mailto:andre@example.com');
  });

  it('mostra dor, e-mails de onboarding e atividade de hoje', () => {
    render(<ActivationSection data={DATA} />);
    const row = within(screen.getByTestId('activation-row-pai-joaquim'));
    expect(row.getByText('Médiuns')).toBeInTheDocument();
    expect(row.getByText('D+1')).toBeInTheDocument();
    expect(row.getByText('D+3')).toBeInTheDocument();
    expect(row.getByText('hoje')).toBeInTheDocument();
    expect(row.getByText('Trial: 6d')).toBeInTheDocument();
  });

  it('terreiro desativado, sem contato e sem atividade', () => {
    render(<ActivationSection data={DATA} />);
    const rowEl = screen.getByTestId('activation-row-casa-antiga');
    const row = within(rowEl);
    expect(row.getByText(/desativado/)).toBeInTheDocument();
    expect(row.getByText('sem admin ativo')).toBeInTheDocument();
    expect(row.getByText('nunca')).toBeInTheDocument();
    expect(row.getByText('free')).toBeInTheDocument();
  });

  it('abre o tenant', () => {
    render(<ActivationSection data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver TU São Jorge Guerreiro' }));
    expect(mockPush).toHaveBeenCalledWith('/platform/tenants/t1');
  });

  it('sem cadastros na janela', () => {
    render(<ActivationSection data={{ ...DATA, total: 0, tenants: [] }} />);
    expect(screen.getByText('Nenhum cadastro nos últimos 60 dias.')).toBeInTheDocument();
  });
});

describe('whatsappLink', () => {
  it('acrescenta o DDI quando falta e respeita quando já tem', () => {
    expect(whatsappLink('11987654321')).toBe('https://wa.me/5511987654321');
    expect(whatsappLink('(11) 98765-4321')).toBe('https://wa.me/5511987654321');
    expect(whatsappLink('5511987654321')).toBe('https://wa.me/5511987654321');
    expect(whatsappLink('1133334444')).toBe('https://wa.me/551133334444');
  });

  it('ignora telefone ausente ou curto', () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink('12345')).toBeNull();
  });
});
