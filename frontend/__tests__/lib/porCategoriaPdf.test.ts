/**
 * @jest-environment node
 */
/**
 * PDF "Relatório por categoria": gera de verdade (jsPDF + autotable) e confere o arquivo,
 * as páginas (retrato + paisagem mês a mês).
 */
// O Jest não transforma o build ESM do jsPDF: ambiente node + build CommonJS de node (o mesmo código).
// `save` vira captura do arquivo (nome, páginas e conteúdo).
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
import { gerarPorCategoriaPdf, subtituloPdf } from '@/lib/pdf/porCategoriaPdf';
import type { PorCategoriaResponse } from '@/lib/financeiroPorCategoria';

const base: PorCategoriaResponse = {
  data_inicio: '2026-09-01',
  data_fim: '2026-10-31',
  meses: [
    { ano: 2026, mes: 9, mes_label: 'Set/26' },
    { ano: 2026, mes: 10, mes_label: 'Out/26' },
  ],
  receitas: [
    { categoria_id: 'm', nome: 'Mensalidades', cor: '#1D9E75', realizado: 190, qtd_realizado: 2, em_aberto: 0, qtd_em_aberto: 0, percentual: 100, por_mes: [100, 90] },
  ],
  despesas: [],
  total_receitas: 190,
  total_despesas: 0,
  total_a_receber: 0,
  total_a_pagar: 0,
};

describe('porCategoriaPdf', () => {
  let saved: Salvo | undefined;
  beforeEach(() => {
    mockSalvos.length = 0;
  });

  it('subtítulo com o período e a regra de datas', () => {
    expect(subtituloPdf(base)).toBe('01/09/2026 a 31/10/2026 · Realizado pela data de pagamento; em aberto pelo vencimento');
  });

  it('dois meses: página do resumo + página mês a mês só das entradas (saídas vazias não ganham página)', async () => {
    await gerarPorCategoriaPdf(base, { nome: 'Tenda Luz', primaryColor: '#123456' });
    saved = mockSalvos[0];
    expect(saved?.name).toBe('categorias-tenda-luz-2026-09-01-a-2026-10-31.pdf');
    expect(saved?.pages).toBe(2);
  });

  it('um mês: só a página do resumo', async () => {
    await gerarPorCategoriaPdf({ ...base, meses: base.meses.slice(0, 1) }, { nome: 'Tenda Luz', primaryColor: '#123456' });
    expect(mockSalvos[0]?.pages).toBe(1);
  });
});
