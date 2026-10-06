/**
 * Cores do terreiro → tokens CSS, com contraste WCAG.
 */
import { applyBrand, contrastRatio, parseColor, pickForeground, relativeLuminance } from '@/lib/brand';

describe('parseColor', () => {
  it('aceita #rgb, #rrggbb, #rrggbbaa e rgb()', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#4f46e5')).toEqual([79, 70, 229]);
    expect(parseColor('#4f46e580')).toEqual([79, 70, 229]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
  });

  it('devolve null para o que não reconhece', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('indigo')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('preto 0, branco 1, contraste 21 entre eles', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('é simétrico e vale 1 para a mesma cor', () => {
    expect(contrastRatio('#4f46e5', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#4f46e5'), 10);
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBe(1);
  });

  it('cor inválida conta como contraste zero', () => {
    expect(contrastRatio('indigo', '#ffffff')).toBe(0);
  });
});

describe('pickForeground', () => {
  it('#4f46e5 + #ffffff passa (≥ 4,5) e mantém o branco', () => {
    expect(contrastRatio('#4f46e5', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(pickForeground('#4f46e5', '#ffffff')).toBe('#ffffff');
  });

  it('#ffff00 + #ffffff reprova e cai para #000', () => {
    expect(pickForeground('#ffff00', '#ffffff')).toBe('#000000');
  });

  it('sem preferência, escolhe preto ou branco pelo maior contraste', () => {
    expect(pickForeground('#ec4899')).toBe('#000000'); // rosa: preto contrasta mais (≈ 6,0 vs 3,5)
    expect(pickForeground('#1e293b')).toBe('#ffffff');
    expect(pickForeground('#ffffff')).toBe('#000000');
  });

  it('cor de fundo inválida cai para branco', () => {
    expect(pickForeground('indigo', '#ffffff')).toBe('#ffffff');
  });
});

describe('applyBrand', () => {
  it('escreve os tokens de marca como variáveis CSS no elemento', () => {
    const root = document.createElement('div');
    applyBrand(root, { primary: '#4f46e5', secondary: '#ec4899', font: '#ffffff' });

    expect(root.style.getPropertyValue('--primary')).toBe('#4f46e5');
    expect(root.style.getPropertyValue('--primary-foreground')).toBe('#ffffff');
    expect(root.style.getPropertyValue('--secondary')).toBe('#ec4899');
    expect(root.style.getPropertyValue('--secondary-foreground')).toBe('#000000');
    expect(root.style.getPropertyValue('--ring')).toBe('#4f46e5');
    expect(root.style.getPropertyValue('--sidebar-primary')).toBe('#4f46e5');
    expect(root.style.getPropertyValue('--sidebar-primary-foreground')).toBe('#ffffff');
  });

  it('ignora a cor de fonte configurada quando ela não contrasta com a primária', () => {
    const root = document.createElement('div');
    applyBrand(root, { primary: '#ffff00', secondary: '#000000', font: '#ffffff' });
    expect(root.style.getPropertyValue('--primary-foreground')).toBe('#000000');
    expect(root.style.getPropertyValue('--secondary-foreground')).toBe('#ffffff');
  });

  it('não toca nos tokens estruturais', () => {
    const root = document.createElement('div');
    root.style.setProperty('--background', '#123456');
    applyBrand(root, { primary: '#4f46e5', secondary: '#ec4899', font: '#ffffff' });
    expect(root.style.getPropertyValue('--background')).toBe('#123456');
  });
});
