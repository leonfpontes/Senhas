/**
 * LegalPageLayout — moldura dos documentos legais (/termos, /privacidade, /cookies) com a
 * identidade da landing: MarketingShell (cabeçalho, rodapé, WhatsApp), faixa café com título em
 * Fraunces e o fio dourado da passagem, abas entre os três documentos, resumo "em poucas palavras",
 * índice lateral com a seção atual destacada (no celular, recolhido) e o texto em cartão claro.
 *
 * Transições (lib/passagem.ts + globals.css): vindo da landing o documento entra deslizando com o
 * cabeçalho parado; entre documentos a página folheia no sentido das abas e a aba ativa escorrega.
 *
 * O texto das seções vem de cada página, numa marcação mínima: parágrafos separados por linha em
 * branco, listas com "•", `**negrito**` e `[texto](/link)`.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Mail, MessageCircle, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { supportWhatsappLink } from '@/lib/whatsapp';

const SITE_URL = 'https://girahub.com.br';

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalHighlight {
  title: string;
  text: string;
}

export interface LegalPageLayoutProps {
  /** `<title>` completo. */
  pageTitle: string;
  description: string;
  /** Caminho da página (canonical, abas e JSON-LD), ex.: `/termos`. */
  path: '/termos' | '/privacidade' | '/cookies';
  /** Título da faixa (h1). */
  heading: string;
  /** Frase curta sob o título. */
  lead: string;
  /** Data de vigência por extenso (ex.: "7 de outubro de 2026") e em ISO (JSON-LD). */
  updatedAt: string;
  updatedAtIso: string;
  version: string;
  intro: React.ReactNode;
  /** "Em poucas palavras": 3 ou 4 pontos que resumem o documento. */
  highlights?: LegalHighlight[];
  sections: LegalSection[];
  /** Conteúdo extra depois das seções (ex.: tabela de cookies). */
  children?: React.ReactNode;
}

export const LEGAL_DOCS = [
  { href: '/termos', label: 'Termos de Uso' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/cookies', label: 'Cookies' },
] as const;

/** Canal do encarregado de dados (LGPD, art. 41) — o mesmo usado nos e-mails da conta. */
export const PRIVACY_EMAIL = 'privacidade@girahub.com.br';

/** Âncora estável a partir do título ("3. Cadastro e Conta" → "cadastro-e-conta"). */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Renderiza `**negrito**` e `[texto](/link)` dentro de um parágrafo. */
export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-tinta">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const cls = 'font-semibold text-barro-700 underline decoration-barro-600/40 underline-offset-2 hover:text-barro-600';
      return href.startsWith('/') ? (
        <Link key={i} href={href} className={cls}>
          {label}
        </Link>
      ) : (
        <a key={i} href={href} className={cls} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Quebra o corpo em parágrafos e listas (linhas iniciadas por "•"). */
export function renderBody(body: string): React.ReactNode {
  const blocks = body.split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const isList = lines.length > 0 && lines.every((l) => l.startsWith('•'));
    if (isList) {
      return (
        <ul key={bi} className="my-4 flex flex-col gap-2.5">
          {lines.map((l, li) => (
            <li key={li} className="relative pl-6">
              <span aria-hidden className="absolute top-[0.7em] left-1 size-1.5 rounded-full bg-barro-500" />
              {renderInline(l.replace(/^•\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="my-4">
        {lines.map((l, li) => (
          <React.Fragment key={li}>
            {renderInline(l)}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

/** Seção visível no momento (para destacar no índice). */
function useSecaoAtual(ids: string[]): string | null {
  const [atual, setAtual] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visiveis.set(e.target.id, e.isIntersecting);
        const primeira = ids.find((id) => visiveis.get(id));
        if (primeira) setAtual(primeira);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids]);
  return atual;
}

function Indice({ itens, atual, onNavigate }: { itens: { id: string; title: string }[]; atual: string | null; onNavigate?: () => void }) {
  return (
    <ol className="flex flex-col gap-0.5 border-l border-areia-200">
      {itens.map((s) => {
        const ativo = s.id === atual;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={onNavigate}
              aria-current={ativo ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l-2 py-1.5 pr-2 pl-4 text-sm leading-snug outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-barro-600/30',
                ativo
                  ? 'border-barro-600 font-semibold text-barro-700'
                  : 'border-transparent text-tinta-suave hover:border-areia-300 hover:text-tinta',
              )}
            >
              {s.title}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function LegalPageLayout({
  pageTitle,
  description,
  path,
  heading,
  lead,
  updatedAt,
  updatedAtIso,
  version,
  intro,
  highlights,
  sections,
  children,
}: LegalPageLayoutProps) {
  const itens = React.useMemo(() => sections.map((s) => ({ id: slugify(s.title), title: s.title })), [sections]);
  const ids = React.useMemo(() => itens.map((i) => i.id), [itens]);
  const atual = useSecaoAtual(ids);
  const [indiceAberto, setIndiceAberto] = useState(false);
  const whatsapp = supportWhatsappLink('Olá! Tenho uma dúvida sobre os termos ou a privacidade do GiraHub.');
  const url = `${SITE_URL}${path}`;
  const palavras = sections.reduce((n, s) => n + s.body.split(/\s+/).length, 0);
  const minutos = Math.max(1, Math.round(palavras / 200));

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: heading,
        description,
        inLanguage: 'pt-BR',
        dateModified: updatedAtIso,
        isPartOf: { '@type': 'WebSite', name: 'GiraHub', url: SITE_URL },
        publisher: { '@type': 'Organization', name: 'GiraHub', url: SITE_URL },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: heading, item: url },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#180e09" />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="GiraHub" />
        <meta property="og:image" content={`${SITE_URL}/landing/fotos/gira-velas.webp`} />
        <meta property="article:modified_time" content={updatedAtIso} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      </Head>

      <MarketingShell>
        {/* Faixa do título: continua o escuro do cabeçalho, como a página de planos. */}
        <section aria-labelledby="documento-titulo" className="relative isolate overflow-hidden bg-cafe-950 pt-10 pb-24 text-white md:pt-14 md:pb-28">
          <div
            aria-hidden
            className="absolute -top-40 right-[-10%] -z-10 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(233,176,74,0.18),transparent)]"
          />
          <div
            aria-hidden
            className="absolute bottom-[-12rem] left-[-8%] -z-10 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(192,97,47,0.22),transparent)]"
          />
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <nav aria-label="Trilha" className="documento-surge text-sm text-areia-300">
              <ol className="flex items-center gap-1.5">
                <li>
                  <Link href="/" className="hover:text-white">
                    Início
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="size-3.5" />
                </li>
                <li aria-current="page" className="text-areia-100">
                  {heading}
                </li>
              </ol>
            </nav>
            <p className="documento-surge mt-8 text-xs font-bold tracking-[0.2em] text-ouro-300 uppercase [--atraso:60ms]">
              Documentos legais
            </p>
            <h1
              id="documento-titulo"
              className="documento-surge mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-bold tracking-tight [--atraso:120ms] sm:text-5xl md:text-6xl"
            >
              {heading}
            </h1>
            <div aria-hidden className="documento-fio mt-6 h-[2px] w-40 bg-gradient-to-r from-ouro-400 via-barro-500 to-transparent" />
            <p className="documento-surge mt-6 max-w-2xl text-lg leading-relaxed text-areia-200 [--atraso:200ms]">{lead}</p>
            <p className="documento-surge mt-4 text-sm text-areia-300 [--atraso:240ms]">
              Vigente desde <time dateTime={updatedAtIso}>{updatedAt}</time> · Versão {version} · Leitura de {minutos} min
            </p>

            {/* Abas entre os documentos — a pílula da aba ativa escorrega na passagem. */}
            <nav aria-label="Documentos legais" className="documento-surge mt-10 [--atraso:300ms] print:hidden">
              <ul className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
                {LEGAL_DOCS.map((d) => {
                  const ativo = d.href === path;
                  return (
                    <li key={d.href} className="relative shrink-0">
                      {ativo && <span aria-hidden className="documento-aba-ativa absolute inset-0 rounded-full bg-ouro-400" />}
                      <Link
                        href={d.href}
                        aria-current={ativo ? 'page' : undefined}
                        className={cn(
                          'relative flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300/60 sm:px-5',
                          ativo ? 'text-cafe-950' : 'text-areia-200 hover:text-white',
                        )}
                      >
                        {d.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </section>

        <div className="bg-areia-50 pb-20 md:pb-28">
          <div className="mx-auto -mt-12 grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
            {/* Índice: lateral fixo no desktop, recolhido no celular. */}
            <aside className="hidden lg:block print:hidden">
              <div className="sticky top-24 pt-20">
                <p className="mb-3 text-xs font-bold tracking-[0.2em] text-barro-700 uppercase">Nesta página</p>
                <Indice itens={itens} atual={atual} />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-full border border-areia-300 px-4 text-sm font-semibold text-tinta-suave outline-none hover:bg-white hover:text-tinta focus-visible:ring-[3px] focus-visible:ring-barro-600/30"
                >
                  <Printer className="size-4" aria-hidden /> Imprimir ou salvar PDF
                </button>
              </div>
            </aside>

            <article className="documento-surge min-w-0 [--atraso:360ms]">
              <div className="rounded-3xl border border-areia-200 bg-white p-6 shadow-xl shadow-cafe-900/5 sm:p-10">
                <div className="mb-6 lg:hidden print:hidden">
                  <button
                    type="button"
                    aria-expanded={indiceAberto}
                    aria-controls="indice-celular"
                    onClick={() => setIndiceAberto((v) => !v)}
                    className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-areia-100 px-4 text-sm font-semibold text-tinta outline-none focus-visible:ring-[3px] focus-visible:ring-barro-600/30"
                  >
                    Nesta página ({itens.length} seções)
                    <ChevronDown className={cn('size-4 transition-transform', indiceAberto && 'rotate-180')} aria-hidden />
                  </button>
                  <div id="indice-celular" hidden={!indiceAberto} className="mt-3 px-1">
                    <Indice itens={itens} atual={atual} onNavigate={() => setIndiceAberto(false)} />
                  </div>
                </div>

                <div className="text-[1.05rem] leading-[1.8] text-tinta-suave">{intro}</div>

                {highlights && highlights.length > 0 && (
                  <section aria-labelledby="resumo-titulo" className="mt-8 rounded-2xl bg-areia-100 p-5 sm:p-7">
                    <h2 id="resumo-titulo" className="font-display text-xl font-bold text-tinta">
                      Em poucas palavras
                    </h2>
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                      {highlights.map((h) => (
                        <li key={h.title} className="rounded-xl bg-white p-4">
                          <p className="font-semibold text-tinta">{h.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-tinta-suave">{renderInline(h.text)}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-xs text-tinta-suave">
                      O resumo ajuda a leitura, mas não substitui o texto completo abaixo.
                    </p>
                  </section>
                )}

                {sections.map((s, i) => (
                  <section key={itens[i].id} id={itens[i].id} aria-labelledby={`${itens[i].id}-titulo`} className="mt-12 scroll-mt-24">
                    <h2
                      id={`${itens[i].id}-titulo`}
                      className="font-display text-2xl leading-tight font-bold text-tinta sm:text-[1.7rem]"
                    >
                      {s.title}
                    </h2>
                    <div className="text-base leading-[1.8] text-tinta-suave">{renderBody(s.body)}</div>
                  </section>
                ))}

                {children}
              </div>

              {/* Fale com a gente */}
              <div className="mt-8 flex flex-col gap-4 rounded-3xl bg-cafe-950 p-6 text-areia-100 sm:flex-row sm:items-center sm:justify-between sm:p-8 print:hidden">
                <div>
                  <p className="font-display text-xl font-bold text-white">Ficou alguma dúvida?</p>
                  <p className="mt-1 text-sm text-areia-200">Respondemos pedidos sobre dados pessoais em até 15 dias.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href={`mailto:${PRIVACY_EMAIL}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <Mail className="size-4" aria-hidden /> {PRIVACY_EMAIL}
                  </a>
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-folha-600 px-4 text-sm font-bold text-white hover:bg-folha-700"
                    >
                      <MessageCircle className="size-4" aria-hidden /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </article>
          </div>
        </div>
      </MarketingShell>
    </>
  );
}

export default LegalPageLayout;
