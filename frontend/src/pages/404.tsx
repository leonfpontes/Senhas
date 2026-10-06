/**
 * Página 404 — rotas sem correspondência e `notFound: true`.
 *
 * Se a URL parece ser de um terreiro (`/public/{slug}/…` ou `/{slug}/…`), oferece
 * "Ir para o terreiro" (site público em `/{slug}`). Animações só com
 * `prefers-reduced-motion: no-preference` (variante `motion-safe:`), contraste de
 * texto legível e sem piadas com entidades religiosas.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Home, Moon, Sparkles, Star } from 'lucide-react';
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

const MESSAGES = [
  'Essa página não está aqui.',
  'O link pode ter mudado ou expirado.',
  'Confira o endereço ou volte para o início.',
];

const FLOATING: { Icon: typeof Star; className: string; delay: string }[] = [
  { Icon: Sparkles, className: 'top-[10%] left-[8%] size-8', delay: '0s' },
  { Icon: Star, className: 'top-[18%] right-[12%] size-6', delay: '0.6s' },
  { Icon: Moon, className: 'bottom-[18%] left-[6%] size-10', delay: '1.1s' },
  { Icon: Star, className: 'top-[40%] left-[3%] size-5', delay: '0.3s' },
  { Icon: Sparkles, className: 'bottom-[22%] right-[8%] size-7', delay: '1.6s' },
  { Icon: Star, className: 'bottom-[10%] right-[28%] size-5', delay: '0.9s' },
];

export default function Custom404() {
  const router = useRouter();
  const slug = tenantSlugFromPath(router?.asPath);

  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) return undefined; // sem troca animada de mensagem
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Head>
        <title>Página não encontrada — GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center text-base text-foreground">
        {/* Fundo suave com a cor da marca */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,var(--color-primary)_0%,transparent_60%)] opacity-10"
        />

        {/* Ícones flutuantes — só animam sem prefers-reduced-motion */}
        {FLOATING.map(({ Icon, className, delay }, i) => (
          <Icon
            key={i}
            aria-hidden
            className={`absolute text-primary/40 motion-safe:animate-bounce ${className}`}
            style={{ animationDelay: delay, animationDuration: '3.5s' }}
          />
        ))}

        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4">
          <p
            aria-hidden
            className="text-[7rem] leading-none font-black tracking-tighter text-primary motion-safe:animate-pulse sm:text-[10rem]"
            style={{ animationDuration: '3s' }}
          >
            404
          </p>
          <h1 className="text-2xl font-bold">Página não encontrada</h1>
          <p
            aria-live="polite"
            className="min-h-6 text-base text-muted-foreground motion-safe:transition-opacity motion-safe:duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {MESSAGES[msgIndex]}
          </p>

          <div className="mt-2 flex w-full flex-col gap-2">
            {slug && (
              <Button asChild size="touch" className="w-full">
                <Link href={`/${encodeURIComponent(slug)}`}>
                  <Home /> Ir para o terreiro
                </Link>
              </Button>
            )}
            <Button asChild variant={slug ? 'outline' : 'default'} size="touch" className="w-full">
              <Link href="/">{!slug && <Home />} Voltar ao início</Link>
            </Button>
            <Button type="button" variant="ghost" size="touch" className="w-full text-muted-foreground" onClick={() => window.history.back()}>
              <ArrowLeft /> Voltar
            </Button>
          </div>
        </div>

        <p className="absolute bottom-5 text-sm text-muted-foreground">
          GiraHub © {new Date().getFullYear()} — a plataforma dos terreiros
        </p>
      </main>
    </>
  );
}
