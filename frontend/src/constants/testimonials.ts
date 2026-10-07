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
  cidade: string;
  uf: string;
  texto: string;
  /** Caminho da foto em /public, ou omitido (mostra as iniciais). */
  foto?: string;
  /** @ do Instagram sem a arroba. */
  instagram?: string;
  /** Data da autorização por escrito (AAAA-MM-DD) — guardada fora do repositório. */
  autorizadoEm: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [];

/** Só letras, números, ponto e sublinhado — o resto do @ é descartado. */
export function instagramUrl(handle: string): string {
  const clean = handle.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
  return `https://instagram.com/${clean}`;
}
