/**
 * Área do Médium — textos do convite e do consentimento (AM-03).
 *
 * O consentimento (LGPD art. 11: ser médium revela convicção religiosa) é gravado no aceite
 * com a versão abaixo, espelho de `CONSENTIMENTO_AREA_VERSAO` em
 * `backend/src/services/medium_convite.py` (o teste `test_medium_convite.py` confere). Mudou o
 * texto → suba a versão nos dois lugares.
 */
export const AREA_MEDIUM_CONSENTIMENTO_VERSAO = '1';

/** Rótulo da caixa de consentimento no aceite do convite. */
export function consentimentoAreaLabel(casa: string): string {
  return `Autorizo ${casa} a usar meu nome, meu contato e minhas mensalidades para organizar a corrente nesta área.`;
}

/** Texto completo do termo ("Ler o termo"). */
export function termoAreaParagrafos(casa: string): string[] {
  return [
    `${casa} usa seu nome, seu contato, seu aniversário, suas mensalidades e suas presenças para organizar a corrente na Área do Médium.`,
    'Só a direção da casa vê esses dados. Os outros médiuns não veem nada seu.',
    'O GiraHub guarda os dados para a casa e não usa para outra finalidade. Você pode pedir à casa para encerrar seu acesso quando quiser.',
  ];
}

export const TERMO_AREA_RODAPE = `Versão ${AREA_MEDIUM_CONSENTIMENTO_VERSAO} · outubro de 2026`;

/** Para onde o aceite leva (casca da Área, AM-06). */
export const AREA_MEDIUM_HOME = '/medium';
