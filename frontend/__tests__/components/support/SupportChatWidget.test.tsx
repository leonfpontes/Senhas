/**
 * Suporte no menu do perfil: sem nada fixo na tela; o painel abre pelo menu, abrir marca
 * como lido e a resposta não lida é avisada ao menu (ponto no avatar).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/admin/dashboard' }) }));

const mockChat = {
  messages: [],
  loading: false,
  sending: false,
  unread: true,
  hasNewSupportMessage: false,
  send: jest.fn(),
  markRead: jest.fn(),
};
jest.mock('@/components/support/useSupportChat', () => ({ useSupportChat: () => mockChat }));

describe('SupportChatWidget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fechado não desenha nada na tela, mas avisa a resposta não lida', () => {
    const onUnread = jest.fn();
    const { container } = render(<SupportChatWidget enabled open={false} onOpenChange={jest.fn()} onUnreadChange={onUnread} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /Ajuda/ })).not.toBeInTheDocument();
    expect(onUnread).toHaveBeenCalledWith(true);
  });

  it('aberto mostra o painel, marca como lido e fecha pelo X', () => {
    const onOpenChange = jest.fn();
    render(<SupportChatWidget enabled open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog', { name: /conversa com o suporte/ })).toBeInTheDocument();
    expect(mockChat.markRead).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Fechar/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sem terreiro (superadmin fora da impersonação) não aparece', () => {
    const onUnread = jest.fn();
    const { container } = render(<SupportChatWidget enabled={false} open onOpenChange={jest.fn()} onUnreadChange={onUnread} />);
    expect(container).toBeEmptyDOMElement();
    expect(onUnread).toHaveBeenCalledWith(false);
  });
});
