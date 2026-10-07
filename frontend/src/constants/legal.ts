/**
 * Dados institucionais dos documentos legais (/termos, /privacidade, /cookies).
 *
 * Razão social, CNPJ e endereço identificam o fornecedor (Decreto 7.962/2013, art. 2º, e CDC):
 * preencha quando o dono definir a pessoa jurídica do GiraHub — enquanto vazios, a frase
 * "Quem somos" sai só com o nome GiraHub. Vigência/versão mudam junto com o texto.
 *
 * As versões de termos/privacidade são gravadas no aceite do cadastro (tabela legal_acceptances)
 * a partir do espelho em backend/src/core/legal_versions.py — suba nos dois (um teste confere).
 */
export const LEGAL_ENTITY = {
  razaoSocial: '',
  cnpj: '',
  endereco: '',
};

export const LEGAL_VERSIONS = {
  termos: { version: '2.0', updatedAt: '7 de outubro de 2026', updatedAtIso: '2026-10-07' },
  privacidade: { version: '2.0', updatedAt: '7 de outubro de 2026', updatedAtIso: '2026-10-07' },
  cookies: { version: '1.0', updatedAt: '7 de outubro de 2026', updatedAtIso: '2026-10-07' },
} as const;

/** "GiraHub" ou "GiraHub, nome comercial de <razão social>, CNPJ …, com sede em …". */
export function identificacaoDoFornecedor(): string {
  const { razaoSocial, cnpj, endereco } = LEGAL_ENTITY;
  if (!razaoSocial) return 'GiraHub';
  return [`GiraHub, nome comercial de ${razaoSocial}`, cnpj && `inscrita no CNPJ sob o nº ${cnpj}`, endereco && `com sede em ${endereco}`]
    .filter(Boolean)
    .join(', ');
}
