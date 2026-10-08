/**
 * Programa de Parceiros GiraHub (C-06) — regras, números e textos da página pública /parceiros.
 * Regras e economia explicadas para o dono em docs/programa-parceiros.md.
 *
 * Os valores em reais dos exemplos saem SEMPRE de constants/plans.ts (preço muda lá → muda aqui).
 */
import { PAID_PLANS, type PlanDef } from '@/constants/plans';
import { formatBRL } from '@/components/fields/MoneyInput';

export { formatBRL };

/**
 * Chave de lançamento da página /parceiros, do link "Seja parceiro" no rodapé e da chamada na
 * landing. DESLIGADA por padrão — o dono ainda aprova os números. Com ela desligada a página
 * responde 404 (getStaticProps → notFound), fica fora do sitemap e nada aponta para ela.
 * `NEXT_PUBLIC_*` entra no bundle no build: em produção vem da variável homônima do ambiente
 * `Hostinger` no GitHub (deploy.yml → ARG do frontend/Dockerfile). Ligar = `true` e redeployar.
 * Leia na renderização (nunca copie para outra constante de módulo): os testes trocam o valor por um getter.
 */
export const PARCEIROS_PUBLICADO = process.env.NEXT_PUBLIC_PARCEIROS_PUBLICADO === 'true';

export const PARCEIROS_PATH = '/parceiros';

/** Comissão recorrente do parceiro sobre o que o terreiro indicado paga. */
export const COMISSAO_PCT = 20;
/** Por quantos meses de pagamento do terreiro a comissão vale. */
export const COMISSAO_MESES = 12;
/** Desconto do terreiro indicado, com o cupom do parceiro. */
export const DESCONTO_PCT = 20;
/** Nos primeiros N meses de plano pago. */
export const DESCONTO_MESES = 3;
/** Valor mínimo acumulado para o PIX sair (abaixo disso, acumula para o mês seguinte). */
export const PAGAMENTO_MINIMO = 30;
/** Dia do mês seguinte até o qual a comissão é paga. */
export const PAGAMENTO_ATE_DIA = 10;
/** Prazo de resposta da equipe ao pedido. */
export const RESPOSTA_DIAS_UTEIS = 2;
/** Aviso prévio para o GiraHub encerrar uma parceria. */
export const AVISO_ENCERRAMENTO_DIAS = 30;

export type TipoParceiro = 'loja' | 'dirigente_medium' | 'criador_conteudo' | 'federacao' | 'outro';

export const TIPOS_PARCEIRO: readonly { value: TipoParceiro; label: string }[] = [
  { value: 'loja', label: 'Loja de artigos religiosos' },
  { value: 'dirigente_medium', label: 'Dirigente ou médium' },
  { value: 'criador_conteudo', label: 'Criador de conteúdo do axé' },
  { value: 'federacao', label: 'Federação ou associação' },
  { value: 'outro', label: 'Outro' },
];

export function tipoParceiroLabel(tipo: string): string {
  return TIPOS_PARCEIRO.find((t) => t.value === tipo)?.label ?? tipo;
}

export const UFS: readonly string[] = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Comissão do parceiro num mês de preço cheio do plano. */
export function comissaoMensal(plan: PlanDef): number {
  return Math.round(plan.price * COMISSAO_PCT) / 100;
}

/** Comissão nos meses em que o terreiro paga com desconto (20% sobre o valor já com desconto). */
export function comissaoMensalComDesconto(plan: PlanDef): number {
  return Math.round(plan.price * (100 - DESCONTO_PCT) * COMISSAO_PCT) / 10000;
}

/** Quanto o parceiro recebe no total por um terreiro que fica os 12 meses no plano. */
export function comissaoTotal(plan: PlanDef): number {
  const comDesconto = Math.min(DESCONTO_MESES, COMISSAO_MESES);
  return Math.round((comissaoMensalComDesconto(plan) * comDesconto + comissaoMensal(plan) * (COMISSAO_MESES - comDesconto)) * 100) / 100;
}

/** Plano usado no exemplo da página: o "mais escolhido" dos cartões (ou o primeiro pago). */
export function planoExemplo(): PlanDef {
  return PAID_PLANS.find((p) => p.popular) ?? PAID_PLANS[0];
}

export const QUEM_PODE = [
  { title: 'Lojas de artigos religiosos', desc: 'Quem atende todos os terreiros da região no balcão.' },
  { title: 'Dirigentes e médiuns', desc: 'Quem conhece outras casas e sabe o trabalho que dá organizar a gira.' },
  { title: 'Criadores de conteúdo do axé', desc: 'Perfis, canais e podcasts que falam com a comunidade.' },
  { title: 'Federações e associações', desc: 'Quem reúne e apoia dezenas de terreiros.' },
];

export const MATERIAL = [
  { title: 'Link e cupom próprios', desc: 'Cada terreiro que assinar com o seu cupom conta para você.' },
  { title: 'Display A4 com QR', desc: 'Para o balcão da loja: o terreiro aponta a câmera e já cai no cadastro.' },
  { title: 'Textos prontos', desc: 'Mensagens para WhatsApp e legendas para Instagram, é só copiar e mandar.' },
];

export const COMO_FUNCIONA = [
  { title: 'Preencha o formulário', desc: 'Conte quem você é e como pretende divulgar. Leva dois minutos.' },
  {
    title: 'A equipe GiraHub responde',
    desc: `Em até ${RESPOSTA_DIAS_UTEIS} dias úteis, pelo WhatsApp ou e-mail, com o seu cupom e o material de divulgação.`,
  },
  { title: 'Indique os terreiros', desc: 'Cada terreiro que assinar um plano pago com o seu cupom conta para você.' },
  { title: 'Receba por PIX', desc: 'Todo mês a comissão cai na sua chave PIX.' },
];

export const REGULAMENTO: readonly { q: string; a: string }[] = [
  {
    q: 'Sobre o que a comissão é calculada?',
    a: `Sobre os pagamentos que o terreiro indicado efetivamente fez ao GiraHub, nos ${COMISSAO_MESES} primeiros meses de plano pago. Estornos e reembolsos são descontados. O período de teste grátis não conta, porque nele o terreiro não paga nada.`,
  },
  {
    q: 'Quando e como eu recebo?',
    a: `Por PIX, até o dia ${PAGAMENTO_ATE_DIA} do mês seguinte, quando a comissão acumulada passa de ${formatBRL(PAGAMENTO_MINIMO)}. Abaixo disso, o valor fica guardado e soma no mês seguinte.`,
  },
  {
    q: 'Posso indicar o meu próprio terreiro?',
    a: 'Não. A casa do próprio parceiro (ou de quem assina por ele) não conta como indicação — o programa é para levar o GiraHub a casas novas.',
  },
  {
    q: 'O que não pode na divulgação?',
    a: 'Mandar spam (mensagem em massa para quem não pediu) e fazer anúncio com a marca GiraHub em buscadores, como o Google. Fora isso, divulgue do seu jeito: no balcão, no grupo, no perfil, na conversa depois da gira.',
  },
  {
    q: 'A parceria pode acabar?',
    a: `Pode, dos dois lados. O GiraHub avisa com ${AVISO_ENCERRAMENTO_DIAS} dias de antecedência, e as comissões que já eram suas são pagas normalmente.`,
  },
  {
    q: 'O desconto do terreiro vale para qualquer plano?',
    a: `Vale para qualquer plano pago: ${DESCONTO_PCT}% nos ${DESCONTO_MESES} primeiros meses, depois do teste grátis normal do GiraHub, usando o cupom do parceiro na assinatura.`,
  },
];
