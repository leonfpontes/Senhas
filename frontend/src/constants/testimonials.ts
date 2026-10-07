/**
 * Depoimentos da landing (V-03). SÓ depoimentos reais, com autorização por escrito do dirigente
 * (LGPD art. 11 — nome de santo e foto revelam religião). Processo e termo em
 * docs/marketing/kit-depoimentos.md. Nunca inventar: com a lista vazia a seção não aparece.
 *
 * Foto: /public/landing/depoimentos/<arquivo>.webp, quadrada, até 400 px.
 */
export interface Testimonial {
  /** Como a pessoa pediu para ser chamada (ex.: "Mãe Maria de Oxum"). */
  nome: string;
  casa: string;
  cidade?: string;
  uf?: string;
  texto: string;
  /** Caminho da foto em /public, ou omitido (mostra as iniciais). */
  foto?: string;
  /** @ do Instagram sem a arroba. */
  instagram?: string;
  /** Data da autorização por escrito (AAAA-MM-DD) — guardada fora do repositório. */
  autorizadoEm: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    nome: 'Sacerdote Marcelo',
    casa: 'Tuccco — Tenda de Umbanda Caboclo Cobra Coral',
    texto:
      'Desde que começamos a usar o site GiraHub, a organização do terreiro deu um salto de qualidade. A liberação das senhas ficou muito mais eficiente, evitando filas e agendamentos confusos. Além disso, a organização do terreiro, em relação à mensalidade, contas a pagar e a receber, e ao controle de estoque, ficou muito mais eficaz. A comunicação com os frequentadores também se tornou mais clara, trazendo mais tranquilidade e segurança para todos. Recomendo fortemente!',
    foto: '/landing/depoimentos/sacerdote-marcelo-tuccco.webp',
    // Depoimento e foto enviados pelo dono do GiraHub em 2026-10-07 (autorização do dirigente
    // guardada fora do repositório — docs/marketing/kit-depoimentos.md).
    autorizadoEm: '2026-10-07',
  },
  {
    nome: 'Natália',
    casa: 'TUFF — Terreiro de Umbanda Filhos de Fé',
    texto:
      'O GiraHub foi um divisor de águas na organização das minhas giras. Um sistema completo pra um terreiro: desde liberação de senhas, controle de estoque, organização de mensalidades dos médiuns e muito mais. Hoje tenho zero preocupações com a retirada de senhas e minha comunidade se adaptou muito rápido à mudança. O sistema é bem fácil de entender. Sempre que posso indico a plataforma para todos os irmãos de fé, porque o que é bom precisamos repassar para frente. Axé!',
    foto: '/landing/depoimentos/natalia-tuff.webp',
    // Depoimento e foto enviados pelo dono do GiraHub em 2026-10-07 (a apresentação "Me chamo
    // Natália, sou dirigente do TUFF" virou a linha de autoria; autorização fora do repositório).
    autorizadoEm: '2026-10-07',
  },
];

/** "Casa · Cidade/UF", omitindo o que não foi informado. */
export function testimonialPlace(t: Testimonial): string {
  const local = t.cidade ? `${t.cidade}${t.uf ? `/${t.uf}` : ''}` : '';
  return [t.casa, local].filter(Boolean).join(' · ');
}

/** Só letras, números, ponto e sublinhado — o resto do @ é descartado. */
export function instagramUrl(handle: string): string {
  const clean = handle.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
  return `https://instagram.com/${clean}`;
}
