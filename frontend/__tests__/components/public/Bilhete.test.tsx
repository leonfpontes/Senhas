/**
 * Bilhete — cartão único usado na emissão, no link do e-mail, na fila e no cancelamento.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Bilhete,
  PublicShell,
  brandStyle,
  buildShareText,
  formatGiraDateShort,
  ticketIdFromLink,
  whatsappShareUrl,
  type PublicTicket,
} from '@/components/public';

function makeTicket(overrides: Partial<PublicTicket> = {}): PublicTicket {
  return {
    ticket_number: '0042',
    status: 'emitted',
    status_label: 'Confirmada',
    waitlisted: false,
    cancellable: true,
    cancel_reason: null,
    gira_name: 'Gira de Pretos-Velhos',
    gira_date: '08/10/2026 às 19:00',
    gira_date_iso: '2026-10-08T22:00:00+00:00',
    gira_local: 'Salão principal',
    horario: '20:30',
    recados: 'Traga uma vela branca.',
    tenant_name: 'Tenda Pai Joaquim',
    tenant_slug: 'tenda-pai-joaquim',
    tenant_address: 'Rua das Flores, 123',
    maps_url: 'https://maps.example/x',
    tenant_logo_url: null,
    primary_color: null,
    secondary_color: null,
    consulente_name: 'Maria da Silva',
    acompanhantes: [],
    ...overrides,
  };
}

describe('Bilhete', () => {
  it('mostra número sem "#", data com dia da semana, horário escolhido e status confirmado implícito', () => {
    render(<Bilhete ticket={makeTicket()} ticketId="t-1" heading="Senha emitida!" shareLink="https://girahub/x" />);

    expect(screen.getByRole('heading', { name: 'Senha emitida!', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number')).toHaveTextContent(/^0042$/);
    expect(screen.queryByText(/#0042/)).not.toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 8 de outubro às 19h')).toBeInTheDocument();
    expect(screen.getByText('Seu horário de atendimento: 20:30')).toBeInTheDocument();
    expect(screen.queryByText('Confirmada')).not.toBeInTheDocument();
    expect(screen.getByText('Recados do terreiro')).toBeInTheDocument();
  });

  it('WhatsApp abre wa.me com o texto do bilhete e o link', () => {
    render(<Bilhete ticket={makeTicket()} ticketId="t-1" shareLink="https://girahub/x" />);
    const link = screen.getByRole('link', { name: /enviar no whatsapp/i });
    const href = link.getAttribute('href') as string;
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
    expect(text).toContain('Senha 0042 — Gira de Pretos-Velhos');
    expect(text).toContain('Horário escolhido: 20:30');
    expect(text).toContain('https://girahub/x');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('"Adicionar à agenda" baixa um .ics', () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<Bilhete ticket={makeTicket()} ticketId="t-1" />);
    fireEvent.click(screen.getByRole('button', { name: /adicionar à agenda/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('sem ticketId não oferece cancelar; showNextGiras=false esconde o link', () => {
    render(<Bilhete ticket={makeTicket()} showNextGiras={false} />);
    expect(screen.queryByRole('link', { name: /cancelar minha senha/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver próximas giras/i })).not.toBeInTheDocument();
  });

  it('fila de espera: rótulo e aviso, sem cancelar se não for cancelável', () => {
    render(
      <Bilhete
        ticket={makeTicket({ status: 'waitlisted', status_label: 'Na fila de espera', waitlisted: true, cancellable: false })}
        ticketId="t-1"
      />,
    );
    expect(screen.getByText('Na fila de espera')).toBeInTheDocument();
    expect(screen.getByText(/Se abrir uma vaga, avisamos por e-mail/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cancelar minha senha/i })).not.toBeInTheDocument();
  });

  it('lista acompanhantes', () => {
    render(<Bilhete ticket={makeTicket({ acompanhantes: [{ ticket_number: '0043', name: 'João' }] })} />);
    expect(screen.getByRole('heading', { name: /acompanhantes/i })).toBeInTheDocument();
    expect(screen.getByText('0043 · João')).toBeInTheDocument();
  });
});

describe('PublicShell', () => {
  it('aplica a cor do terreiro em --primary com contraste no foreground e põe o título', () => {
    const style = brandStyle({ primary: '#ffeb3b' }) as Record<string, string>;
    expect(style['--primary']).toBe('#ffeb3b');
    expect(style['--primary-foreground']).toBe('#000000');
    expect((brandStyle() as Record<string, string>)['--primary']).toBe('#4f46e5');

    render(
      <PublicShell title="Teste" tenantName="Tenda Pai Joaquim" subtitle="qui, 8 de out · 19h" footer={<button type="button">CTA</button>}>
        <p>conteúdo</p>
      </PublicShell>,
    );
    expect(screen.getByText('Tenda Pai Joaquim')).toBeInTheDocument();
    expect(screen.getByText('qui, 8 de out · 19h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CTA' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('conteúdo');
  });
});

describe('utilitários do bilhete', () => {
  it('extrai o id do rescue_link e formata a data curta', () => {
    expect(ticketIdFromLink('https://app/public/tenda/ticket/abc-123?x=1')).toBe('abc-123');
    expect(ticketIdFromLink(null)).toBeNull();
    expect(formatGiraDateShort('2026-10-08T22:00:00+00:00')).toBe('qui, 8 de out · 19h');
    expect(formatGiraDateShort(undefined)).toBeNull();
  });

  it('monta o texto de compartilhamento e a URL do WhatsApp', () => {
    const text = buildShareText(makeTicket({ horario: null }));
    expect(text).not.toContain('Horário escolhido');
    expect(text).toContain('Salão principal · Rua das Flores, 123');
    expect(whatsappShareUrl('a b')).toBe('https://wa.me/?text=a%20b');
  });
});
