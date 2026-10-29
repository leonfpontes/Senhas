import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContactActions, mailtoLink } from '@/components/admin/TicketDetailSheet';

describe('mailtoLink', () => {
  it('monta o mailto com assunto codificado', () => {
    expect(mailtoLink(' ana@exemplo.com ', 'Senha 012')).toBe('mailto:ana@exemplo.com?subject=Senha%20012');
  });

  it('recusa texto que não parece e-mail', () => {
    expect(mailtoLink('ana')).toBeNull();
  });
});

describe('ContactActions', () => {
  it('mostra ligar, WhatsApp e e-mail quando há telefone e e-mail', () => {
    render(<ContactActions telefone="(11) 98888-7777" email="ana@exemplo.com" nome="Ana" assunto="Senha 012" />);
    expect(screen.getByLabelText('Ligar para Ana')).toHaveAttribute('href', 'tel:11988887777');
    expect(screen.getByLabelText('WhatsApp de Ana')).toHaveAttribute('href', 'https://wa.me/5511988887777');
    expect(screen.getByLabelText('Enviar e-mail para Ana')).toHaveAttribute(
      'href',
      'mailto:ana@exemplo.com?subject=Senha%20012',
    );
  });

  it('mostra só o e-mail quando não há telefone', () => {
    render(<ContactActions email="ana@exemplo.com" />);
    expect(screen.getByLabelText('Enviar e-mail para consulente')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ligar/)).toBeNull();
  });

  it('não renderiza nada sem telefone nem e-mail', () => {
    const { container } = render(<ContactActions />);
    expect(container).toBeEmptyDOMElement();
  });
});
