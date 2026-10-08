/**
 * AM-09 — /admin/comunicados ("Avisos"): gates (plano/chave do piloto sem PlanLocked, grupo
 * COMUNICADOS), botões só com permissão, formulário + prévia "Ver como o médium vê", detalhe com
 * as abas "Ainda não leram" / "Leram" e "Lembrar quem não leu".
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), pathname: '/admin/comunicados', query: {}, asPath: '/admin/comunicados' }),
}));
jest.mock('next/link', () => ({ children, href }: any) => <a href={href}>{children}</a>);
jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'font-fraunces', className: 'font-fraunces' }),
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/pages/admin/admin_layout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'basic' }, loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

const LISTA = [
  {
    id: 'c1',
    titulo: 'Gira de sexta começa às 20h30',
    corpo: 'A corrente chega às 19h30.\nVeja https://exemplo.com.br',
    publico: 'todos',
    fixado: true,
    publicar_em: '2026-10-07T12:00:00Z',
    expira_em: null,
    situacao: 'publicado',
    created_at: '2026-10-07T12:00:00Z',
    updated_at: '2026-10-07T12:00:00Z',
    leituras: { lidos: 9, total: 20 },
  },
  {
    id: 'c2',
    titulo: 'Campanha do agasalho',
    corpo: 'Até 31/10.',
    publico: 'cambones',
    fixado: false,
    publicar_em: '2099-10-08T11:00:00Z',
    expira_em: null,
    situacao: 'agendado',
    created_at: '2026-10-07T12:00:00Z',
    updated_at: '2026-10-07T12:00:00Z',
    leituras: { lidos: 0, total: 5 },
  },
];

const LEITURAS = {
  total: 3,
  lidos: 1,
  leram: [{ medium_id: 'm1', nome: 'Ana Paula', lido_em: '2026-10-07T15:00:00Z' }],
  nao_leram: [
    { medium_id: 'm2', nome: 'Beto Souza', lido_em: null },
    { medium_id: 'm3', nome: 'Caio Lima', lido_em: null },
  ],
};

function setup(lista = LISTA) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/comunicados') return Promise.resolve({ data: lista });
    if (url.endsWith('/leituras')) return Promise.resolve({ data: LEITURAS });
    return Promise.resolve({ data: {} });
  });
  const Page = require('@/pages/admin/comunicados').default;
  return render(<Page />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe('Avisos — gates', () => {
  it('sem area_medium (plano ou chave do piloto): aviso neutro, sem oferta de plano e sem chamar a API', async () => {
    mockPlanCan.mockImplementation((f: string) => f !== 'area_medium');
    setup();
    expect(await screen.findByText('A Área do Médium ainda não está disponível para este terreiro.')).toBeInTheDocument();
    expect(screen.queryByText(/plano/i)).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('sem COMUNICADOS:view mostra PermissionDenied e não busca', async () => {
    mockGroupCan.mockImplementation(() => false);
    setup();
    expect(await screen.findByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('só view: lista com "lido por N de M", sem botões de criar/editar/excluir', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setup();
    const itens = await screen.findAllByTestId('comunicado-item');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByText('lido por 9 de 20')).toBeInTheDocument();
    expect(within(itens[0]).getByText('Fixado')).toBeInTheDocument();
    expect(within(itens[1]).getByText('Agendado')).toBeInTheDocument();
    expect(within(itens[1]).getByText(/Só cambones/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo aviso/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
    expect(mockGroupCan).toHaveBeenCalledWith('comunicados', 'view');
  });

  it('com todas as ações: Novo aviso, Editar e Excluir aparecem', async () => {
    setup();
    await screen.findAllByTestId('comunicado-item');
    expect(screen.getByRole('button', { name: /Novo aviso/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Gira de sexta começa às 20h30' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Gira de sexta começa às 20h30' })).toBeInTheDocument();
  });
});

describe('Avisos — formulário e prévia', () => {
  it('publica um aviso para os cambones, fixado, e a prévia mostra o texto sem HTML', async () => {
    setup([]);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'Gira de sexta' } });
    fireEvent.change(within(dialog).getByLabelText(/Texto/), {
      target: { value: 'Chegar 19h30.\n<img src=x onerror="window.__x=1">\nhttps://exemplo.com.br' },
    });
    fireEvent.click(within(dialog).getByLabelText(/Cambones/));
    fireEvent.click(within(dialog).getByRole('switch', { name: /Fixar no topo/ }));

    fireEvent.click(within(dialog).getByRole('button', { name: /Ver como o médium vê/ }));
    const preview = await screen.findByTestId('aviso-preview');
    expect(within(preview).getByRole('heading', { name: 'Gira de sexta' })).toBeInTheDocument();
    expect(within(preview).getByText('Fixado')).toBeInTheDocument();
    expect(preview.querySelector('img')).toBeNull();
    expect(within(preview).getByText('<img src=x onerror="window.__x=1">')).toBeInTheDocument();
    expect(within(preview).getByRole('link', { name: 'https://exemplo.com.br' })).toHaveAttribute(
      'href',
      'https://exemplo.com.br/',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voltar a editar' }));

    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publicar aviso' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/comunicados', {
      titulo: 'Gira de sexta',
      corpo: 'Chegar 19h30.\n<img src=x onerror="window.__x=1">\nhttps://exemplo.com.br',
      publico: 'cambones',
      fixado: true,
      avisar_email: false,
      expira_em: null,
      publicar_em: null,
    });
    expect(mockSuccess).toHaveBeenCalledWith('Aviso publicado para a corrente.');
  });

  it('não publica sem título e texto', async () => {
    setup([]);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar aviso' }));
    });
    expect(await within(dialog).findByText('Escreva o título do aviso')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('agendar pede dia e hora e muda o botão', async () => {
    setup([]);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Agendar'));
    expect(within(dialog).getByRole('button', { name: 'Agendar aviso' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Texto/), { target: { value: 'Y' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Agendar aviso' }));
    });
    expect(within(dialog).getByText('Escolha o dia e a hora')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('editar um aviso publicado não mexe na data de publicação', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Gira de sexta começa às 20h30' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Agendar')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const [url, body] = mockPut.mock.calls[0];
    expect(url).toBe('/api/v1/admin/comunicados/c1');
    expect(body).not.toHaveProperty('publicar_em');
    expect(body).toMatchObject({ titulo: 'Gira de sexta começa às 20h30', fixado: true, publico: 'todos' });
  });
});

describe('Avisos — "Avisar por e-mail também" (AM-15)', () => {
  it('marcar a caixa manda avisar_email no POST', async () => {
    setup([]);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'Mutirão' } });
    fireEvent.change(within(dialog).getByLabelText(/Texto/), { target: { value: 'Tragam luvas' } });
    const caixa = within(dialog).getByRole('checkbox', { name: 'Avisar por e-mail também' });
    expect(caixa).not.toBeChecked();
    fireEvent.click(caixa);
    expect(within(dialog).getByText(/O assunto não mostra o título/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar aviso' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1]).toMatchObject({ titulo: 'Mutirão', avisar_email: true });
  });

  it('editar traz a caixa marcada quando o aviso já pediu e-mail', async () => {
    setup([{ ...LISTA[0], avisar_email: true }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Gira de sexta começa às 20h30' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'Avisar por e-mail também' })).toBeChecked();
  });

  it('sem COMUNICADOS:insert a caixa não aparece no novo aviso (quem só edita vê na edição)', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a !== 'insert');
    setup();
    expect(screen.queryByRole('button', { name: /Novo aviso/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Gira de sexta começa às 20h30' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('aviso-email')).toBeInTheDocument();
  });
});

describe('Avisos — quem leu', () => {
  it('abas "Ainda não leram" / "Leram" e mensagem pronta para lembrar', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver quem leu: Gira de sexta começa às 20h30' }));

    expect(await screen.findByText('1 de 3')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/comunicados/c1/leituras');
    const naoTab = screen.getByRole('tab', { name: 'Ainda não leram (2)' });
    expect(naoTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Beto Souza')).toBeInTheDocument();
    expect(screen.getByText('Caio Lima')).toBeInTheDocument();
    expect(screen.queryByText('Ana Paula')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Leram (1)' }));
    expect(await screen.findByText('Ana Paula')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Ainda não leram (2)' }));
    fireEvent.click(await screen.findByRole('button', { name: /Lembrar quem não leu/ }));
    const msg = await screen.findByTestId('mensagem-lembrete');
    expect(msg.textContent).toBe(
      `Oi! Tem aviso novo da casa na Área do Médium: "Gira de sexta começa às 20h30". Dá uma olhada lá: ${window.location.origin}/medium/avisos/c1`,
    );
    expect(screen.getByRole('link', { name: /Abrir o WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar mensagem/ }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(msg.textContent);
    expect(mockSuccess).toHaveBeenCalledWith('Mensagem copiada. Cole no WhatsApp.');
  });

  it('excluir pede confirmação e chama o DELETE', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Campanha do agasalho' }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    });
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/v1/admin/comunicados/c2'));
  });
});

describe('Avisos — público "Grupos da corrente" (AM-23)', () => {
  const OPCOES = [
    { id: 'g1', nome: 'G1', cor: 'ambar', total_membros: 4 },
    { id: 'g2', nome: 'Ogãs', cor: 'petroleo', total_membros: 2 },
  ];
  const AVISO_GRUPO = {
    ...LISTA[0],
    id: 'c3',
    titulo: 'Faxina de sábado',
    publico: 'grupos',
    fixado: false,
    grupos: [{ id: 'g1', nome: 'G1', cor: 'ambar' }],
    leituras: { lidos: 1, total: 4 },
  };

  function setupGrupos(lista: unknown[] = [AVISO_GRUPO], opcoes = OPCOES) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/v1/admin/comunicados') return Promise.resolve({ data: lista });
      if (url === '/api/v1/admin/corrente-grupos/opcoes') return Promise.resolve({ data: opcoes });
      if (url.endsWith('/leituras')) return Promise.resolve({ data: LEITURAS });
      return Promise.resolve({ data: {} });
    });
    const Page = require('@/pages/admin/comunicados').default;
    return render(<Page />);
  }

  it('lista mostra "Só G1" e a etiqueta do grupo', async () => {
    setupGrupos();
    const [item] = await screen.findAllByTestId('comunicado-item');
    expect(within(item).getByText(/Só G1/)).toBeInTheDocument();
    expect(within(within(item).getByTestId('aviso-grupos')).getByText('G1')).toBeInTheDocument();
    expect(within(item).getByText('lido por 1 de 4')).toBeInTheDocument();
  });

  it('publicar para grupos exige grupo e manda grupo_ids', async () => {
    const user = userEvent.setup();
    setupGrupos([]);
    await user.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'Faxina' } });
    fireEvent.change(within(dialog).getByLabelText(/Texto/), { target: { value: 'Sábado às 9h.' } });
    await user.click(within(dialog).getByLabelText(/Grupos da corrente/));

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar aviso' }));
    });
    expect(await within(dialog).findByText('Escolha pelo menos um grupo')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('combobox', { name: /Grupos/ }));
    await user.click(await screen.findByText('Ogãs'));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar aviso' }));
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/comunicados', {
      titulo: 'Faxina',
      corpo: 'Sábado às 9h.',
      publico: 'grupos',
      grupo_ids: ['g2'],
      fixado: false,
      avisar_email: false,
      expira_em: null,
      publicar_em: null,
    });
  });

  it('editar aviso de grupo vem com o grupo escolhido', async () => {
    setupGrupos();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Faxina de sábado' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Tirar G1' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1]).toMatchObject({ publico: 'grupos', grupo_ids: ['g1'] });
  });

  it('sem grupos cadastrados, explica onde criar', async () => {
    setupGrupos([], []);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Grupos da corrente/));
    expect(await within(dialog).findByTestId('aviso-sem-grupos')).toHaveTextContent('Crie em Médiuns → Grupos');
  });

  it('quem só vê avisos não busca as opções de grupo', async () => {
    mockGroupCan.mockImplementation((_f: string, a: string) => a === 'view');
    setupGrupos();
    await screen.findAllByTestId('comunicado-item');
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/admin/corrente-grupos/opcoes');
  });
});
