/**
 * SiteFooter — rodapé "Powered by GiraHub" do site público do terreiro.
 */
import React from 'react';

const GIRAHUB_URL = 'https://girahub.com.br';

export function SiteFooter({ inert = false }: { inert?: boolean }) {
  const linkProps = {
    target: '_blank',
    rel: 'noopener noreferrer',
    tabIndex: inert ? -1 : undefined,
    onClick: inert ? (e: React.MouseEvent) => e.preventDefault() : undefined,
  };
  return (
    <footer className="flex flex-col items-center gap-3 border-t border-border bg-card px-4 py-8 text-center">
      <a href={GIRAHUB_URL} {...linkProps} className="flex items-center gap-2 no-underline opacity-85 hover:opacity-100">
        {/* Logo estático do produto (SVG em /public) — não passa pelo otimizador. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="bg-gradient-to-br from-[#4f46e5] to-[#818cf8] bg-clip-text text-base leading-none font-bold tracking-tight text-transparent">
          GiraHub
        </span>
      </a>
      <p className="text-xs text-muted-foreground">
        Powered by{' '}
        <a href={GIRAHUB_URL} {...linkProps} className="font-semibold text-primary no-underline hover:underline">
          GiraHub
        </a>{' '}
        — a plataforma digital para centros de umbanda e candomblé
      </p>
      <p className="text-[11px] text-muted-foreground/70">© {new Date().getFullYear()} GiraHub. Todos os direitos reservados.</p>
    </footer>
  );
}

export default SiteFooter;
