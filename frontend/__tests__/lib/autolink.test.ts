import { autolink, hrefSeguro } from '@/lib/autolink';

describe('autolink (Avisos, AM-09)', () => {
  it('separa texto e links http(s) e www', () => {
    expect(autolink('Veja https://exemplo.com.br/agenda e www.casa.org hoje')).toEqual([
      { tipo: 'texto', texto: 'Veja ' },
      { tipo: 'link', texto: 'https://exemplo.com.br/agenda', href: 'https://exemplo.com.br/agenda' },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'link', texto: 'www.casa.org', href: 'https://www.casa.org/' },
      { tipo: 'texto', texto: ' hoje' },
    ]);
  });

  it('deixa a pontuação do fim fora do link', () => {
    const p = autolink('Inscrições: https://exemplo.com/form.');
    expect(p[1]).toEqual({ tipo: 'link', texto: 'https://exemplo.com/form', href: 'https://exemplo.com/form' });
    expect(p[2]).toEqual({ tipo: 'texto', texto: '.' });
  });

  it('nunca transforma javascript:, data: ou HTML em link', () => {
    for (const t of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '<a href="javascript:alert(1)">clique</a>',
    ]) {
      expect(autolink(t).every((p) => p.tipo === 'texto')).toBe(true);
    }
    expect(hrefSeguro('javascript:alert(1)')).toBeNull();
    expect(hrefSeguro('https://ok.com')).toBe('https://ok.com/');
  });

  it('texto sem link volta inteiro', () => {
    expect(autolink('Gira às 20h')).toEqual([{ tipo: 'texto', texto: 'Gira às 20h' }]);
    expect(autolink('')).toEqual([]);
  });
});
