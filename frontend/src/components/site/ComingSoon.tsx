/**
 * ComingSoon — "Site em preparação": o que o visitante vê quando o terreiro ainda
 * não publicou o site (ou o slug não existe).
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const STAR_COLORS = ['#f0abfc', '#818cf8', '#facc15'];

export function ComingSoon() {
  return (
    <>
      <Head>
        <title>Site em breve | GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#1e0040_0%,#0d0020_60%,#000010_100%)] px-6 text-center">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute animate-pulse rounded-full"
            style={{
              top: `${(i * 41 + 7) % 90}%`,
              left: `${(i * 67 + 5) % 92}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              background: STAR_COLORS[i % 3],
              animationDuration: `${1.4 + (i % 5) * 0.35}s`,
              animationDelay: `${(i * 0.19).toFixed(1)}s`,
            }}
          />
        ))}

        <span aria-hidden className="relative z-10 animate-bounce text-7xl leading-none [animation-duration:4s]">
          🕯️
        </span>

        <div className="relative z-10">
          <h1 className="mb-3 text-[1.6rem] font-extrabold text-[#c084fc] [text-shadow:0_2px_16px_rgba(192,132,252,0.6)] md:text-[2rem]">
            Site em preparação ✨
          </h1>
          <p className="mx-auto max-w-[420px] text-[0.95rem] leading-relaxed text-[#f0abfc]/70 md:text-[1.05rem]">
            Este terreiro ainda está preparando seu espaço digital. Em breve estará no ar com todas as informações.
          </p>
        </div>

        <Link
          href="/"
          className="relative z-10 mt-1 inline-flex min-h-12 items-center gap-2 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#a855f7] px-6 py-3 text-[0.95rem] font-bold text-white no-underline shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-[#a855f7]/60 focus-visible:outline-none"
        >
          🏠 Conhecer o GiraHub
        </Link>

        <p className="absolute bottom-4 text-[0.72rem] text-white/20">GiraHub © {new Date().getFullYear()}</p>
      </main>
    </>
  );
}

export default ComingSoon;
