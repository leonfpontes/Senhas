/**
 * Saldo "depois desta movimentação" no MovimentacaoDrawer. Na edição o saldo do item
 * (vindo da API) já inclui a movimentação editada — contava duas vezes.
 */
import { saldoAposMovimentacao } from '@/components/estoque/MovimentacaoDrawer';

describe('saldoAposMovimentacao', () => {
  it('criação: aplica a movimentação sobre o saldo atual', () => {
    expect(saldoAposMovimentacao(10, 'entrada', 5)).toBe(15);
    expect(saldoAposMovimentacao(10, 'saida', 5)).toBe(5);
  });

  it('edição sem mudar nada mantém o saldo atual', () => {
    // saldo 5 já inclui a saída de 5 em edição (era 10 antes dela)
    expect(saldoAposMovimentacao(5, 'saida', 5, { tipo: 'saida', quantidade: 5 })).toBe(5);
    expect(saldoAposMovimentacao(15, 'entrada', 5, { tipo: 'entrada', quantidade: 5 })).toBe(15);
  });

  it('edição troca quantidade e tipo desfazendo a original primeiro', () => {
    expect(saldoAposMovimentacao(5, 'saida', 8, { tipo: 'saida', quantidade: 5 })).toBe(2);
    expect(saldoAposMovimentacao(5, 'entrada', 5, { tipo: 'saida', quantidade: 5 })).toBe(15);
  });
});
