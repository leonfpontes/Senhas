/**
 * @jest-environment node
 */
/**
 * PDF do Fluxo de caixa — páginas dos lançamentos do mês (pedido do contador): cada recebido e
 * pago, com total de cada lado, desenhados como texto (autotable) depois do resumo.
 */
// O Jest não transforma o build ESM do jsPDF: ambiente node + build CommonJS de node (o mesmo código).
import { anexarLancamentosFluxo, linhasDoMes, type FluxoMesLancamentos } from '@/lib/pdf/fluxoLancamentosPdf';

const { jsPDF } = jest.requireActual('jspdf/dist/jspdf.node.js');
const { autoTable } = jest.requireActual('jspdf-autotable');

const abril: FluxoMesLancamentos = {
  ano: 2026,
  mes: 4,
  mes_label: 'Abr/26',
  receitas: 300,
  despesas: 125.5,
  lancamentos: [
    { id: '1', tipo: 'receber', data_pagamento: '2026-04-02', descricao: 'Doação', categoria_nome: null, conta_bancaria_nome: 'PJ', valor: 300 },
    { id: '2', tipo: 'pagar', data_pagamento: '2026-04-08', descricao: 'Conta de luz', categoria_nome: 'Energia', conta_bancaria_nome: 'PJ', valor: 125.5 },
  ],
};

const texto = (cell: unknown) => (typeof cell === 'object' && cell !== null ? String((cell as { content: unknown }).content) : String(cell));

describe('fluxoLancamentosPdf', () => {
  it('linhas do mês: bloco de recebidos e de pagos, cada um com o total', () => {
    const linhas = (linhasDoMes(abril, true) as unknown[][]).map((r) => r.map(texto));
    expect(linhas).toEqual([
      ['Recebidos (1)'],
      ['02/04/2026', 'Doação', '—', 'PJ', expect.stringContaining('300,00')],
      ['Total recebido', expect.stringContaining('300,00')],
      ['Pagos (1)'],
      ['08/04/2026', 'Conta de luz', 'Energia', 'PJ', expect.stringContaining('125,50')],
      ['Total pago', expect.stringContaining('125,50')],
    ]);
  });

  it('sem coluna Conta no relatório de uma conta só; mês sem pagamentos diz isso', () => {
    const linhas = (linhasDoMes({ ...abril, lancamentos: abril.lancamentos!.slice(0, 1) }, false) as unknown[][]).map((r) => r.map(texto));
    expect(linhas[1]).toHaveLength(4);
    expect(linhas.slice(3)).toEqual([['Pagos (0)'], ['Nenhum pagamento no mês.']]);
  });

  it('acrescenta as páginas depois do resumo e quebra a lista longa em mais páginas', () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const muitos = Array.from({ length: 80 }, (_, i) => ({
      id: String(i), tipo: 'pagar' as const, data_pagamento: '2026-05-10', descricao: `Despesa ${i}`,
      categoria_nome: null, conta_bancaria_nome: null, valor: 10,
    }));
    anexarLancamentosFluxo(pdf, autoTable, [abril, { ano: 2026, mes: 5, mes_label: 'Mai/26', receitas: 0, despesas: 800, lancamentos: muitos }], {
      brand: { nome: 'Tenda Luz', primaryColor: '#123456' },
      logo: null,
      subtitle: '01/04/2026 a 31/05/2026 · Todas as contas',
      comConta: true,
    });
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(3); // resumo + lançamentos em 2+ páginas
    const conteudo: string = pdf.output();
    expect(conteudo).toContain('Conta de luz');
    expect(conteudo).toContain('Despesa 79');
  });
});
