/**
 * Tests for FirstGiraChecklist — checklist de primeira gira do dashboard.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import FirstGiraChecklist, {
  ACTIVATED_PUBLIC_TICKETS,
  buildWhatsAppShareUrl,
  OnboardingStatus,
} from '@/components/admin/FirstGiraChecklist';
import { trackEvent } from '@/services/analytics';

jest.mock('@/services/analytics', () => ({
  trackEvent: jest.fn(),
  setAnalyticsTag: jest.fn(),
}));

jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="checklist-qr" data-value={value} />,
}));

const LINK = 'https://girahub.com.br/public/casa-nova/senha';

const base: OnboardingStatus = {
  has_gira: false,
  public_tickets: 0,
  door_used: false,
  public_link: LINK,
  completed: false,
};

function renderChecklist(status: Partial<OnboardingStatus> = {}, props: Record<string, unknown> = {}) {
  return render(
    <FirstGiraChecklist
      status={{ ...base, ...status }}
      tenantId="tenant-1"
      tenantName="Casa Nova"
      primary="#6366f1"
      canCreateGira
      canViewPorta
      {...props}
    />,
  );
}

const stepDone = (key: string) => screen.getByTestId(`checklist-step-${key}`).getAttribute('data-done');

describe('FirstGiraChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('mostra o checklist para um terreiro novo, no passo 1', () => {
    renderChecklist();
    expect(screen.getByTestId('first-gira-checklist')).toBeInTheDocument();
    expect(screen.getByText('0 de 4')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-step-gira')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: 'Criar gira' })).toHaveAttribute('href', '/admin/giras');
  });

  it('sem permissão de criar gira, orienta a pedir ao administrador', () => {
    renderChecklist({}, { canCreateGira: false });
    expect(screen.queryByRole('link', { name: 'Criar gira' })).not.toBeInTheDocument();
    expect(screen.getByText(/Peça a um administrador/)).toBeInTheDocument();
  });

  it('com gira criada, o passo atual é compartilhar o link', () => {
    renderChecklist({ has_gira: true });
    expect(stepDone('gira')).toBe('true');
    expect(screen.getByTestId('checklist-step-share')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(LINK)).toBeInTheDocument();
    const wa = screen.getByRole('link', { name: /Enviar no WhatsApp/ });
    expect(wa).toHaveAttribute('href', buildWhatsAppShareUrl(LINK, 'Casa Nova'));
    expect(wa).toHaveAttribute('target', '_blank');
  });

  it('clicar no WhatsApp marca o passo como feito, persiste e registra evento', () => {
    renderChecklist({ has_gira: true });
    fireEvent.click(screen.getByRole('link', { name: /Enviar no WhatsApp/ }));
    expect(stepDone('share')).toBe('true');
    expect(window.localStorage.getItem('girahub:first-gira-checklist:shared:tenant-1')).toBe('1');
    expect(trackEvent).toHaveBeenCalledWith('onboarding_share_whatsapp');
    expect(screen.getByTestId('checklist-step-tickets')).toHaveAttribute('aria-current', 'step');
  });

  it('copiar o link usa a área de transferência', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    renderChecklist({ has_gira: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }));
    });
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(stepDone('share')).toBe('true');
    // Durante a transição do Collapse os dois passos ficam montados por um
    // instante, cada um com seu botão de copiar — basta o feedback aparecer.
    expect(screen.getAllByText('Link copiado!').length).toBeGreaterThan(0);
    expect(trackEvent).toHaveBeenCalledWith('onboarding_copy_link');
  });

  it('QR code aponta para o link público e não avança o passo (senão sumiria)', () => {
    renderChecklist({ has_gira: true });
    fireEvent.click(screen.getByRole('button', { name: /QR code/ }));
    expect(screen.getByTestId('checklist-qr')).toHaveAttribute('data-value', LINK);
    expect(stepDone('share')).toBe('false');
    expect(screen.getByTestId('checklist-step-share')).toHaveAttribute('aria-current', 'step');
    expect(trackEvent).toHaveBeenCalledWith('onboarding_show_qr');
  });

  it('esperando a primeira senha, oferece testar o link e as ações de compartilhar', () => {
    window.localStorage.setItem('girahub:first-gira-checklist:shared:tenant-1', '1');
    renderChecklist({ has_gira: true });
    expect(screen.getByTestId('checklist-step-tickets')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: /Testar o link/ })).toHaveAttribute('href', LINK);
    expect(screen.getByRole('link', { name: /Enviar no WhatsApp/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /QR code/ }));
    expect(screen.getByTestId('checklist-qr')).toHaveAttribute('data-value', LINK);
  });

  it('a primeira senha pelo link completa compartilhar e receber', () => {
    renderChecklist({ has_gira: true, public_tickets: 3 });
    expect(stepDone('share')).toBe('true');
    expect(stepDone('tickets')).toBe('true');
    expect(screen.getByText('3 de 4')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-step-porta')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: 'Abrir a Porta' })).toHaveAttribute('href', '/admin/porta');
  });

  it('some quando concluído', () => {
    renderChecklist({ has_gira: true, public_tickets: 3, door_used: true, completed: true });
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
  });

  it(`some para terreiro já ativado (>= ${ACTIVATED_PUBLIC_TICKETS} senhas pelo link), mesmo sem Porta`, () => {
    renderChecklist({ has_gira: true, public_tickets: ACTIVATED_PUBLIC_TICKETS });
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
  });

  it('ocultar esconde e persiste por tenant', () => {
    const { unmount } = renderChecklist();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar primeiros passos' }));
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith('onboarding_dismiss');
    unmount();
    renderChecklist();
    expect(screen.queryByTestId('first-gira-checklist')).not.toBeInTheDocument();
    // Outro tenant no mesmo navegador continua vendo.
    renderChecklist({}, { tenantId: 'tenant-2' });
    expect(screen.getByTestId('first-gira-checklist')).toBeInTheDocument();
  });

  it('sem link público, não mostra ações de compartilhar', () => {
    renderChecklist({ has_gira: true, public_link: null });
    expect(screen.queryByRole('link', { name: /Enviar no WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('codifica a mensagem com o link e o nome do terreiro', () => {
    const url = buildWhatsAppShareUrl(LINK, 'Casa Nova');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.replace('https://wa.me/?text=', ''));
    expect(text).toContain(LINK);
    expect(text).toContain('do Casa Nova');
    expect(text).toContain('mesmo para todas as giras');
  });
});
