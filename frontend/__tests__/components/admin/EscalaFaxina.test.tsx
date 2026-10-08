/**
 * AM-25 — aba "Escala de faxina" (`components/admin/atividades/EscalaFaxina`): PlanLocked sem o
 * plano `escalas`, começar (copiar/vazio), tocar num grupo e nos dias, atalhos (girar salva antes,
 * distribuir), resumo em texto, publicar com ConfirmDialog e contagens, atualizar convocações e
 * modo só leitura.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));

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
const mockPlanCan = jest.fn((_f: string) => true);
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockPlanCan, subscription: { plan: 'pro' }, loading: false }),
}));
const mockGroupCan = jest.fn((_f: string, _a: string) => true);
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroupCan, permissions: null, loading: false, refresh: jest.fn() }),
}));
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockSuccess, showError: mockError }),
}));

import { EscalaFaxina } from '@/components/admin/atividades/EscalaFaxina';

const TIPOS = [
  { id: 't-faxina', nome: 'Faxina', natureza: 'atividade', modo_escala: 'grupos_por_dia', arquivado_em: null },
  { id: 't-reuniao', nome: 'Reunião', natureza: 'atividade', modo_escala: 'nenhuma', arquivado_em: null },
];
const GRUPOS = [
  { id: 'g1', nome: 'G1', cor: 'ambar', total_membros: 3, arquivado: false },
  { id: 'g2', nome: 'G2', cor: 'petroleo', total_membros: 2, arquivado: false },
];
const PEND_VAZIA = { criar: 0, cancelar: 0, trocar: 0, reagendar: 0, ignorados_passado: 0, tem_mudancas: false };

let ym = '';
function plano(extra: Record<string, unknown> = {}) {
  return {
    tipo: { id: 't-faxina', nome: 'Faxina', icone: 'faxina', cor: 'petroleo' },
    mes: ym,
    hoje: '2000-01-01',
    existe: true,
    status: 'rascunho',
    publicado_em: null,
    publicado_por: null,
    hora_inicio_padrao: '09:00',
    hora_fim_padrao: '12:00',
    grupos: GRUPOS,
    dias: [],
    pendencias: PEND_VAZIA,
    mes_anterior_dias: 0,
    proximas_publicadas: 0,
    ...extra,
  };
}
const d = (dia: number, grupo_id: string, publicado = false) => ({
  data: `${ym}-${String(dia).padStart(2, '0')}`,
  grupo_id,
  hora_inicio: '09:00',
  hora_fim: '12:00',
  publicado,
});

function setup(primeiro: Record<string, unknown> | ((url: string) => Record<string, unknown>)) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/atividades/tipos') return Promise.resolve({ data: TIPOS });
    const m = url.match(/escala-planos\/t-faxina\/(\d{4}-\d{2})$/);
    if (m) {
      ym = m[1];
      return Promise.resolve({ data: typeof primeiro === 'function' ? primeiro(url) : plano(primeiro) });
    }
    return Promise.reject(new Error(`url inesperada ${url}`));
  });
  return render(<EscalaFaxina />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanCan.mockImplementation(() => true);
  mockGroupCan.mockImplementation(() => true);
});

const dia = (n: number) => screen.getByRole('button', { name: new RegExp(`^Dia ${n},`) });

it('sem o plano escalas: PlanLocked com o plano mínimo do catálogo e sem chamar a API', () => {
  mockPlanCan.mockImplementation((f: string) => f !== 'escalas');
  setup({});
  expect(screen.getByText('Recurso indisponível')).toBeInTheDocument();
  expect(screen.getByText('Escala de faxina')).toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
});

it('sem escalas:view mostra PermissionDenied', () => {
  mockGroupCan.mockImplementation((_f, a) => a !== 'view');
  setup({});
  expect(screen.getByText('Você não tem permissão para visualizar este módulo.')).toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
});

it('mês sem escala oferece copiar do mês anterior ou começar vazio', async () => {
  setup({ existe: false, status: null, mes_anterior_dias: 5 });
  const card = await screen.findByTestId('escala-comecar');
  expect(within(card).getByText(/tem 5 dias na escala/)).toBeInTheDocument();
  mockPost.mockResolvedValueOnce({ data: plano({ dias: [d(7, 'g1')], descartados: 1, mes_anterior_dias: 5 }) });
  fireEvent.click(within(card).getByRole('button', { name: /Copiar do mês anterior/ }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/api/v1/admin/escala-planos/t-faxina/${ym}/copiar-mes-anterior`));
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith(expect.stringMatching(/pela ordem dos dias da semana\. 1 dia ficou de fora/)));
  expect(screen.getByTestId('escala-resumo')).toHaveTextContent('G1: dia 7');
});

it('começar vazio, tocar num grupo e nos dias: o dia ganha o grupo, aceita dois grupos e tira no segundo toque', async () => {
  setup({ existe: false, status: null });
  fireEvent.click(await screen.findByRole('button', { name: 'Começar vazio' }));
  expect(screen.getByTestId('ficha-G1')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(dia(7));
  expect(dia(7)).toHaveAccessibleName(/: G1$/);
  fireEvent.click(screen.getByTestId('ficha-G2'));
  fireEvent.click(dia(7));
  fireEvent.click(dia(21));
  expect(dia(7)).toHaveAccessibleName(/: G1 e G2$/);
  expect(screen.getByTestId('escala-resumo')).toHaveTextContent('G1: dia 7 · G2: dias 7 e 21');
  expect(screen.getByTestId('ficha-G2')).toHaveTextContent('2 dias');
  fireEvent.click(dia(21));
  expect(screen.getByTestId('escala-resumo')).toHaveTextContent('G1: dia 7 · G2: dia 7');

  // Salvar rascunho manda o rascunho inteiro.
  mockPut.mockResolvedValueOnce({ data: plano({ dias: [d(7, 'g1'), d(7, 'g2')] }) });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
  await waitFor(() => expect(mockPut).toHaveBeenCalled());
  const [url, body] = mockPut.mock.calls[0];
  expect(url).toBe(`/api/v1/admin/escala-planos/t-faxina/${ym}`);
  expect(body.dias.map((x: any) => [x.data.slice(8), x.grupo_id])).toEqual([['07', 'g1'], ['07', 'g2']]);
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('Rascunho salvo. Os médiuns ainda não veem.'));
});

it('girar salva o que mudou antes e distribuir manda os dias da semana e os grupos em ordem', async () => {
  setup({ dias: [d(7, 'g1')] });
  await screen.findByTestId('grade-mes');
  fireEvent.click(dia(14)); // G1 no 14 (sujo)
  mockPut.mockResolvedValueOnce({ data: plano({ dias: [d(7, 'g1'), d(14, 'g1')] }) });
  mockPost.mockResolvedValueOnce({ data: plano({ dias: [d(7, 'g2'), d(14, 'g2')] }) });
  fireEvent.click(screen.getByRole('button', { name: /Girar grupos/ }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/api/v1/admin/escala-planos/t-faxina/${ym}/girar-grupos`, { grupo_ids: ['g1', 'g2'] }));
  expect(mockPut).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByTestId('escala-resumo')).toHaveTextContent('G2: dias 7 e 14'));
  expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('G2 pegou os dias do G1'));

  fireEvent.click(screen.getByRole('button', { name: /^Distribuir…/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'domingos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descer G1' }));
  mockPost.mockResolvedValueOnce({ data: plano({ dias: [d(1, 'g2'), d(7, 'g1')] }) });
  fireEvent.click(screen.getByRole('button', { name: 'Distribuir' }));
  await waitFor(() =>
    expect(mockPost).toHaveBeenLastCalledWith(`/api/v1/admin/escala-planos/t-faxina/${ym}/distribuir`, {
      dias_semana: [0, 6],
      grupo_ids: ['g2', 'g1'],
      hora_inicio: '09:00',
      hora_fim: '12:00',
    }),
  );
  await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('Dias distribuídos em ordem: G2, G1.'));
});

it('publicar abre a confirmação com as contagens e publica', async () => {
  setup({ dias: [d(7, 'g1'), d(14, 'g2')], pendencias: { ...PEND_VAZIA, criar: 2, tem_mudancas: true } });
  fireEvent.click(await screen.findByRole('button', { name: /^Publicar$/ }));
  const resumo = await screen.findByTestId('resumo-publicacao');
  expect(resumo).toHaveTextContent('2 faxinas em 2 dias · cerca de 5 convocações');
  expect(mockPut).not.toHaveBeenCalled(); // nada por salvar
  mockPost.mockResolvedValueOnce({
    data: {
      ...plano({ status: 'publicado', dias: [d(7, 'g1', true), d(14, 'g2', true)], proximas_publicadas: 2 }),
      resultado: { criadas: 2, canceladas: 0, trocadas: 0, reagendadas: 0, atividades: 0, convocados: 5, dispensados: 0, ignorados_passado: 0, fora_da_elegibilidade: 0 },
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/api/v1/admin/escala-planos/t-faxina/${ym}/publicar`));
  await waitFor(() =>
    expect(mockSuccess).toHaveBeenCalledWith('Escala publicada. 2 faxinas criadas · 5 pessoas postas na escala.'),
  );
  expect(await screen.findByText(/Os médiuns dos grupos já veem as faxinas na Agenda/)).toBeInTheDocument();
});

it('publicada: mudanças mostram o diff; sem mudança, "Atualizar convocações das próximas faxinas"', async () => {
  setup({
    status: 'publicado',
    publicado_em: '2026-10-01T12:00:00Z',
    publicado_por: 'Dirigente',
    dias: [d(7, 'g1', true)],
    proximas_publicadas: 1,
  });
  const publicarMudancas = await screen.findByRole('button', { name: /Publicar as mudanças/ });
  expect(publicarMudancas).toBeDisabled();
  expect(screen.getByText(/por Dirigente/)).toBeInTheDocument();

  mockPost.mockResolvedValueOnce({
    data: {
      ...plano({ status: 'publicado', dias: [d(7, 'g1', true)], proximas_publicadas: 1 }),
      resultado: { criadas: 0, canceladas: 0, trocadas: 0, reagendadas: 0, atividades: 1, convocados: 1, dispensados: 1, ignorados_passado: 0, fora_da_elegibilidade: 0 },
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Atualizar convocações das próximas faxinas/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Atualizar' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith(`/api/v1/admin/escala-planos/t-faxina/${ym}/atualizar-convocacoes`));
  await waitFor(() =>
    expect(mockSuccess).toHaveBeenCalledWith('1 faxina conferida · 1 pessoa posta na escala · 1 pessoa tirada da escala.'),
  );

  // Trocar o grupo do dia 7 e publicar: salva antes e mostra o diff que o servidor calculou.
  fireEvent.click(screen.getByTestId('ficha-G2'));
  fireEvent.click(dia(7));
  expect(screen.getByText(/Há mudanças que os médiuns ainda não veem/)).toBeInTheDocument();
  mockPut.mockResolvedValueOnce({
    data: plano({
      status: 'publicado',
      dias: [d(7, 'g1', true), d(7, 'g2')],
      pendencias: { ...PEND_VAZIA, criar: 1, tem_mudancas: true },
    }),
  });
  fireEvent.click(screen.getByRole('button', { name: /Publicar as mudanças/ }));
  expect(await screen.findByTestId('resumo-publicacao')).toHaveTextContent('1 faxina nova');
  expect(mockPut).toHaveBeenCalledTimes(1);
});

it('só leitura (sem escalas:edit): sem botões de mexer e a grade não é tocável', async () => {
  mockGroupCan.mockImplementation((_f, a) => a === 'view');
  setup({ dias: [d(7, 'g1')] });
  await screen.findByTestId('grade-mes');
  expect(screen.queryByRole('button', { name: /^Dia 7,/ })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /^Dia 7, .*: G1$/ })).toBeInTheDocument();
  for (const nome of [/Salvar rascunho/, /Publicar/, /Girar grupos/, /Distribuir/, /Novo grupo/]) {
    expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
  }
  expect(screen.queryByText('Novo grupo')).not.toBeInTheDocument();
  expect(screen.getByTestId('escala-resumo')).toHaveTextContent('G1: dia 7');
});

it('sem tipo com escala por grupos: orienta a configurar o tipo', async () => {
  mockGet.mockImplementation((url: string) =>
    url === '/api/v1/admin/atividades/tipos' ? Promise.resolve({ data: [TIPOS[1]] }) : Promise.reject(new Error(url)),
  );
  render(<EscalaFaxina />);
  expect(await screen.findByText('Nenhum tipo usa a escala por grupos')).toBeInTheDocument();
});
