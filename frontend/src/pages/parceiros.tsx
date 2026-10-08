/**
 * /parceiros — Programa de Parceiros GiraHub (C-06): convite para lojas de artigos religiosos,
 * dirigentes e médiuns, criadores de conteúdo do axé e federações indicarem o GiraHub aos terreiros.
 * Cupom para o terreiro (desconto nos primeiros meses) e comissão recorrente por PIX para o parceiro.
 *
 * Atrás da chave PARCEIROS_PUBLICADO (constants/parceiros.ts, desligada por padrão): desligada, a
 * página é 404 no build (getStaticProps → notFound) e nenhum link/sitemap aponta para cá.
 * Valores em reais dos exemplos saem de constants/plans.ts — nunca escritos à mão.
 * Formulário em components/landing/ParceiroForm.tsx; lista dos pedidos em /platform/parceiros.
 */
import React from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { BadgePercent, ChevronRight, HandCoins, Megaphone, QrCode, Store, Users, Video, Landmark, MessageSquareText, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { Reveal } from '@/components/landing/Reveal';
import { ParceiroForm } from '@/components/landing/ParceiroForm';
import { PAID_PLANS } from '@/constants/plans';
import {
  COMISSAO_MESES,
  COMISSAO_PCT,
  COMO_FUNCIONA,
  DESCONTO_MESES,
  DESCONTO_PCT,
  MATERIAL,
  PAGAMENTO_MINIMO,
  PARCEIROS_PUBLICADO,
  QUEM_PODE,
  REGULAMENTO,
  comissaoMensal,
  comissaoTotal,
  formatBRL,
  planoExemplo,
} from '@/constants/parceiros';

const TITLE = 'Programa de Parceiros GiraHub — indique e ganhe todo mês';
const DESCRIPTION = `Lojas de artigos religiosos, dirigentes, criadores de conteúdo e federações: indique o GiraHub aos terreiros, dê ${DESCONTO_PCT}% de desconto com o seu cupom e receba ${COMISSAO_PCT}% de comissão por PIX todo mês.`;

const QUEM_ICONS = [Store, Users, Video, Landmark];
const MATERIAL_ICONS = [Link2, QrCode, MessageSquareText];

export const getStaticProps: GetStaticProps = async () => {
  if (!PARCEIROS_PUBLICADO) return { notFound: true };
  return { props: {} };
};

export default function ParceirosPage() {
  const exemplo = planoExemplo();

  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content="#180e09" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <link rel="canonical" href="https://girahub.com.br/parceiros" />
      </Head>

      <MarketingShell>
        {/* Topo */}
        <section aria-labelledby="parceiros-title" className="bg-cafe-950 pt-14 pb-16 text-white md:pt-20 md:pb-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Reveal>
              <p className="mb-4 text-xs font-bold tracking-[0.2em] text-ouro-300 uppercase">Programa de Parceiros GiraHub</p>
              <h1 id="parceiros-title" className="font-display text-4xl leading-tight font-bold sm:text-5xl">
                Indique o GiraHub aos terreiros e ganhe todo mês.
              </h1>
              <p className="mt-5 text-lg text-areia-200">
                O terreiro ganha {DESCONTO_PCT}% de desconto com o seu cupom. Você recebe {COMISSAO_PCT}% do que ele pagar,
                por {COMISSAO_MESES} meses, direto no PIX.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="touch" className="bg-ouro-400 text-base font-bold text-cafe-950 hover:bg-ouro-300">
                  <a href="#quero-ser-parceiro">
                    Quero ser parceiro <ChevronRight aria-hidden />
                  </a>
                </Button>
                <Button
                  asChild
                  size="touch"
                  variant="outline"
                  className="border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#regulamento">Ler o regulamento</a>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Quem pode */}
        <section id="quem-pode" aria-labelledby="quem-pode-title" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="quem-pode-title" eyebrow="Quem pode ser parceiro" title="Quem já fala com os terreiros">
              Se a sua palavra chega nas casas de axé, o GiraHub quer caminhar junto.
            </SectionHeading>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {QUEM_PODE.map((q, i) => {
                const Icon = QUEM_ICONS[i] ?? Users;
                return (
                  <li key={q.title} className="rounded-3xl border border-areia-200 bg-white p-6 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-barro-600 text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-tinta">{q.title}</h3>
                    <p className="mt-1 text-sm text-tinta-suave">{q.desc}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Vantagens dos dois lados */}
        <section id="vantagens" aria-labelledby="vantagens-title" className="scroll-mt-20 bg-areia-100 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="vantagens-title" eyebrow="Bom para os dois lados" title="O terreiro economiza, você é recompensado" />
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <Reveal className="rounded-3xl border border-areia-200 bg-white p-6 shadow-sm sm:p-8">
                <span className="flex size-11 items-center justify-center rounded-xl bg-folha-600 text-white">
                  <BadgePercent className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold text-tinta">Para o terreiro indicado</h3>
                <ul className="mt-4 grid gap-3 text-tinta-suave">
                  <li>O teste grátis normal do GiraHub, sem cartão.</li>
                  <li>
                    <strong className="text-tinta">
                      {DESCONTO_PCT}% de desconto nos {DESCONTO_MESES} primeiros meses
                    </strong>{' '}
                    de qualquer plano pago, com o cupom do parceiro.
                  </li>
                  <li>Sem fidelidade: muda de plano ou cancela quando quiser.</li>
                </ul>
              </Reveal>
              <Reveal delay={0.08} className="rounded-3xl border border-areia-200 bg-white p-6 shadow-sm sm:p-8">
                <span className="flex size-11 items-center justify-center rounded-xl bg-barro-600 text-white">
                  <HandCoins className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold text-tinta">Para você, parceiro</h3>
                <ul className="mt-4 grid gap-3 text-tinta-suave">
                  <li>
                    <strong className="text-tinta">
                      {COMISSAO_PCT}% de comissão recorrente
                    </strong>{' '}
                    sobre o que cada terreiro indicado pagar, durante {COMISSAO_MESES} meses.
                  </li>
                  <li>Pagamento por PIX todo mês, a partir de {formatBRL(PAGAMENTO_MINIMO)} acumulados.</li>
                  <li>Quanto mais casas, mais comissão — não tem limite de indicações.</li>
                </ul>
              </Reveal>
            </div>

            <Reveal className="mt-6 rounded-3xl bg-cafe-950 p-6 text-white sm:p-8">
              <p className="text-xs font-bold tracking-[0.2em] text-ouro-300 uppercase">Na ponta do lápis</p>
              <p data-testid="parceiros-exemplo" className="mt-3 font-display text-2xl leading-snug font-bold sm:text-3xl">
                Um terreiro no plano {exemplo.label} rende {formatBRL(comissaoMensal(exemplo))} por mês para você —
                cerca de {formatBRL(comissaoTotal(exemplo))} em {COMISSAO_MESES} meses.
              </p>
              <ul aria-label="Comissão por plano" className="mt-6 grid gap-3 sm:grid-cols-3">
                {PAID_PLANS.map((p) => (
                  <li key={p.key} className="rounded-2xl border border-white/15 px-4 py-3">
                    <span className="block text-sm text-areia-200">Plano {p.label}</span>
                    <span className="block text-lg font-bold">{formatBRL(comissaoMensal(p))}/mês por terreiro</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-areia-300">
                Valores com o preço cheio do plano. Nos {DESCONTO_MESES} primeiros meses, com o desconto do terreiro, a comissão é
                calculada sobre o valor com desconto. Dez terreiros no {exemplo.label} são {formatBRL(comissaoMensal(exemplo) * 10)} por
                mês.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Material */}
        <section id="material" aria-labelledby="material-title" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="material-title" eyebrow="Material de divulgação" title="Você indica, a gente prepara o material">
              Tudo pronto para usar no balcão, no grupo e nas redes.
            </SectionHeading>
            <ul className="mt-12 grid gap-4 md:grid-cols-3">
              {MATERIAL.map((m, i) => {
                const Icon = MATERIAL_ICONS[i] ?? Megaphone;
                return (
                  <li key={m.title} className="flex gap-4 rounded-3xl border border-areia-200 bg-white p-6 shadow-sm">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ouro-400 text-cafe-950">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <h3 className="font-bold text-tinta">{m.title}</h3>
                      <p className="mt-1 text-sm text-tinta-suave">{m.desc}</p>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Como funciona + formulário */}
        <section id="quero-ser-parceiro" aria-labelledby="como-title" className="scroll-mt-20 bg-areia-100 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeading id="como-title" align="left" eyebrow="Como funciona" title="Quatro passos, sem burocracia" />
              <ol className="mt-10 grid gap-7">
                {COMO_FUNCIONA.map((s, i) => (
                  <li key={s.title} className="flex gap-5">
                    <span
                      aria-hidden
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-barro-600 font-display text-xl font-bold text-white"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-tinta">
                        <span className="sr-only">Passo {i + 1}: </span>
                        {s.title}
                      </h3>
                      <p className="mt-1.5 text-tinta-suave">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className="mb-6 font-display text-2xl font-bold text-tinta sm:text-3xl">Quero ser parceiro</h2>
              <ParceiroForm />
            </div>
          </div>
        </section>

        {/* Regulamento */}
        <section id="regulamento" aria-labelledby="regulamento-title" className="scroll-mt-20 py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading id="regulamento-title" eyebrow="Regulamento" title="As regras, sem letra miúda" />
            <Reveal className="mt-10">
              <Accordion type="single" collapsible className="rounded-3xl border border-areia-200 bg-white px-5 shadow-sm">
                {REGULAMENTO.map((r) => (
                  <AccordionItem key={r.q} value={r.q} className="border-areia-200">
                    <AccordionTrigger className="text-left text-base font-semibold text-tinta hover:no-underline">
                      {r.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed text-tinta-suave">{r.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>
      </MarketingShell>
    </>
  );
}
