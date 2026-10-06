/**
 * Regra de senha do app (= `validate_password_policy` em `backend/src/security/password.py`):
 * mínimo 12 caracteres, maiúscula, minúscula, número e símbolo; máximo 72 bytes (bcrypt).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_RULE_HINT = 'Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo';

export function passwordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[A-Z]/.test(password)) errors.push('uma letra maiúscula');
  if (!/[a-z]/.test(password)) errors.push('uma letra minúscula');
  if (!/\d/.test(password)) errors.push('um número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('um símbolo');
  if (utf8Bytes(password) > 72) errors.push('no máximo 72 caracteres');
  return errors;
}

/** Tamanho em bytes UTF-8 (sem TextEncoder, que o jsdom não tem). */
export function utf8Bytes(s: string): number {
  return encodeURIComponent(s).replace(/%[0-9A-Fa-f]{2}/g, '.').length;
}

export function isPasswordValid(password: string): boolean {
  return passwordErrors(password).length === 0;
}

/** Mensagem para o campo: "" quando válida. */
export function passwordHelp(password: string): string {
  if (!password) return '';
  const errors = passwordErrors(password);
  return errors.length ? `Falta: ${errors.join(', ')}` : '';
}
