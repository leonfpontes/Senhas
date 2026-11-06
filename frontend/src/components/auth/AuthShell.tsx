/**
 * AuthShell — moldura das telas de conta (login, cadastro, esqueci/redefinir senha, reativar
 * conta) com a identidade da landing: cabeçalho escuro com a marca do GiraHub (volta para `/`),
 * fundo areia, títulos em Fraunces (`font-display`) e cartão branco arredondado. No desktop (md+)
 * a tela se divide: painel da marca à esquerda (foto real de gira com véu café, promessa e provas)
 * e o formulário à direita. No celular, uma coluna só, sem foto.
 *
 * A classe `auth-terra` (globals.css) faz o kit — Button, Checkbox, foco, `text-brand` — usar a
 * paleta terra, independentemente da cor do último terreiro aplicada no :root. Sempre claro.
 * Cada tela só entrega o formulário e, se quiser, um rodapé.
 */
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ultimaPassagem } from '@/lib/passagem';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';
import { Photo } from '@/components/landing/Photo';
import { fraunces, MARKETING_RESET } from '@/components/landing/fonts';
import { AUTH_PANEL } from '@/constants/landingCopy';
import type { PhotoKey } from '@/constants/landingPhotos';

export interface AuthShellProps {
  /** `<title>` da aba. Omita quando a tela monta o próprio `<Head>` (ex.: cadastro, com SEO). */
  headTitle?: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Linha curta acima do título, em barro ("Convite da casa", "Passo 2 de 2" — J11 v2). */
  eyebrow?: React.ReactNode;
  /** Largura da coluna do formulário: `xs` (448px) para login e afins, `sm` (576px) para o cadastro. */
  size?: 'xs' | 'sm';
  /** Bloco abaixo do formulário, dentro do cartão, separado por uma linha. */
  footer?: React.ReactNode;
  /** Atalho no canto do cabeçalho (ex.: "Entrar" no cadastro, "Criar conta grátis" no login). */
  headerAction?: { label: string; href: string };
  /** Foto do painel da marca (desktop). Decorativa: a promessa ao lado é o conteúdo. */
  photo?: PhotoKey;
  children: React.ReactNode;
  className?: string;
}

function BrandPanel({ photo }: { photo: PhotoKey }) {
  return (
    <aside aria-label="Sobre o GiraHub" className="relative z-20 hidden overflow-clip bg-cafe-950 text-white md:block">
      {/* Caixa da altura da tela que acompanha a rolagem (cadastro longo): foto, véu e texto
          andam juntos, então o contraste calculado abaixo vale em qualquer posição. Com a página
          no topo, os 4rem de baixo ficam sob a dobra (o cabeçalho ocupa o começo) — daí o
          respiro maior embaixo; o `overflow-clip` do aside impede que isso alongue a página. */}
      <div className="sticky top-0 isolate flex h-dvh flex-col justify-between gap-10 overflow-hidden p-10 pb-[6.5rem] lg:p-14 lg:pb-[7.5rem]">
        <Photo
          name={photo}
          decorative
          // Sem `priority`: o painel some no celular (display:none) e a imagem preguiçosa nem baixa lá.
          sizes="(min-width: 900px) 42vw, 1px"
          className="absolute inset-0 -z-20 h-full w-full object-center"
        />
        {/* Véu café em duas camadas: a foto aparece no meio do painel; atrás da promessa e das
            provas (metade de cima) o véu passa de 75%, o que mantém o texto acima de 4,5:1 mesmo
            sobre o ponto mais claro da foto. O depoimento embaixo tem fundo próprio. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-cafe-950/45" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-cafe-950/80 via-cafe-950/60 via-50% to-transparent to-75%"
        />
        <div className="passagem-surge">
          <p className="text-xs font-bold text-ouro-300">{AUTH_PANEL.eyebrow}</p>
          <p className="mt-4 font-display text-4xl leading-[1.1] font-bold tracking-tight lg:text-5xl">
            {AUTH_PANEL.promise}
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-base text-areia-100">
            {AUTH_PANEL.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-folha-600">
                  <Check className="size-3.5 text-white" aria-hidden />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

export function AuthShell({
  headTitle,
  title,
  subtitle,
  eyebrow,
  size = 'xs',
  footer,
  headerAction,
  photo = 'giraVelas',
  children,
  className,
}: AuthShellProps) {
  // Vindo de outra tela de conta (login ⇄ cadastro) o escuro já está no lugar: sem recuo.
  // Lido uma vez, ao montar (no servidor e na hidratação é sempre a chegada inicial).
  const [semRecuo] = useState(() => typeof window !== 'undefined' && ultimaPassagem() === 'lado');
  return (
    <>
      {headTitle && (
        <Head>
          <title>{headTitle}</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      <div
        data-passagem-moldura=""
        className={cn(
          fraunces.variable,
          'auth-terra passagem relative flex min-h-dvh flex-col bg-areia-50 text-tinta',
          semRecuo && 'passagem-sem-recuo',
          MARKETING_RESET,
        )}
      >
        {/* Passagem (globals.css): o escuro da landing que recua até o painel, e o fio na borda. */}
        <div className="passagem-fundo" aria-hidden />
        <div className="passagem-costura" aria-hidden />

        <a
          href="#conteudo-conta"
          className="sr-only z-50 rounded-md bg-ouro-300 px-3 py-2 font-bold text-cafe-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Pular para o formulário
        </a>

        <header className="relative z-50 border-b border-white/10 bg-cafe-950 text-white">
          <div className="mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href="/"
              aria-label="GiraHub — página inicial"
              className="marca-girahub rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300/60"
            >
              <GiraHubLogo className="text-white" />
            </Link>
            {headerAction && (
              <Link
                href={headerAction.href}
                className="inline-flex min-h-12 items-center rounded-md px-3 text-sm font-semibold text-areia-200 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-ouro-300/60"
              >
                {headerAction.label}
              </Link>
            )}
          </div>
        </header>

        <div className="flex flex-1 flex-col md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <BrandPanel photo={photo} />

          <main
            id="conteudo-conta"
            className="flex flex-1 flex-col items-center px-4 pt-8 pb-10 sm:px-6 sm:pt-12 md:justify-center md:py-14"
          >
            <div className={cn('passagem-porta w-full', size === 'xs' ? 'max-w-md' : 'max-w-xl', className)}>
              {/* J11 v2: o título mora dentro do cartão, em Fraunces regular. */}
              <div className="rounded-3xl border border-areia-200 bg-white p-5 shadow-xl shadow-cafe-900/5 sm:p-8">
                <div className="mb-6">
                  {eyebrow && <p className="mb-2 text-xs font-bold text-barro-700">{eyebrow}</p>}
                  <h1 className="font-display text-3xl leading-tight font-normal tracking-tight text-tinta sm:text-[2rem]">
                    {title}
                  </h1>
                  {subtitle && <p className="mt-2 text-sm text-tinta-suave">{subtitle}</p>}
                </div>
                {children}

                {footer && (
                  <>
                    <div className="my-7 h-px bg-areia-200" role="separator" />
                    {footer}
                  </>
                )}
              </div>

              <nav aria-label="Links legais" className="mt-8 text-center text-xs text-tinta-suave">
                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                  <li>
                    <Link href="/" className="underline-offset-4 hover:text-tinta hover:underline">
                      Voltar ao site
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacidade" className="underline-offset-4 hover:text-tinta hover:underline">
                      Privacidade
                    </Link>
                  </li>
                  <li>
                    <Link href="/termos" className="underline-offset-4 hover:text-tinta hover:underline">
                      Termos de uso
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default AuthShell;

/** Campos das telas de conta: 48px de altura, fundo branco, texto 16px (sem zoom no iOS). */
export const AUTH_INPUT = 'h-12 bg-white text-base md:text-base';

/** Link de texto na paleta terra (barro-700 passa de 4,5:1 no branco e no areia). */
export const AUTH_LINK = 'font-semibold text-barro-700 underline-offset-4 hover:underline';
