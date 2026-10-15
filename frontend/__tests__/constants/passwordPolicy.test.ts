/** Pentest L3: a regra de senha da tela respeita o limite de 72 bytes do bcrypt, como o backend. */
import { isPasswordValid, passwordError, PASSWORD_MAX_MESSAGE, passwordTooLong } from '@/constants/passwordPolicy';

const BASE = 'Senha-Forte-1';

describe('passwordPolicy — limite de 72 bytes', () => {
  it('72 bytes passa; 73 não', () => {
    const ok = BASE + 'a'.repeat(72 - BASE.length);
    expect(passwordTooLong(ok)).toBe(false);
    expect(isPasswordValid(ok)).toBe(true);
    expect(passwordError(ok + 'a')).toBe(PASSWORD_MAX_MESSAGE);
    expect(isPasswordValid(ok + 'a')).toBe(false);
  });

  it('conta bytes, não caracteres (acento ocupa 2)', () => {
    const acentos = BASE + 'é'.repeat(30); // 13 + 60 = 73 bytes, 43 caracteres
    expect(acentos.length).toBeLessThan(72);
    expect(passwordTooLong(acentos)).toBe(true);
  });
});
