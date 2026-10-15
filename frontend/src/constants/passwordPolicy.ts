/**
 * Regra de senha — a mesma do backend (`validate_password_policy` em
 * `backend/src/security/password.py`, com `PASSWORD_*` de `core/config.py`):
 * 12 caracteres, maiúscula, minúscula, número e símbolo.
 *
 * Usada no cadastro, na redefinição, no perfil e no cadastro de usuários, para que a
 * mensagem na tela seja igual à que o servidor devolveria.
 */
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
/** Limite do bcrypt no backend, em bytes UTF-8 (acima disso o servidor recusa — pentest L3). */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MAX_MESSAGE = `Use no máximo ${PASSWORD_MAX_BYTES} caracteres (letras com acento e emojis contam mais).`;

/** Tamanho em bytes UTF-8 (sem TextEncoder, que falta no jsdom dos testes). */
function utf8Bytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export function passwordTooLong(password: string): boolean {
  return utf8Bytes(password) > PASSWORD_MAX_BYTES;
}

// Mesmo conjunto de símbolos aceito pelo backend.
const SYMBOL_RE = /[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|]/;

export interface PasswordRule {
  key: 'length' | 'upper' | 'lower' | 'digit' | 'symbol';
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { key: 'length', label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: 'upper', label: 'Uma letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Uma letra minúscula', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: 'Um número', test: (p) => /\d/.test(p) },
  { key: 'symbol', label: 'Um símbolo (ex.: ! @ # $)', test: (p) => SYMBOL_RE.test(p) },
];

/** Frase única para `helperText` antes de a pessoa digitar. */
export const PASSWORD_RULE_TEXT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, com maiúscula, minúscula, número e símbolo.`;

/** Regras que a senha ainda não cumpre. */
export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.test(password));
}

export function isPasswordValid(password: string): boolean {
  return unmetPasswordRules(password).length === 0 && !passwordTooLong(password);
}

/** Mensagem curta para `error` de campo; `null` quando a senha é válida. */
export function passwordError(password: string): string | null {
  const unmet = unmetPasswordRules(password);
  if (unmet.length === 0) return passwordTooLong(password) ? PASSWORD_MAX_MESSAGE : null;
  if (unmet.length === PASSWORD_RULES.length) return PASSWORD_RULE_TEXT;
  return `Falta: ${unmet.map((r) => r.label.toLowerCase()).join(', ')}.`;
}

/** Schema zod reutilizável (cadastro, usuários, redefinição). */
export const passwordSchema = z
  .string()
  .min(1, 'Informe uma senha.')
  .superRefine((value, ctx) => {
    const message = passwordError(value);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
