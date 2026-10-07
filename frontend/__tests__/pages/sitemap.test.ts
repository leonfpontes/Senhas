/** T-03 — sitemap dinâmico: rotas de marketing + sites publicados, XML válido e escapado. */
import { buildSitemap, fetchPublishedSites, STATIC_ROUTES } from '@/pages/sitemap.xml';

describe('sitemap.xml', () => {
  it('inclui as páginas de marketing e os sites publicados', () => {
    const xml = buildSitemap([{ slug: 'tenda-de-umbanda', updated_at: '2026-10-01T12:00:00Z' }]);
    for (const r of STATIC_ROUTES) expect(xml).toContain(`<loc>https://girahub.com.br${r.path}</loc>`);
    expect(xml).toContain('<loc>https://girahub.com.br/planos</loc>');
    expect(xml).toContain('<loc>https://girahub.com.br/tenda-de-umbanda</loc>');
    expect(xml).toContain('<lastmod>2026-10-01</lastmod>');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('escapa caracteres especiais do slug', () => {
    const xml = buildSitemap([{ slug: 'a&b<c', updated_at: '2026-10-01' }]);
    expect(xml).not.toContain('a&b<c');
  });

  it('API fora do ar → só a parte estática, sem quebrar', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    await expect(fetchPublishedSites('http://x')).resolves.toEqual([]);
    global.fetch = original;
  });
});
