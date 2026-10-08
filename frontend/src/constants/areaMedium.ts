/**
 * Área do Médium — textos do convite e do consentimento (AM-03).
 *
 * O consentimento (LGPD art. 11: ser médium revela convicção religiosa) é gravado no aceite
 * com a versão abaixo, espelho de `CONSENTIMENTO_AREA_VERSAO` em
 * `backend/src/services/medium_convite.py` (o teste `test_medium_convite.py` confere). Mudou o
 * texto → suba a versão nos dois lugares.
 */
/** Mesmo canal de `PRIVACY_EMAIL` (LegalPageLayout); repetido para não puxar a moldura legal para o convite. */
const PRIVACY_EMAIL = 'privacidade@girahub.com.br';

export const AREA_MEDIUM_CONSENTIMENTO_VERSAO = '1';

/** Rótulo da caixa de consentimento no aceite do convite. */
export function consentimentoAreaLabel(casa: string): string {
  return `Li o termo e autorizo ${casa} a usar meus dados na Área do Médium.`;
}

/** Texto completo do termo ("Ler o termo"), em linguagem simples (LGPD art. 9º e 11, I). */
export function termoAreaParagrafos(casa: string): string[] {
  return [
    `Ao ativar seu acesso, você autoriza ${casa} a usar seus dados na Área do Médium do GiraHub para organizar a corrente: a agenda das giras e atividades, os avisos da casa, a mensalidade e, quando a casa usar, as escalas e a presença.`,
    'Os dados usados são: seu nome, e-mail, telefone, data de aniversário e endereço (quando a casa tiver), as mensalidades e os comprovantes que você enviar, suas respostas às escalas, suas presenças e os motivos de ausência que você contar.',
    'Quem vê: só a direção da casa e as pessoas que ela autorizar no painel. Os outros médiuns não veem nada seu.',
    'Por que pedimos a sua autorização: fazer parte da corrente de um terreiro revela a sua religião, e a Lei Geral de Proteção de Dados (LGPD) trata isso como dado sensível. Por isso o acesso só existe com o seu sim.',
    `O papel de cada um: ${casa} decide como os seus dados são usados. O GiraHub guarda e processa os dados para a casa e não usa para nenhuma outra finalidade — nada de anúncios nem venda de dados.`,
    `Você pode mudar de ideia: peça à casa para encerrar o seu acesso quando quiser. Para ver ou corrigir seus dados, fale com a casa; se precisar, escreva para ${PRIVACY_EMAIL}. Mais detalhes na Política de Privacidade (girahub.com.br/privacidade).`,
  ];
}

export const TERMO_AREA_RODAPE = `Versão ${AREA_MEDIUM_CONSENTIMENTO_VERSAO} · outubro de 2026`;

/** Para onde o aceite leva (casca da Área, AM-06). */
export const AREA_MEDIUM_HOME = '/medium';

/**
 * Chave de lançamento da divulgação pública da Área (AM-24): link "Sou médium / Recebi um convite"
 * no topo da landing e no /login, linha "Área do Médium" no comparativo de planos e a pergunta
 * "Os médiuns têm acesso?" no FAQ. DESLIGADA por padrão — a Área está em piloto (chave por terreiro).
 * `NEXT_PUBLIC_*` entra no bundle no build: em produção vem da variável homônima do ambiente
 * `Hostinger` no GitHub (deploy.yml → ARG do frontend/Dockerfile). Ligar = `true` e redeployar.
 * Leia na renderização (nunca numa constante de módulo): os testes trocam o valor por um getter.
 */
export const AREA_MEDIUM_DIVULGADA = process.env.NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA === 'true';

/** Texto do link público que leva à explicação de como o médium entra (AM-24). */
export const SOU_MEDIUM_LABEL = 'Sou médium / Recebi um convite';
