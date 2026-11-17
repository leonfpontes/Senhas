/**
 * Beta "Textos do site com IA": o cartão do painel da seção pede sugestões e só aplica a escolhida.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { apiClient } from '@/services/api_client';
import { TextAssist, type IaCampo } from '@/components/site/editor/studio/TextAssist';
import type { SiteSection } from '@/components/site/types';

const campos: IaCampo[] = [
  { campo: 'title', rotulo: 'Título da seção', max_chars: 60, precisa_base: false },
  { campo: 'body', rotulo: 'Texto do Sobre', max_chars: 1200, precisa_base: true },
];
const section: SiteSection = { id: 's1', section_type: 'ABOUT', order_index: 0, config: { title: 'Sobre nós', body: '' } };

describe('TextAssist', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pede sugestões e aplica só a escolhida', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { sugestoes: ['Quem somos', 'Conheça a casa'] } });
    const onChange = jest.fn();
    render(<TextAssist section={section} campos={campos} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Escrever com ajuda da IA/ }));
    await userEvent.click(screen.getByRole('button', { name: /Sugerir texto/ }));
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/sites/ia/sugestoes', expect.objectContaining({ secao: 'ABOUT', campo: 'title', pedido: 'melhorar', texto_atual: 'Sobre nós' }));
    await screen.findByText('Conheça a casa');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Usar este texto' })[1]);
    expect(onChange).toHaveBeenCalledWith({ title: 'Conheça a casa', body: '' });
  });

  it('texto longo vazio só sugere com a ideia da casa', async () => {
    render(<TextAssist section={section} campos={campos} onChange={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Escrever com ajuda da IA/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Texto do Sobre' }));
    expect(screen.getByRole('radio', { name: 'Melhorar' })).toBeDisabled();
    const botao = screen.getByRole('button', { name: /Sugerir texto/ });
    expect(botao).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/O que você quer dizer/), 'casa aberta a todos');
    expect(botao).toBeEnabled();
  });

  it('mostra o erro do servidor', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue(new Error('x'));
    render(<TextAssist section={section} campos={campos} onChange={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Escrever com ajuda da IA/ }));
    await userEvent.click(screen.getByRole('button', { name: /Sugerir texto/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não deu para sugerir agora'));
  });
});
