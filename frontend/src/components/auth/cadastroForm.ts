/**
 * Regras do formulário de cadastro (/cadastro): schema zod, máscaras e montagem do payload
 * de `POST /api/v1/public/onboarding`. Separado da página para ser testável sem renderizar.
 */
import { z } from 'zod';
import { passwordSchema } from '@/constants/passwordPolicy';
import { isPrincipalDor, type PrincipalDor } from '@/constants/onboarding';

export const unmaskDigits = (value: string): string => value.replace(/\D/g, '');

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00), decidido pela quantidade de dígitos. */
export function maskDocumento(value: string): string {
  const digits = unmaskDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function validarCPF(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const i of [9, 10]) {
    let value = 0;
    for (let num = 0; num < i; num++) value += parseInt(cpf[num], 10) * (i + 1 - num);
    const digit = ((value * 10) % 11) % 10;
    if (digit !== parseInt(cpf[i], 10)) return false;
  }
  return true;
}

export function validarCNPJ(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const [weights, checkIdx] of [[weights1, 12], [weights2, 13]] as [number[], number][]) {
    let value = 0;
    for (let i = 0; i < weights.length; i++) value += parseInt(cnpj[i], 10) * weights[i];
    let digit = 11 - (value % 11);
    if (digit >= 10) digit = 0;
    if (digit !== parseInt(cnpj[checkIdx], 10)) return false;
  }
  return true;
}

export function validarDocumento(value: string): boolean {
  const digits = unmaskDigits(value);
  if (digits.length === 11) return validarCPF(digits);
  if (digits.length === 14) return validarCNPJ(digits);
  return false;
}

export const cadastroSchema = z.object({
  terreiroNome: z.string().trim().min(3, 'O nome do terreiro precisa de pelo menos 3 letras.').max(255, 'Nome muito longo.'),
  nome: z.string().trim().min(2, 'Informe seu nome.').max(255, 'Nome muito longo.'),
  whatsapp: z.string().refine(
    (v) => {
      const d = unmaskDigits(v);
      return d.length >= 10 && d.length <= 13;
    },
    { message: 'Informe o DDD e o número.' },
  ),
  password: passwordSchema,
  comoConheceu: z.string().optional(),
  principalDor: z.string().optional(),
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('E-mail inválido.'),
  documento: z.string().refine(validarDocumento, { message: 'CPF ou CNPJ inválido.' }),
  aceiteTermos: z.boolean().refine((v) => v === true, { message: 'Precisamos do seu aceite para criar a conta.' }),
});

export type CadastroFormValues = z.infer<typeof cadastroSchema>;

export const CADASTRO_DEFAULTS: CadastroFormValues = {
  terreiroNome: '',
  nome: '',
  whatsapp: '',
  password: '',
  comoConheceu: '',
  principalDor: '',
  email: '',
  documento: '',
  aceiteTermos: false,
};

export interface OnboardingPayload {
  terreiro_nome: string;
  responsavel_nome: string;
  email: string;
  whatsapp: string;
  documento: string;
  password: string;
  como_conheceu?: string;
  principal_dor?: PrincipalDor;
  aceite_termos: true;
}

export function buildOnboardingPayload(values: CadastroFormValues): OnboardingPayload {
  return {
    terreiro_nome: values.terreiroNome.trim(),
    responsavel_nome: values.nome.trim(),
    email: values.email.trim(),
    whatsapp: unmaskDigits(values.whatsapp),
    documento: unmaskDigits(values.documento),
    password: values.password,
    como_conheceu: values.comoConheceu || undefined,
    principal_dor: isPrincipalDor(values.principalDor) ? values.principalDor : undefined,
    aceite_termos: true,
  };
}

/** Destino depois de criar a conta: a primeira gira, com o formulário já aberto. */
export const AFTER_SIGNUP_PATH = '/admin/giras?nova=1';
