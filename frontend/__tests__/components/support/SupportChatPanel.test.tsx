import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SupportChatPanel, formatMessageTime } from '../../../src/components/support/SupportChatPanel';

describe('SupportChatPanel', () => {
  const now = new Date();
  const messages = [
    { id: 'm1', body: 'Oi, preciso de ajuda', is_from_support: false, sender_name_snapshot: 'Ana', created_at: now.toISOString() },
    { id: 'm2', body: 'Claro! Pode falar.', is_from_support: true, sender_name_snapshot: 'Suporte', created_at: now.toISOString() },
  ];

  it('formats time as HH:mm today and dd/mm HH:mm on other days', () => {
    const ref = new Date(2026, 9, 6, 15, 0);
    expect(formatMessageTime(new Date(2026, 9, 6, 14, 5).toISOString(), ref)).toBe('14:05');
    expect(formatMessageTime(new Date(2026, 8, 12, 9, 30).toISOString(), ref)).toBe('12/09 09:30');
    expect(formatMessageTime('invalido', ref)).toBe('');
  });

  it('shows messages with timestamps and sends on Enter', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    render(<SupportChatPanel messages={messages} loading={false} sending={false} onSend={onSend} onClose={jest.fn()} />);
    expect(screen.getByText('Oi, preciso de ajuda')).toBeInTheDocument();
    expect(screen.getAllByText(formatMessageTime(now.toISOString())).length).toBe(2);

    const input = screen.getByRole('textbox', { name: 'Mensagem para o suporte' });
    fireEvent.change(input, { target: { value: 'Obrigada' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onSend).toHaveBeenCalledWith('Obrigada');
  });

  it('closes on Escape and on the X', () => {
    const onClose = jest.fn();
    render(<SupportChatPanel messages={[]} loading={false} sending={false} onSend={jest.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar chat de suporte' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
