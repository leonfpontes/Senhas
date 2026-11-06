/**
 * Cores padrão do site do terreiro (Meu Site) na 3.0.0.
 * Site novo: verde e dourado. Site anterior à 3.0.0: a migração 106 gravou as cores antigas nos campos vazios
 * (Hero índigo e rosa; site sem Hero com `site_brand_color` índigo), e o site continua com a cara de antes.
 */
import { heroBackground, siteBrandColor, type SiteSection } from '@/components/site/lib';

const secao = (section_type: string, config: Record<string, unknown>): SiteSection =>
  ({ id: section_type, section_type, order_index: 0, config } as unknown as SiteSection);

describe('cores do site', () => {
  it('Hero sem cor escolhida usa o verde e o dourado da 3.0.0', () => {
    expect(heroBackground({}).background).toContain('#2E6A4E');
    expect(heroBackground({}).background).toContain('#E9B04A');
    expect(siteBrandColor([secao('HERO', {})])).toBe('#2E6A4E');
  });

  it('Hero com as cores antigas gravadas pela migração fica como era', () => {
    const antigo = { gradient_from: '#6366f1', gradient_to: '#ec4899', bg_color: '#6366f1' };
    expect(heroBackground(antigo).background).toBe('linear-gradient(135deg, #6366f1 0%, #ec4899 100%)');
    expect(siteBrandColor([secao('HERO', antigo)])).toBe('#6366f1');
  });

  it('site sem Hero: a cor gravada em site_brand_color vale; sem ela, o verde', () => {
    expect(siteBrandColor([secao('ABOUT', { site_brand_color: '#4f46e5' }), secao('CONTACT', {})])).toBe('#4f46e5');
    expect(siteBrandColor([secao('ABOUT', {})])).toBe('#2E6A4E');
    expect(siteBrandColor([secao('ABOUT', { site_brand_color: 'não é cor' })])).toBe('#2E6A4E');
  });
});
