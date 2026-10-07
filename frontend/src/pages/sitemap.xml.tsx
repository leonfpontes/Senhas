/**
 * /sitemap.xml gerado no servidor (T-03): páginas de marketing + sites publicados dos terreiros
 * (GET /api/v1/public/sitemap/sites via INTERNAL_API_URL, como o SSR de [tenantSlug]).
 * Se a API falhar, sai só a parte estática — o sitemap nunca quebra. Substitui o antigo
 * public/sitemap.xml estático (que só tinha 3 URLs).
 */
import type { GetServerSideProps } from 'next';

export const SITE_URL = 'https://girahub.com.br';

/** Páginas públicas de marketing. Página nova de marketing → acrescente aqui. */
export const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/planos', changefreq: 'weekly', priority: '0.9' },
  { path: '/cadastro', changefreq: 'monthly', priority: '0.8' },
  { path: '/login', changefreq: 'monthly', priority: '0.3' },
  { path: '/privacidade', changefreq: 'yearly', priority: '0.2' },
  { path: '/termos', changefreq: 'yearly', priority: '0.2' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.2' },
];

export interface SitemapSite {
  slug: string;
  updated_at: string;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function buildSitemap(sites: readonly SitemapSite[]): string {
  const urls = [
    ...STATIC_ROUTES.map(
      (r) =>
        `  <url>\n    <loc>${SITE_URL}${r.path}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
    ),
    ...sites.map(
      (s) =>
        `  <url>\n    <loc>${SITE_URL}/${escapeXml(encodeURIComponent(s.slug))}</loc>\n    <lastmod>${escapeXml(
          s.updated_at.slice(0, 10),
        )}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export async function fetchPublishedSites(base: string): Promise<SitemapSite[]> {
  try {
    const res = await fetch(`${base}/api/v1/public/sitemap/sites`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as SitemapSite[]).filter((s) => typeof s?.slug === 'string') : [];
  } catch {
    return [];
  }
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // 'backend' é o nome do serviço no Docker; fora dele, defina INTERNAL_API_URL.
  const base = process.env.INTERNAL_API_URL || 'http://backend:8000';
  const sites = await fetchPublishedSites(base);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
  res.write(buildSitemap(sites));
  res.end();
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
