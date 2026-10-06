/**
 * Site público do terreiro — /[tenantSlug]
 *
 * SSR com `getServerSideProps` e INTERNAL_API_URL (não NEXT_PUBLIC_), para o fetch
 * funcionar dentro da rede Docker (Gap #22). Todas as seções, inclusive as próximas
 * giras, vêm no HTML para SEO (Gap #19).
 *
 * As seções são as mesmas da prévia do editor (`@/components/site/sections`).
 */
import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { ComingSoon } from '@/components/site/ComingSoon';
import { PublicSite } from '@/components/site/PublicSite';
import { fontImportUrl, siteBrandColor } from '@/components/site/lib';
import type { PublicSiteData } from '@/components/site/types';

interface Props {
  site: PublicSiteData | null;
}

export default function TenantPublicSitePage({ site }: Props) {
  // Site não publicado ou slug inexistente — "em breve" em vez do 404 padrão.
  if (site === null) return <ComingSoon />;

  const title = site.meta_title || 'Terreiro — GiraHub';
  const hero = site.sections.find((s) => s.section_type === 'HERO');
  const heroFontUrl = fontImportUrl(hero ? String(hero.config.font_family || '') : '');
  const themeColor = siteBrandColor(site.sections);

  return (
    <>
      <Head>
        <title>{title}</title>
        {site.meta_description && <meta name="description" content={site.meta_description} />}
        <meta property="og:title" content={title} />
        {site.meta_description && <meta property="og:description" content={site.meta_description} />}
        <meta property="og:type" content="website" />
        <meta name="theme-color" content={themeColor} />
        {heroFontUrl && <link rel="stylesheet" href={heroFontUrl} />}
      </Head>
      <PublicSite site={site} mode="public" />
    </>
  );
}

// ── SSR ───────────────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const slug = params?.tenantSlug as string;

  // 'backend' é o nome do serviço no Docker; fora dele, cai no localhost:8000.
  const base = process.env.INTERNAL_API_URL || 'http://backend:8000';

  try {
    const res = await fetch(`${base}/api/v1/public/sites/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      return { props: { site: null } };
    }
    const site: PublicSiteData = await res.json();
    return { props: { site } };
  } catch {
    return { props: { site: null } };
  }
};
