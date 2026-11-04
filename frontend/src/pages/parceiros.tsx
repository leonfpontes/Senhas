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
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { Reveal } from '@/components/landing/Reveal';
import { Picote } from '@/components/landing/v2';
import { fraunces } from '@/components/landing/fonts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ParceiroForm } from '@/components/landing/ParceiroForm';
import { PAID_PLANS } from '@/constants/plans';
import {
  COMISSAO_MESES,
  COMISSAO_PCT,
  COMO_FUNCIONA,
  DESCONTO_MESES,
  DESCONTO_PCT,
  MATERIAL,
  PAGAMENTO_ATE_DIA,
  PAGAMENTO_MINIMO,
  PARCEIROS_PUBLICADO,
  QUEM_PODE,
  REGULAMENTO,
  RESPOSTA_DIAS_UTEIS,
  comissaoMensal,
  comissaoTotal,
  formatBRL,
} from '@/constants/parceiros';

const TITLE = 'Programa de Parceiros GiraHub — indique e ganhe todo mês';
const DESCRIPTION = `Lojas de artigos religiosos, dirigentes, criadores de conteúdo e federações: indique o GiraHub aos terreiros, dê ${DESCONTO_PCT}% de desconto com o seu cupom e receba ${COMISSAO_PCT}% de comissão por PIX todo mês.`;


export const getStaticProps: GetStaticProps = async () => {
  if (!PARCEIROS_PUBLICADO) return { notFound: true };
  return { props: {} };
};

export default function ParceirosPage() {

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
        {/* J13 v2 · 01: o topo sobre o areia, alinhado à esquerda; os dois lados em filetes e a conta
            inteira numa tabela. Todos os números saem de constants/parceiros.ts e dos planos. */}
        <section aria-labelledby="parceiros-title" className={cn(fraunces.variable, 'bg-areia-50 pt-12 pb-16 text-tinta md:pt-16 md:pb-24')}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-sm font-semibold text-barro-700">Programa de Parceiros GiraHub</p>
              <h1 id="parceiros-title" className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] font-normal tracking-[-0.02em] sm:text-6xl">
                Indique o GiraHub aos terreiros e ganhe <em className="text-barro-600">todo mês.</em>
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-tinta-suave">
                Se a sua palavra chega nas casas de axé, o GiraHub quer caminhar junto.{' '}
                {QUEM_PODE.map((q) => q.title.charAt(0) + q.title.slice(1).toLowerCase()).join(', ')}.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Button asChild size="touch" className="bg-folha-600 font-semibold text-white hover:bg-folha-700">
                  <a href="#quero-ser-parceiro">
                    Quero ser parceiro <ChevronRight aria-hidden />
                  </a>
                </Button>
                <a href="#regulamento" className="min-h-11 content-center text-sm font-semibold text-tinta underline underline-offset-4">
                  Ler o regulamento
                </a>
              </div>
            </Reveal>

            <Picote className="mt-12" />

            <div id="vantagens" className="mt-10 grid scroll-mt-20 gap-10 md:grid-cols-2 md:gap-14">
              <div>
                <h2 className="font-display text-2xl font-normal">Para o terreiro indicado</h2>
                <ul className="mt-4">
                  <li className="border-b border-areia-200 py-3">
                    <p className="font-semibold">{DESCONTO_PCT}% de desconto</p>
                    <p className="text-sm text-tinta-suave">Nos {DESCONTO_MESES} primeiros meses de plano pago, com o cupom do parceiro.</p>
                  </li>
                  <li className="border-b border-areia-200 py-3">
                    <p className="font-semibold">O teste grátis normal</p>
                    <p className="text-sm text-tinta-suave">O teste grátis do GiraHub, sem cartão.</p>
                  </li>
                  <li className="py-3">
                    <p className="font-semibold">Sem fidelidade</p>
                    <p className="text-sm text-tinta-suave">Muda de plano ou cancela quando quiser.</p>
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="font-display text-2xl font-normal">Para você, parceiro</h2>
                <ul className="mt-4">
                  <li className="border-b border-areia-200 py-3">
                    <p className="font-semibold">{COMISSAO_PCT}% de tudo o que a casa paga</p>
                    <p className="text-sm text-tinta-suave">
                      Por {COMISSAO_MESES} meses de pagamento. Quanto mais casas, mais comissão: não tem limite de indicações.
                    </p>
                  </li>
                  <li className="border-b border-areia-200 py-3">
                    <p className="font-semibold">PIX todo mês</p>
                    <p className="text-sm text-tinta-suave">
                      Até o dia {PAGAMENTO_ATE_DIA} do mês seguinte, a partir de {formatBRL(PAGAMENTO_MINIMO)} acumulados (abaixo disso, soma no mês seguinte).
                    </p>
                  </li>
                  <li className="py-3">
                    <p className="font-semibold">Material pronto</p>
                    <p className="text-sm text-tinta-suave">
                      {MATERIAL.map((m) => m.title).join(', ')}. Tudo pronto para usar no balcão, no grupo e nas redes.
                    </p>
                  </li>
                </ul>
              </div>
            </div>

            <h2 className="mt-14 font-display text-2xl font-normal">Na ponta do lápis</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-areia-200 bg-white">
              <Table aria-label="Comissão por plano" data-testid="parceiros-exemplo">
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>A casa paga</TableHead>
                    <TableHead>Você recebe por mês</TableHead>
                    <TableHead>Em {COMISSAO_MESES} meses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PAID_PLANS.map((p) => (
                    <TableRow key={p.key}>
                      <TableCell className="font-semibold">{p.label}</TableCell>
                      <TableCell className="tabular-nums text-tinta-suave">{formatBRL(p.price)}/mês</TableCell>
                      <TableCell className="font-semibold tabular-nums">{formatBRL(comissaoMensal(p))}</TableCell>
                      <TableCell className="font-semibold tabular-nums">{formatBRL(comissaoTotal(p))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-tinta-suave">
              Os {COMISSAO_MESES} meses contam os {DESCONTO_MESES} primeiros com o desconto do terreiro (a comissão é de {COMISSAO_PCT}% sobre o
              valor já com desconto). Respondemos o pedido em até {RESPOSTA_DIAS_UTEIS} dias úteis.
            </p>
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
