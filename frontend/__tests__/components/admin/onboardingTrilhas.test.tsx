/**
 * Checklist de primeiros passos por dor: espelho das trilhas do backend, "feito" vindo do
 * backend, travas de plano/permissão (passo travado pelo plano não segura o checklist) e a
 * renderização de cada trilha no FirstGiraChecklist.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FirstGiraChecklist, { isTenantActivated, type OnboardingStatus } from '@/components/admin/FirstGiraChecklist';
import {
  STEP_DEFS,
  TRILHA_PASSOS,
  TRILHA_POR_DOR,
  proximoPasso,
  resolveTrilha,
  trilhaConcluida,
  trilhaDe,
  type StepKey,
  type Trilha,
} from '@/components/admin/onboardingTrilhas';
import { PRINCIPAL_DOR_OPTIONS } from '@/constants/onboarding';

jest.mock('next/link', () => ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
  <a href={href} onClick={onClick}>
    {children}
  </a>
));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn(), setAnalyticsTag: jest.fn() }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg /> }));

const ALL = { canPlan: () => true, canGroup: () => true };

function status(trilha: Trilha, done: Partial<Record<StepKey, boolean>> = {}, extra: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return {
    has_gira: false,
    public_tickets: 0,
    door_used: false,
    public_link: 'https://girahub.com.br/public/casa/senha',
    completed: false,
    trilha,
    steps: TRILHA_PASSOS[trilha].map((key) => ({ key, done: Boolean(done[key]) })),
    ...extra,
  };
}

describe('trilhas (espelho do backend)', () => {
  it('as mesmas trilhas e passos de dashboard_summary.py', () => {
    const py = fs.readFileSync(
      path.join(__dirname, '../../../../backend/src/api/v1/admin/dashboard_summary.py'),
      'utf8',
    );
    const passos = py.split('TRILHA_PASSOS')[1].split('}')[0];
    for (const [trilha, keys] of Object.entries(TRILHA_PASSOS)) {
      expect(passos).toContain(`"${trilha}": (${keys.map((k) => `"${k}"`).join(', ')})`);
    }
    const porDor = py.split('TRILHA_POR_DOR')[1].split('}')[0];
    for (const [dor, trilha] of Object.entries(TRILHA_POR_DOR)) {
      expect(porDor).toContain(`"${dor}": "${trilha}"`);
    }
  });

  it('toda dor tem trilha, todo passo tem texto e toda trilha leva à primeira gira', () => {
    for (const o of PRINCIPAL_DOR_OPTIONS) expect(TRILHA_POR_DOR[o.value]).toBeDefined();
    for (const keys of Object.values(TRILHA_PASSOS)) {
      expect(keys).toContain('gira');
      keys.forEach((k) => expect(STEP_DEFS[k].title).toBeTruthy());
    }
  });

  it('sem trilha do backend (resposta antiga), deduz da dor; sem dor, a trilha da gira', () => {
    expect(trilhaDe({ principal_dor: 'divulgacao' })).toBe('site');
    expect(trilhaDe({ principal_dor: null })).toBe('gira');
    expect(trilhaDe({ trilha: 'estoque', principal_dor: 'senhas' })).toBe('estoque');
  });
});

describe('resolveTrilha', () => {
  it('usa o "feito" do backend', () => {
    const steps = resolveTrilha(status('mediuns', { medium: true }), ALL);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['medium', true],
      ['mensalidade', false],
      ['gira', false],
    ]);
    expect(proximoPasso(steps)?.key).toBe('mensalidade');
  });

  it('passo fora do plano fica travado e não segura a conclusão', () => {
    const gates = { canPlan: (f: string) => f !== 'mensalidade_mediun', canGroup: () => true };
    const steps = resolveTrilha(status('mediuns', { medium: true, gira: true }), gates);
    expect(steps.find((s) => s.key === 'mensalidade')?.locked).toBe('plan');
    expect(trilhaConcluida(steps)).toBe(true);
    expect(proximoPasso(steps)).toBeNull();
  });

  it('passo sem permissão continua contando (outra pessoa pode fazer)', () => {
    const gates = { canPlan: () => true, canGroup: (f: string) => f !== 'estoque' };
    const steps = resolveTrilha(status('estoque'), gates);
    expect(steps[0].locked).toBe('perm');
    expect(trilhaConcluida(steps)).toBe(false);
    expect(proximoPasso(steps)?.key).toBe('gira');
  });

  it('"já compartilhei" do navegador completa o passo do link', () => {
    const steps = resolveTrilha(status('senhas', { gira: true }), { ...ALL, shared: true });
    expect(steps.find((s) => s.key === 'share')?.done).toBe(true);
  });

  it('isTenantActivated segue a trilha (Porta usada não conclui a trilha de estoque)', () => {
    expect(isTenantActivated(status('estoque', {}, { door_used: true, public_tickets: 3 }))).toBe(false);
    expect(isTenantActivated(status('estoque', { grupo: true, item: true, movimentacao: true, gira: true }))).toBe(true);
    // Muitas senhas pelo link: terreiro ativado em qualquer trilha.
    expect(isTenantActivated(status('estoque', {}, { public_tickets: 20 }))).toBe(true);
  });
});

describe('FirstGiraChecklist por trilha', () => {
  beforeEach(() => window.localStorage.clear());

  const renderTrilha = (s: OnboardingStatus, props: Record<string, unknown> = {}) =>
    render(<FirstGiraChecklist status={s} tenantId="t1" canCreateGira canViewPorta {...props} />);

  it('trilha de médiuns: título próprio, passos do módulo e CTA do passo atual', () => {
    renderTrilha(status('mediuns'));
    expect(screen.getByRole('heading', { name: 'Primeiros passos: a corrente organizada' })).toBeInTheDocument();
    expect(screen.getByTestId('first-gira-checklist')).toHaveAttribute('data-trilha', 'mediuns');
    expect(screen.getByTestId('checklist-step-medium')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: 'Cadastrar médium' })).toHaveAttribute('href', '/admin/mediuns');
    expect(screen.getByTestId('checklist-step-gira')).toBeInTheDocument();
    expect(screen.queryByTestId('checklist-step-porta')).not.toBeInTheDocument();
  });

  it('passo do módulo fora do plano mostra o plano necessário e "Ver planos"', () => {
    renderTrilha(status('estoque'), { canPlan: (f: string) => f !== 'estoque_controle' });
    expect(screen.getByText(/Disponível só no Premium/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/admin/billing');
  });

  it('sem permissão no módulo, orienta a pedir ao administrador', () => {
    renderTrilha(status('financeiro'), { canGroup: () => false });
    expect(screen.getByText('Peça a um administrador do terreiro para fazer este passo.')).toBeInTheDocument();
  });

  it('trilha do site com o site salvo: passo atual é publicar', () => {
    renderTrilha(status('site', { site: true }));
    expect(screen.getByTestId('checklist-step-site')).toHaveAttribute('data-done', 'true');
    expect(screen.getByTestId('checklist-step-publicar')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: 'Publicar' })).toHaveAttribute('href', '/admin/meu-site');
  });

  it('trilha concluída some', () => {
    renderTrilha(status('site', { site: true, publicar: true, gira: true }));
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
  });

  it('terreiro antigo (sem trilha/steps) mantém o checklist da primeira gira', () => {
    renderTrilha({ has_gira: false, public_tickets: 0, door_used: false, public_link: null, completed: false });
    expect(screen.getByRole('heading', { name: 'Primeiros passos: sua primeira gira' })).toBeInTheDocument();
    expect(screen.getByTestId('checklist-step-porta')).toBeInTheDocument();
  });
});
