/**
 * Acesso à Área do Médium na tela Médiuns (AM-03): sheet de convite (e-mail mascarado,
 * mensagem pronta, WhatsApp, copiar link, cancelar), tirar acesso com confirmação, médium
 * sem e-mail e "Convidar todos com e-mail (N)".
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockPost = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    post: (...a: unknown[]) => mockPost(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
}));
const mockSnack = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() };
jest.mock('@/contexts/SnackbarContext', () => ({ useSnackbar: () => mockSnack }));
jest.mock('@/providers/ThemeProvider', () => ({ useTenant: () => ({ tenantName: 'Tenda Luz da Mata' }) }));
const mockCopy = jest.fn().mockResolvedValue(true);
jest.mock('@/components/admin/ShareLinkDialog', () => ({ copyToClipboard: (t: string) => mockCopy(t) }));

import { AcessoAreaSheet, ConvidarTodosButton, mascararEmail, type MediumAcesso } from '@/components/admin/mediuns';

const CRIADO = {
  link: 'https://girahub.com.br/convite/abc',
  mensagem_whatsapp: 'Oi, Carla! Tenda Luz da Mata convidou você... https://girahub.com.br/convite/abc',
  whatsapp_url: 'https://wa.me/5511987654321?text=Oi',
  email_mascarado: 'ca•••@gmail.com',
  expira_em: '2026-10-14T12:00:00Z',
  acesso_area: { status: 'convite_enviado', convite_enviado_em: '2026-10-07T12:00:00Z' },
};

const carla: MediumAcesso = {
  id: 'm3',
  nome: 'Carla Mendes',
  email: 'carla@gmail.com',
  telefone: '11987654321',
  is_active: true,
  acesso_area: { status: 'sem_acesso' },
};

function abrir(medium: MediumAcesso, extra: Partial<React.ComponentProps<typeof AcessoAreaSheet>> = {}) {
  const onChanged = jest.fn();
  const onOpenChange = jest.fn();
  render(<AcessoAreaSheet medium={medium} onChanged={onChanged} onOpenChange={onOpenChange} {...extra} />);
  return { onChanged, onOpenChange };
}

describe('AcessoAreaSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: CRIADO });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it('mostra o e-mail mascarado e a mensagem pronta antes de enviar', () => {
    abrir(carla);
    const sheet = screen.getByTestId('acesso-area-sheet');
    expect(within(sheet).getByText('Carla Mendes')).toBeInTheDocument();
    expect(within(sheet).getByText(mascararEmail('carla@gmail.com'))).toBeInTheDocument();
    expect(within(sheet).queryByText('carla@gmail.com')).not.toBeInTheDocument();
    expect(screen.getByTestId('mensagem-convite')).toHaveTextContent('Oi, Carla! Tenda Luz da Mata convidou você');
    expect(screen.getByRole('button', { name: /Enviar pelo WhatsApp/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar convite' })).not.toBeInTheDocument();
  });

  it('"Enviar pelo WhatsApp" cria o convite e abre o wa.me com a mensagem', async () => {
    const aba = { opener: {}, location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    const { onChanged } = abrir(carla);
    fireEvent.click(screen.getByRole('button', { name: /Enviar pelo WhatsApp/ }));
    await waitFor(() => expect(aba.location.href).toBe(CRIADO.whatsapp_url));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(aba.opener).toBeNull();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/mediuns/m3/convite');
    expect(onChanged).toHaveBeenCalled();
    // Depois de criado: link real, WhatsApp como link e opção de cancelar.
    expect(await screen.findByTestId('link-convite')).toHaveTextContent(CRIADO.link);
    expect(screen.getByRole('link', { name: /Enviar pelo WhatsApp/ })).toHaveAttribute('href', CRIADO.whatsapp_url);
    expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeInTheDocument();
    open.mockRestore();
  });

  it('falha ao criar fecha a aba aberta e avisa', async () => {
    const aba = { opener: {}, location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(aba as unknown as Window);
    mockPost.mockRejectedValueOnce({ response: { data: { detail: 'Cadastre um e-mail válido no médium para convidar.' } } });
    abrir(carla);
    fireEvent.click(screen.getByRole('button', { name: /Enviar pelo WhatsApp/ }));
    await waitFor(() => expect(aba.close).toHaveBeenCalled());
    expect(mockSnack.showError).toHaveBeenCalledWith('Cadastre um e-mail válido no médium para convidar.');
    open.mockRestore();
  });

  it('"Copiar link do convite" cria e copia', async () => {
    abrir(carla);
    fireEvent.click(screen.getByRole('button', { name: /Copiar link do convite/ }));
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith(CRIADO.link));
    expect(mockSnack.showSuccess).toHaveBeenCalledWith('Link do convite copiado.');
  });

  it('convite em aberto: reenviar e cancelar com confirmação', async () => {
    const { onChanged, onOpenChange } = abrir({
      ...carla,
      acesso_area: { status: 'convite_enviado', convite_enviado_em: '2026-10-05T15:00:00Z' },
    });
    expect(screen.getByText(/Convite enviado em 05\/10\/2026\. Ainda não ativou\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reenviar pelo WhatsApp/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar convite' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/v1/admin/mediuns/m3/acesso'));
    expect(mockSnack.showSuccess).toHaveBeenCalledWith('Convite cancelado.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it('acesso ativo: tirar o acesso pede confirmação', async () => {
    abrir({ ...carla, acesso_area: { status: 'ativo', desde: '2026-10-02T15:00:00Z' } });
    expect(screen.getByText(/Acesso ativo desde 02\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar o acesso à Área' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Tirar o acesso de Carla?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tirar o acesso' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/v1/admin/mediuns/m3/acesso'));
    expect(mockSnack.showSuccess).toHaveBeenCalledWith('Acesso retirado. Carla saiu da Área.');
  });

  it('sem e-mail no cadastro: pede o e-mail e não oferece convite', () => {
    const onEditar = jest.fn();
    abrir({ ...carla, email: null }, { onEditar });
    expect(screen.getByText(/adicione o e-mail no cadastro/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Editar cadastro/ }));
    expect(onEditar).toHaveBeenCalled();
  });
});

describe('ConvidarTodosButton', () => {
  const lista: MediumAcesso[] = [
    carla,
    { id: 'm4', nome: 'Diego Rocha', email: null, is_active: true, acesso_area: { status: 'sem_acesso' } },
    { id: 'm6', nome: 'Fábio Lima', email: 'fabio@yahoo.com', is_active: true, acesso_area: { status: 'sem_acesso' } },
    { id: 'm8', nome: 'Hélio Prado', email: 'helio@gmail.com', is_active: true, acesso_area: { status: 'convite_enviado' } },
    { id: 'm9', nome: 'Inativo', email: 'x@gmail.com', is_active: false, acesso_area: { status: 'sem_acesso' } },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: { convidados: 2, sem_email: 1, ja_convidados: 1 } });
  });

  it('conta só ativos com e-mail e sem acesso, confirma e envia', async () => {
    const onDone = jest.fn();
    render(<ConvidarTodosButton mediuns={lista} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Convidar todos com e-mail (2)' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Convidar 2 médiuns por e-mail?' });
    expect(within(dialog).getByText('Carla Mendes, Fábio Lima.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar convites' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/mediuns/convite/lote'));
    expect(mockSnack.showSuccess).toHaveBeenCalledWith('2 convites enviados por e-mail.');
    expect(onDone).toHaveBeenCalled();
  });

  it('some quando não há ninguém para convidar', () => {
    render(<ConvidarTodosButton mediuns={[lista[1], lista[3]]} onDone={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Convidar todos/ })).not.toBeInTheDocument();
  });
});
