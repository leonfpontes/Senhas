/**
 * AM-27 — Troca na escala na Área do Médium: frases do cartão (D-07: só primeiro nome, "um colega
 * da corrente" sem opt-in), "Pedir troca" com colegas ou "a direção escolhe", aceitar/recusar,
 * cancelar, só leitura impersonando e o opt-in "Colegas de escala" no Perfil.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/link', () => {
  const MockLink = React.forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} ref={ref} {...rest}>
      {children}
    </a>
  ));
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'font-fraunces', className: 'font-fraunces' }),
}));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/services/api_client', () => ({
  apiClient: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
  },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
const mockSuccess = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: jest.fn() }),
}));

import { fraseDaTroca, type TrocaMedium } from '@/constants/trocas';
import { TrocaCard } from '@/components/medium/troca/TrocaCard';
import { TrocaNaAtividade } from '@/components/medium/troca/TrocaNaAtividade';
import { ColegasDeEscala } from '@/components/medium/perfil/ColegasDeEscala';

function troca(extra: Partial<TrocaMedium> = {}): TrocaMedium {
  return {
    id: 't1',
    papel: 'para_mim',
    status: 'pedido',
    aguardando: 'colega',
    vigente: true,
    atividade: {
      origem: 'atividade',
      id: 'a1',
      titulo: 'Faxina · G1',
      inicio: '2026-10-12T12:00:00Z',
      tipo: { nome: 'Faxina', icone: 'faxina', cor: null },
      cancelada: false,
    },
    funcao: null,
    grupo: 'G1',
    colega: 'Ana',
    direcao_escolhe: false,
    recado: 'Depois eu cubro a sua',
    criada_em: '2026-10-08T12:00:00Z',
    fechada_em: null,
    fechada_por: null,
    pode_aceitar: true,
    pode_recusar: true,
    pode_cancelar: false,
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

describe('frases da troca', () => {
  it('fala do ponto de vista de quem lê, só com o primeiro nome', () => {
    expect(fraseDaTroca(troca())).toBe('Ana pediu para você ir no lugar dele(a).');
    expect(fraseDaTroca(troca({ status: 'aprovado', pode_aceitar: false }))).toBe(
      'Você está na escala no lugar de Ana.',
    );
    const pedi = troca({ papel: 'pedi', colega: 'Beto', pode_aceitar: false });
    expect(fraseDaTroca(pedi)).toBe('Pedido enviado a Beto. Esperando a resposta.');
    expect(fraseDaTroca({ ...pedi, status: 'aceito' })).toMatch(/^Beto aceitou ir no seu lugar\. Falta a direção aprovar/);
    expect(fraseDaTroca({ ...pedi, direcao_escolhe: true, colega: null })).toMatch(/direção da casa vai escolher/);
    // Indicado pela direção sem opt-in: sem nome (D-07).
    expect(fraseDaTroca({ ...pedi, status: 'aprovado', colega: null })).toBe(
      'Você trocou com um colega da corrente. Você não está mais nesta escala.',
    );
    expect(fraseDaTroca({ ...pedi, status: 'recusado', fechada_por: 'direcao' })).toBe(
      'A direção não aprovou a troca. Você continua na escala.',
    );
    for (const t of [troca(), pedi]) expect(fraseDaTroca(t).toLowerCase()).not.toContain('convoca');
  });
});

describe('TrocaCard', () => {
  it('quem foi chamado aceita: a troca vai para a direção', async () => {
    mockPost.mockResolvedValue({ data: troca({ status: 'aceito', aguardando: 'direcao', pode_aceitar: false, pode_recusar: false }) });
    render(<TrocaCard troca={troca()} comAtividade />);
    expect(screen.getByText('Recado:')).toBeInTheDocument();
    expect(screen.getByText('Ver detalhes').closest('a')).toHaveAttribute('href', '/medium/agenda/atividade/a1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Aceito ir/ }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/trocas/t1/aceitar');
    expect(mockSuccess).toHaveBeenCalledWith('Combinado! Agora falta a direção aprovar.');
    expect(screen.getByText('Você aceitou ir. Falta a direção da casa aprovar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceito ir/ })).not.toBeInTheDocument();
  });

  it('quem pediu cancela; impersonando não há botões', async () => {
    const pedi = troca({ papel: 'pedi', colega: 'Beto', pode_aceitar: false, pode_recusar: false, pode_cancelar: true });
    mockPost.mockResolvedValue({ data: { ...pedi, status: 'cancelado', pode_cancelar: false, fechada_por: 'solicitante' } });
    const { unmount } = render(<TrocaCard troca={pedi} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/medium/trocas/t1/cancelar');
    expect(screen.getByText('Você cancelou o pedido de troca.')).toBeInTheDocument();
    unmount();

    window.sessionStorage.setItem('impersonating', '1');
    render(<TrocaCard troca={troca()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('TrocaNaAtividade', () => {
  const URL = '/api/v1/medium/atividades/atividade/a1/troca';

  it('pede troca a um colega da lista com recado', async () => {
    mockGet.mockResolvedValue({
      data: { pode_pedir: true, exige_aprovacao: true, colegas: [{ id: 'm2', nome: 'Beto' }], pedido: null, para_mim: [] },
    });
    mockPost.mockResolvedValue({
      data: {
        pode_pedir: false,
        exige_aprovacao: true,
        colegas: [],
        pedido: troca({ papel: 'pedi', colega: 'Beto', pode_aceitar: false, pode_recusar: false, pode_cancelar: true }),
        para_mim: [],
      },
    });
    render(<TrocaNaAtividade origem="atividade" id="a1" />);
    expect(mockGet).toHaveBeenCalledWith(URL);
    fireEvent.click(await screen.findByRole('button', { name: /pedir troca/ }));
    expect(await screen.findByText('Nesta casa, a direção aprova a troca depois que o colega aceitar.')).toBeInTheDocument();
    const enviar = screen.getByRole('button', { name: 'Enviar pedido' });
    expect(enviar).toBeDisabled(); // com colegas na lista, precisa escolher
    fireEvent.click(screen.getByRole('radio', { name: /Beto/ }));
    fireEvent.change(screen.getByLabelText('Recado (se quiser)'), { target: { value: '  valeu!  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    });
    expect(mockPost).toHaveBeenCalledWith(URL, { colega_id: 'm2', recado: 'valeu!' });
    await waitFor(() => expect(screen.getByText('Pedido enviado a Beto. Esperando a resposta.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /pedir troca/ })).not.toBeInTheDocument();
  });

  it('ninguém aceitou aparecer: só "a direção escolhe"', async () => {
    mockGet.mockResolvedValue({ data: { pode_pedir: true, exige_aprovacao: false, colegas: [], pedido: null, para_mim: [] } });
    mockPost.mockResolvedValue({ data: { pode_pedir: false, exige_aprovacao: false, colegas: [], pedido: null, para_mim: [] } });
    render(<TrocaNaAtividade origem="atividade" id="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: /pedir troca/ }));
    expect(await screen.findByText(/Nenhum colega que pode ir escolheu mostrar o nome/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Deixar a direção escolher/ })).toHaveAttribute('aria-checked', 'true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    });
    expect(mockPost).toHaveBeenCalledWith(URL, {});
  });

  it('sem nada para mostrar (ou sem o plano): não aparece', async () => {
    mockGet.mockRejectedValue({ status: 403 });
    const { container } = render(<TrocaNaAtividade origem="gira" id="g1" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ColegasDeEscala (Perfil, D-07)', () => {
  it('padrão desligado; liga com PUT', async () => {
    mockGet.mockResolvedValue({ data: { mostrar_nome_colegas: false, colegas_disponivel: true } });
    mockPut.mockResolvedValue({ data: { mostrar_nome_colegas: true, colegas_disponivel: true } });
    render(<ColegasDeEscala />);
    const sw = await screen.findByTestId('mostrar-nome-colegas');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(mockPut).toHaveBeenCalledWith('/api/v1/medium/preferencias/colegas', { mostrar_nome: true });
    await waitFor(() => expect(screen.getByTestId('mostrar-nome-colegas')).toHaveAttribute('aria-checked', 'true'));
  });

  it('casa sem troca de escala: a seção some; impersonando, só leitura', async () => {
    mockGet.mockResolvedValue({ data: { mostrar_nome_colegas: false, colegas_disponivel: false } });
    const { container, unmount } = render(<ColegasDeEscala />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    mockGet.mockResolvedValue({ data: { mostrar_nome_colegas: true, colegas_disponivel: true } });
    render(<ColegasDeEscala somenteLeitura />);
    expect(await screen.findByTestId('mostrar-nome-colegas-estado')).toHaveTextContent('Ligado');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
