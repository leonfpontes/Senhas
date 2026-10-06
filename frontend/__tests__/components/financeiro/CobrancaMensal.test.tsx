/**
 * CobrancaMensal — status efetivo, KPIs, guards de edição e "Marcar como pago" em lote.
 */
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import {
  CobrancaMensal,
  cobrancaStatusEfetivo,
  computeCobrancaKpis,
  type CobrancaItem,
} from '@/components/financeiro/CobrancaMensal';

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError, showInfo: jest.fn() }),
}));

const item = (over: Partial<CobrancaItem>): CobrancaItem => ({
  id: 'x',
  nome: 'X',
  status: null,
  data_pagamento: null,
  valor_vigente: 50,
  valor_pago: null,
  comprovante_filename: null,
  observacao: null,
  ...over,
});

const ITEMS: CobrancaItem[] = [
  item({ id: 'a', nome: 'Ana', status: 'PAGO', valor_pago: 50, data_pagamento: '2026-10-03' }),
  item({ id: 'b', nome: 'Bruno', status: 'PENDENTE' }),
  item({ id: 'c', nome: 'Carla', isentoPermanente: true }),
  item({ id: 'd', nome: 'Davi' }),
];

describe('cobrancaStatusEfetivo', () => {
  it('pendente vira inadimplente depois do vencimento', () => {
    expect(cobrancaStatusEfetivo({ status: 'PENDENTE' }, '2026-10', 10, '2026-10-10')).toBe('PENDENTE');
    expect(cobrancaStatusEfetivo({ status: 'PENDENTE' }, '2026-10', 10, '2026-10-11')).toBe('INADIMPLENTE');
    expect(cobrancaStatusEfetivo({ status: null }, '2026-09', 10, '2026-10-01')).toBe('INADIMPLENTE');
  });

  it('pago e isento (inclusive permanente sem registro) não vencem', () => {
    expect(cobrancaStatusEfetivo({ status: 'PAGO' }, '2026-01', 10, '2026-10-01')).toBe('PAGO');
    expect(cobrancaStatusEfetivo({ status: 'ISENTO' }, '2026-01', 10, '2026-10-01')).toBe('ISENTO');
    expect(cobrancaStatusEfetivo({ status: null, isentoPermanente: true }, '2026-01', 10, '2026-10-01')).toBe('ISENTO');
  });
});

describe('computeCobrancaKpis', () => {
  it('soma esperado/arrecadado e conta inadimplentes, ignorando isentos', () => {
    const kpis = computeCobrancaKpis([{ items: ITEMS, valor: 50 }], '2026-10', 10, '2026-10-20');
    expect(kpis).toEqual({ esperado: 150, arrecadado: 50, inadimplentes: 2, emAberto: 100 });
  });
});

describe('<CobrancaMensal />', () => {
  beforeEach(() => jest.clearAllMocks());

  it('somente leitura: sem "Registrar" nem seleção', () => {
    render(
      <CobrancaMensal mes="2026-10" items={ITEMS} canEdit={false} entidade="médium" diaVencimento={10} onRegistrar={jest.fn()} />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar pagamento de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('filtra por nome', () => {
    render(<CobrancaMensal mes="2026-10" items={ITEMS} canEdit entidade="médium" onRegistrar={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Buscar por nome'), { target: { value: 'bru' } });
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('marca como pago em lote após confirmar e recarrega uma vez', async () => {
    const onRegistrar = jest.fn().mockResolvedValue(undefined);
    const onChanged = jest.fn();
    render(
      <CobrancaMensal
        mes="2026-10"
        items={ITEMS}
        canEdit
        entidade="médium"
        valorPadrao={50}
        onRegistrar={onRegistrar}
        onChanged={onChanged}
      />,
    );

    const linhas = screen.getAllByRole('checkbox', { name: 'Selecionar linha' });
    fireEvent.click(linhas[1]); // Bruno
    fireEvent.click(linhas[3]); // Davi

    const toolbar = screen.getByRole('toolbar', { name: 'Ações em lote' });
    expect(within(toolbar).getByText('2 selecionados')).toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole('button', { name: /Marcar como pago/ }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como pago' }));

    await waitFor(() => expect(onRegistrar).toHaveBeenCalledTimes(2));
    const ids = onRegistrar.mock.calls.map((c) => c[0].id).sort();
    expect(ids).toEqual(['b', 'd']);
    expect(onRegistrar.mock.calls[0][1]).toMatchObject({ status: 'PAGO', valor_pago: 50 });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockShowSuccess).toHaveBeenCalledWith('2 pagamentos registrados.');
  });
});
