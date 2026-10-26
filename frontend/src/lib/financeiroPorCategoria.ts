/**
 * Financeiro por categoria — tipos de `GET /api/v1/admin/financeiro/por-categoria` e o CSV da
 * tela `/admin/financeiro/por-categoria` (o PDF fica em `lib/pdf/porCategoriaPdf`).
 *
 * Mesmas regras do Fluxo de caixa: `realizado` = pago no período (data de pagamento, valor
 * pago); `em_aberto` = pendente/vencido com vencimento no período. Cancelado não entra.
 */

export interface CategoriaTotal {
  /** null = lançamentos sem categoria */
  categoria_id: string | null;
  nome: string;
  cor: string | null;
  realizado: number;
  qtd_realizado: number;
  em_aberto: number;
  qtd_em_aberto: number;
  /** % do realizado do tipo no período (0–100) */
  percentual: number;
  /** realizado em cada mês de `meses` */
  por_mes: number[];
}

export interface MesRef {
  ano: number;
  mes: number;
  mes_label: string;
}

export interface PorCategoriaResponse {
  data_inicio: string;
  data_fim: string;
  meses: MesRef[];
  receitas: CategoriaTotal[];
  despesas: CategoriaTotal[];
  total_receitas: number;
  total_despesas: number;
  total_a_receber: number;
  total_a_pagar: number;
}

export type LadoCategoria = 'receitas' | 'despesas';

export const ROTULO_LADO: Record<LadoCategoria, { titulo: string; realizado: string; emAberto: string }> = {
  receitas: { titulo: 'Entradas', realizado: 'Recebido', emAberto: 'A receber' },
  despesas: { titulo: 'Saídas', realizado: 'Pago', emAberto: 'A pagar' },
};

/** Mesmas cores oferecidas no cadastro de categoria; usadas quando a categoria não tem cor. */
const CORES_PADRAO = ['#1D9E75', '#378ADD', '#D4537E', '#BA7517', '#A32D2D', '#534AB7', '#0F766E', '#64748B'];
const COR_SEM_CATEGORIA = '#9CA3AF';

export function corDaCategoria(c: Pick<CategoriaTotal, 'categoria_id' | 'cor'>, indice: number): string {
  if (c.cor) return c.cor;
  if (c.categoria_id === null) return COR_SEM_CATEGORIA;
  return CORES_PADRAO[indice % CORES_PADRAO.length];
}

export function totaisDoLado(
  dados: PorCategoriaResponse,
  lado: LadoCategoria,
): { realizado: number; emAberto: number; qtd: number; porMes: number[] } {
  const itens = dados[lado];
  return {
    realizado: lado === 'receitas' ? dados.total_receitas : dados.total_despesas,
    emAberto: lado === 'receitas' ? dados.total_a_receber : dados.total_a_pagar,
    qtd: itens.reduce((s, c) => s + c.qtd_realizado, 0),
    porMes: dados.meses.map((_, i) => Math.round(itens.reduce((s, c) => s + (c.por_mes[i] ?? 0), 0) * 100) / 100),
  };
}

/** Valor em reais no formato da planilha brasileira (vírgula decimal, sem "R$"). */
const numeroCsv = (v: number) => v.toFixed(2).replace('.', ',');
const percentualCsv = (v: number) => v.toFixed(1).replace('.', ',');

function escaparCsv(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV separado por ";" (abre direto no Excel em português): uma linha por categoria e lado,
 * com o realizado de cada mês quando o período tem mais de um mês.
 */
export function porCategoriaCsv(dados: PorCategoriaResponse): string {
  const variosMeses = dados.meses.length > 1;
  const header = [
    'Tipo',
    'Categoria',
    'Lançamentos pagos',
    'Realizado (R$)',
    '% do total',
    'Em aberto (R$)',
    ...(variosMeses ? dados.meses.map((m) => m.mes_label) : []),
  ];
  const linhas: string[][] = [];
  (['receitas', 'despesas'] as const).forEach((lado) => {
    for (const c of dados[lado]) {
      linhas.push([
        ROTULO_LADO[lado].titulo,
        c.nome,
        String(c.qtd_realizado),
        numeroCsv(c.realizado),
        percentualCsv(c.percentual),
        numeroCsv(c.em_aberto),
        ...(variosMeses ? c.por_mes.map(numeroCsv) : []),
      ]);
    }
    const t = totaisDoLado(dados, lado);
    linhas.push([
      ROTULO_LADO[lado].titulo,
      'Total',
      String(t.qtd),
      numeroCsv(t.realizado),
      t.realizado ? '100,0' : '0,0',
      numeroCsv(t.emAberto),
      ...(variosMeses ? t.porMes.map(numeroCsv) : []),
    ]);
  });
  return [header, ...linhas].map((l) => l.map(escaparCsv).join(';')).join('\r\n');
}
