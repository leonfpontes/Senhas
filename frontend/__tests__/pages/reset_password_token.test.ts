/** Pentest M5: o token da redefinição vem do fragmento (`#token=`), com `?token=` para links antigos. */
import { lerTokenDoLink } from '@/pages/reset-password';

describe('lerTokenDoLink', () => {
  it('prefere o fragmento', () => {
    expect(lerTokenDoLink('#token=abc', 'velho')).toBe('abc');
  });
  it('aceita a query de links já enviados', () => {
    expect(lerTokenDoLink('', 'velho')).toBe('velho');
    expect(lerTokenDoLink('', ['a', 'b'])).toBe('a');
  });
  it('sem token devolve null', () => {
    expect(lerTokenDoLink('', undefined)).toBeNull();
    expect(lerTokenDoLink('#outra=1', '')).toBeNull();
  });
});
