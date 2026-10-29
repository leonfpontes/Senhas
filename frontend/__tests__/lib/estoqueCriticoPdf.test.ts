/**
 * @jest-environment node
 */
/**
 * PDF "Itens para repor" do estoque: seleção (zerados, negativos, abaixo do mínimo), ordem,
 * custo de reposição e geração de verdade (jsPDF + autotable).
 */
// O Jest não transforma o build ESM do jsPDF: ambiente node + build CommonJS de node (o mesmo código).
type Salvo = { name: string; pages: number };
const mockSalvos: Salvo[] = [];
jest.mock('jspdf', () => {
  const real = jest.requireActual('jspdf/dist/jspdf.node.js');
  class JsPdfDeTeste extends real.jsPDF {
    constructor(...args: unknown[]) {
      super(...args);
      this.save = (name: string) => {
        mockSalvos.push({ name, pages: this.getNumberOfPages() });
        return this;
      };
    }
  }
  return { ...real, jsPDF: JsPdfDeTeste };
});
import {
  custoReposicao,
  gerarEstoqueCriticoPdf,
  itensParaRepor,
  resumoReposicao,
  type EstoqueItemPdf,
} from '@/lib/pdf/estoqueCriticoPdf';

const base = { grupo_nome: null, descricao: null, unidade_medida: 'UN', custo_unitario: null };
const ITENS: EstoqueItemPdf[] = [
  { ...base, nome: 'Vela branca', estoque_minimo: 10, saldo: 50 },
  { ...base, nome: 'Defumador', grupo_nome: 'Ervas', estoque_minimo: 10, saldo: 4, custo_unitario: 2.5 },
  { ...base, nome: 'Pemba', grupo_nome: 'Ervas', estoque_minimo: 5, saldo: 0, custo_unitario: 3 },
  { ...base, nome: 'Fita', estoque_minimo: 0, saldo: 0 },
  { ...base, nome: 'Copo', estoque_minimo: 0, saldo: 7 },
  { ...base, nome: 'Alguidar', estoque_minimo: 2, saldo: -1 },
];

describe('estoqueCriticoPdf', () => {
  beforeEach(() => {
    mockSalvos.length = 0;
  });

  it('pega zerados (com ou sem mínimo), negativos e abaixo do mínimo; deixa os em dia de fora', () => {
    const lista = itensParaRepor(ITENS);
    expect(lista.map((i) => [i.nome, i.motivo, i.falta])).toEqual([
      ['Alguidar', 'negativo', 3],
      ['Fita', 'zerado', 0],
      ['Pemba', 'zerado', 5],
      ['Defumador', 'abaixo', 6],
    ]);
  });

  it('custo para repor até o mínimo só conta itens com custo', () => {
    expect(custoReposicao(itensParaRepor(ITENS))).toBe(5 * 3 + 6 * 2.5);
  });

  it('resumo do subtítulo', () => {
    expect(resumoReposicao(itensParaRepor(ITENS))).toBe('4 itens para repor · 3 zerados ou negativos · 1 abaixo do mínimo');
  });

  it('gera o arquivo com o grupo no nome', async () => {
    await gerarEstoqueCriticoPdf(ITENS, { nome: 'Tenda Luz', primaryColor: '#123456' }, { grupo: 'Ervas e Folhas' });
    expect(mockSalvos[0].name).toMatch(/^estoque-para-repor-ervas-e-folhas-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(mockSalvos[0].pages).toBe(1);
  });

  it('muitos itens quebram página', async () => {
    const muitos = Array.from({ length: 80 }, (_, i) => ({ ...base, nome: `Item ${i}`, estoque_minimo: 3, saldo: 0 }));
    await gerarEstoqueCriticoPdf(muitos, { nome: 'Tenda Luz', primaryColor: '#123456' });
    expect(mockSalvos[0].pages).toBeGreaterThan(1);
  });
});
