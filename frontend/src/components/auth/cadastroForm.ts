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

// ─── Passos ─────────────────────────────────────────────────────────────────

export type CadastroField = keyof CadastroFormValues;

export interface CadastroStep {
  /** Nome estável (analytics `signup_step_completed`). */
  key: 'terreiro' | 'voce' | 'acesso' | 'comeco';
  /** Rótulo curto do indicador de progresso. */
  label: string;
  /** Pergunta do passo (título da seção). */
  title: string;
  hint: string;
  /** Campos validados ao tentar avançar — só os deste passo. */
  fields: readonly CadastroField[];
}

/**
 * Do mais leve ao mais pesado: o nome da casa primeiro (vitória rápida), contato, senha e
 * documento (que só servem para entrar e liberar o mês grátis) e, por fim, as perguntas
 * opcionais e o aceite. Mudou a ordem? Ajuste `__tests__/pages/cadastro.test.tsx`.
 */
export const CADASTRO_STEPS: readonly CadastroStep[] = [
  {
    key: 'terreiro',
    label: 'Seu terreiro',
    title: 'Como se chama a sua casa?',
    hint: 'É o nome que aparece para quem pega a senha da gira.',
    fields: ['terreiroNome'],
  },
  {
    key: 'voce',
    label: 'Você',
    title: 'Quem vai cuidar da conta?',
    hint: 'Usamos para falar com você e para recuperar o acesso. Não aparece para ninguém.',
    fields: ['nome', 'whatsapp', 'email'],
  },
  {
    key: 'acesso',
    label: 'Acesso',
    title: 'Crie sua senha',
    hint: 'Você vai entrar com o seu e-mail e esta senha.',
    fields: ['password', 'documento'],
  },
  {
    key: 'comeco',
    label: 'Para começar',
    title: 'Para começar do jeito certo',
    hint: 'As duas perguntas são opcionais — com elas montamos o seu guia inicial.',
    fields: ['comoConheceu', 'principalDor', 'aceiteTermos'],
  },
];

/** Índice do passo que contém o campo (0 se desconhecido). */
export function stepOfField(field: CadastroField): number {
  const i = CADASTRO_STEPS.findIndex((s) => s.fields.includes(field));
  return i < 0 ? 0 : i;
}

// ─── Erros do backend ───────────────────────────────────────────────────────

const API_FIELD: Record<string, CadastroField> = {
  terreiro_nome: 'terreiroNome',
  responsavel_nome: 'nome',
  email: 'email',
  whatsapp: 'whatsapp',
  documento: 'documento',
  password: 'password',
  como_conheceu: 'comoConheceu',
  principal_dor: 'principalDor',
  aceite_termos: 'aceiteTermos',
};

export interface OnboardingErrorTarget {
  /** Campo onde a mensagem aparece (o formulário volta para o passo dele); sem campo → aviso geral. */
  field?: CadastroField;
  message: string;
}

const GENERIC_ERROR = 'Não foi possível criar a conta. Tente novamente.';

/**
 * Traduz a recusa do `POST /public/onboarding` para "qual campo, qual mensagem":
 * 409 `detail` (e-mail já cadastrado → e-mail; nome de terreiro repetido → nome do terreiro),
 * 422 `{error_code: VALIDATION_ERROR, details: [{loc: ['body', campo], msg}]}` → o campo apontado,
 * o resto (429, 500, rede) → aviso geral no passo atual.
 */
export function parseOnboardingError(err: unknown): OnboardingErrorTarget {
  const data = (err as { response?: { data?: Record<string, unknown> } } | undefined)?.response?.data;
  if (!data) return { message: GENERIC_ERROR };

  const detail = data.detail;
  if (typeof detail === 'string' && detail) {
    if (/e-?mail/i.test(detail)) return { field: 'email', message: detail };
    if (/nome de terreiro/i.test(detail)) return { field: 'terreiroNome', message: detail };
    return { message: detail };
  }

  const details = Array.isArray(data.details) ? data.details : Array.isArray(detail) ? detail : null;
  if (details) {
    for (const item of details as Array<{ loc?: unknown[]; msg?: unknown }>) {
      const apiField = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : undefined;
      const field = typeof apiField === 'string' ? API_FIELD[apiField] : undefined;
      if (field) {
        const msg = typeof item.msg === 'string' ? item.msg.replace(/^Value error,\s*/i, '') : '';
        return { field, message: msg || 'Confira este campo.' };
      }
    }
  }

  const message = typeof data.message === 'string' && data.message ? data.message : typeof data.error === 'string' ? data.error : '';
  return { message: message || GENERIC_ERROR };
}

// ─── Rascunho (sessionStorage) ──────────────────────────────────────────────

export const CADASTRO_DRAFT_KEY = 'girahub:cadastro:rascunho';

/**
 * Campos guardados no rascunho da aba (sessionStorage) para quem sai e volta: nunca a senha,
 * nem o CPF/CNPJ (minimização — LGPD), nem o aceite dos termos (precisa ser dado na hora).
 */
export const DRAFT_FIELDS = ['terreiroNome', 'nome', 'whatsapp', 'email', 'comoConheceu', 'principalDor'] as const;

export type CadastroDraft = Partial<Pick<CadastroFormValues, (typeof DRAFT_FIELDS)[number]>>;

export function pickDraft(values: Partial<CadastroFormValues>): CadastroDraft {
  const draft: CadastroDraft = {};
  for (const k of DRAFT_FIELDS) {
    const v = values[k];
    if (typeof v === 'string' && v) draft[k] = v;
  }
  return draft;
}

export function readDraft(storage: Pick<Storage, 'getItem'> | undefined): CadastroDraft {
  try {
    const raw = storage?.getItem(CADASTRO_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? pickDraft(parsed as Partial<CadastroFormValues>) : {};
  } catch {
    return {};
  }
}

// ─── Prévia do link ─────────────────────────────────────────────────────────

/** Mesma regra do `_slugify` do backend (onboarding.py) — só para a prévia "parecido com". */
export function previewSlug(nome: string): string {
  return nome
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
