/**
 * Página 404 — rotas sem correspondência e `notFound: true`.
 *
 * Se a URL parece ser de um terreiro (`/public/{slug}/…` ou `/{slug}/…`), oferece
 * "Ir para o terreiro" (site público em `/{slug}`). Animações só com
 * `prefers-reduced-motion: no-preference` (variante `motion-safe:`), contraste de
 * texto legível e sem piadas com entidades religiosas.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Home, MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fraunces } from '@/components/landing/fonts';
import { Button } from '@/components/ui/button';

/** Primeiro segmento de rotas da plataforma — nunca é slug de terreiro. */
const RESERVED_SEGMENTS = new Set([
  '',
  'admin',
  'platform',
  'api',
  'login',
  'cadastro',
  'forgot-password',
  'reset-password',
  'reactivate-account',
  'status',
  'termos',
  'privacidade',
  '_next',
  'favicon.ico',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'planos',
  'sounds',
]);

/** Sub-rotas de /public que não são slug de terreiro. */
const PUBLIC_NON_SLUG = new Set(['gira', 'ticket', 'waitlist', 'cursos']);

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{1,63}$/i;

/** Extrai o slug do terreiro de um caminho como `/public/tenda-x/senha` ou `/tenda-x/qualquer`. */
export function tenantSlugFromPath(path: string | undefined): string | null {
  if (!path) return null;
  const segments = path.split(/[?#]/)[0].split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments.length === 0) return null;
  let candidate: string | undefined;
  if (segments[0] === 'public') {
    if (segments.length < 2 || PUBLIC_NON_SLUG.has(segments[1])) return null;
    candidate = segments[1];
  } else {
    if (RESERVED_SEGMENTS.has(segments[0])) return null;
    candidate = segments[0];
  }
  return candidate && SLUG_RE.test(candidate) ? candidate.toLowerCase() : null;
}

/** Jornada 11 v2 · 13: recado claro e o caminho de volta, sobre o areia; sem ícones decorativos. */
export default function Custom404() {
  const router = useRouter();
  // A 404 é estática: no servidor o caminho é "/404". O slug só se lê no navegador, depois da
  // hidratação (antes, o texto do servidor e o do cliente divergiam).
  const [slug, setSlug] = React.useState<string | null>(null);
  React.useEffect(() => {
    setSlug(tenantSlugFromPath(router?.asPath));
  }, [router?.asPath]);

  return (
    <>
      <Head>
        <title>Página não encontrada — GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main
        data-slot="not-found-page"
        className={cn(
          fraunces.variable,
          'flex min-h-screen flex-col items-center justify-center gap-4 bg-areia-50 px-4 text-center text-base text-tinta',
        )}
      >
        <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-areia-100">
          <MapPinOff className="size-8 text-barro-700" />
        </span>
        <h1 className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-[2.75rem]">Página não encontrada</h1>
        <p className="max-w-lg text-tinta-suave">
          O endereço pode ter mudado ou a gira já passou.{slug ? ' Volte para o terreiro e procure por lá.' : ' Volte para o início e procure por lá.'}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2.5">
          {slug ? (
            <Button asChild size="touch" className="rounded-[10px] bg-folha-600 text-white hover:bg-folha-700">
              <Link href={`/${encodeURIComponent(slug)}`}>
                <Home aria-hidden /> Ir para o terreiro
              </Link>
            </Button>
          ) : (
            <Button asChild size="touch" className="rounded-[10px] bg-folha-600 text-white hover:bg-folha-700">
              <Link href="/">
                <Home aria-hidden /> Voltar ao início
              </Link>
            </Button>
          )}
          {slug && (
            <Button asChild variant="outline" size="touch" className="rounded-[10px] border-areia-300 bg-white text-tinta hover:bg-areia-100">
              <Link href="/">Voltar ao início</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="rounded-[10px] border-areia-300 bg-white text-tinta hover:bg-areia-100"
            onClick={() => window.history.back()}
          >
            <ArrowLeft aria-hidden /> Voltar
          </Button>
        </div>
      </main>
    </>
  );
}
