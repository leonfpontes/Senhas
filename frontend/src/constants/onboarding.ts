/**
 * Opções das perguntas do cadastro self-service.
 *
 * Espelha `backend/src/core/onboarding.py` — mudou aqui, mude lá. O teste
 * `backend/tests/unit/test_onboarding_signup.py` confere que os valores batem.
 */

export const COMO_CONHECEU_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'outro', label: 'Outro' },
] as const;

export type PrincipalDor = 'senhas' | 'mediuns' | 'financeiro' | 'divulgacao' | 'estoque' | 'outro';

/**
 * "O que você mais precisa resolver?" — define a trilha do tour
 * de boas-vindas no primeiro login (`tours/welcomeTour.tsx`).
 * `phrase` completa a frase "Você contou que quer ...".
 */
export const PRINCIPAL_DOR_OPTIONS: ReadonlyArray<{ value: PrincipalDor; label: string; phrase: string }> = [
  { value: 'senhas', label: 'Organizar as senhas e a fila das giras', phrase: 'organizar as senhas e a fila das giras' },
  { value: 'mediuns', label: 'Organizar os médiuns e a corrente', phrase: 'organizar os médiuns e a corrente' },
  { value: 'financeiro', label: 'Controlar mensalidades e o financeiro', phrase: 'controlar as mensalidades e o financeiro' },
  { value: 'divulgacao', label: 'Divulgar o terreiro (site e cursos)', phrase: 'divulgar o terreiro' },
  { value: 'estoque', label: 'Controlar o estoque de materiais', phrase: 'controlar o estoque de materiais' },
  { value: 'outro', label: 'Ainda estou conhecendo', phrase: 'conhecer a plataforma' },
];

export function isPrincipalDor(value: unknown): value is PrincipalDor {
  return PRINCIPAL_DOR_OPTIONS.some((o) => o.value === value);
}
