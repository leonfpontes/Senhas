/**
 * Site do GiraHub · Jornada 1 v2 (pen.dev: J1 v2 · 01 Abertura e 02 Como funciona).
 *
 * A v2 troca a "receita de landing" (selo em caixa-alta, faixa de números, cartões iguais, bloco
 * escuro de CTA) por tipografia: Fraunces leve com uma palavra em itálico no acento, filetes no
 * lugar de caixas e o picote do bilhete como assinatura. A prova é a interface real (mensagem do
 * WhatsApp, bilhete, linhas da Porta), reta e no tamanho real. Fotos com cor natural.
 *
 * Os dados continuam nas fontes de sempre: depoimentos em `constants/testimonials.ts` (só os
 * autorizados), perguntas em `constants/landingFaq.ts` (as mesmas do JSON-LD) e os planos mínimos
 * de cada módulo em `constants/plans.ts` (`minPlanPhrase`).
 */
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Photo } from '@/components/landing/Photo';
import { TESTIMONIALS, testimonialExcerpt, testimonialPlace, type Testimonial } from '@/constants/testimonials';
import { visibleFaq } from '@/constants/landingFaq';
import { supportWhatsappLink } from '@/lib/whatsapp';
import { trackEvent } from '@/services/analytics';
import { SouMediumDialog } from '@/components/landing/SouMedium';
import { AREA_MEDIUM_DIVULGADA } from '@/constants/areaMedium';

/** Manchete em Fraunces leve; `acento` é a palavra final em itálico na cor de acento. */
export function Manchete({
  as: Tag = 'h2',
  id,
  antes,
  acento,
  className,
}: {
  as?: 'h1' | 'h2';
  id?: string;
  antes: React.ReactNode;
  acento?: string;
  className?: string;
}) {
  return (
    <Tag id={id} className={cn('font-display font-normal tracking-[-0.03em] text-tinta', className)}>
      {antes}
      {acento && <em className="text-barro-600">{acento}</em>}
    </Tag>
  );
}

/** O picote do bilhete: filete tracejado com os meios-círculos nas pontas. */
export function Picote({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative h-4', className)}>
      <span className="absolute inset-x-3 top-1/2 border-t border-dashed border-areia-300" />
      <span className="absolute top-0 left-0 size-4 rounded-full border border-areia-300 bg-areia-50" />
      <span className="absolute top-0 right-0 size-4 rounded-full border border-areia-300 bg-areia-50" />
    </div>
  );
}

/** A mensagem que a casa manda no grupo do WhatsApp (prova real, sem enfeite). */
export function MensagemWhatsApp({ className }: { className?: string }) {
  return (
    <div className={cn('w-[320px] max-w-full rounded-xl bg-[#E9F5E1] p-3 text-[#1F2A1F] shadow-lg', className)} aria-hidden>
      <p className="text-xs font-semibold text-[#2E7D4F]">Terreiro Filhos de Fé</p>
      <p className="mt-1 text-sm leading-snug">
        Boa noite, corrente e consulentes! As senhas da gira de sábado já estão abertas. Cada um pega a sua pelo link.
      </p>
      <div className="mt-2 rounded-md bg-white/70 px-2.5 py-2 text-xs">
        <p className="font-semibold">Gira de Caboclos · sáb 8/11 · 19h</p>
        <p className="text-[#2E6A4E]">girahub.com.br/public/gira/8f3c2a91</p>
      </div>
      <p className="mt-1 text-right text-[0.6875rem] text-[#5B6B5B]">20:04</p>
    </div>
  );
}

/** O bilhete como o consulente vê: faixa da casa, "Sua senha" sem caixa-alta, número em Fraunces. */
export function BilheteV2({ className, numero = '027' }: { className?: string; numero?: string }) {
  return (
    <div className={cn('w-[280px] overflow-hidden rounded-2xl border border-areia-200 bg-white shadow-lg', className)} aria-hidden>
      <p className="bg-folha-600 px-4 py-2.5 text-sm font-semibold text-areia-50">Terreiro Filhos de Fé</p>
      <div className="px-4 pt-4 pb-3 text-center">
        <p className="text-sm text-tinta-suave">Sua senha</p>
        <p className="font-display text-[5.25rem] leading-none font-semibold tracking-[-0.03em] text-folha-600">{numero}</p>
      </div>
      <Picote className="mx-[-8px]" />
      <div className="px-4 pt-2 pb-4 text-sm">
        <p className="font-semibold text-tinta">Gira de Caboclos</p>
        <p className="text-tinta-suave">Sábado, 8 de novembro · 19h</p>
        <p className="text-tinta-suave">Em nome de Maria Aparecida</p>
      </div>
    </div>
  );
}

const FICHA = [
  ['Consulente', 'Sem aplicativo, pelo link'],
  ['Porta', 'No celular ou no tablet da casa'],
  ['Salão', 'Modo TV com a chamada'],
  ['Corrente', 'Médiuns, mensalidade e avisos'],
  ['Para começar', 'R$ 0, sem cartão'],
] as const;

export function AberturaV2({ whatsapp = supportWhatsappLink() }: { whatsapp?: string }) {
  return (
    <section id="hero" aria-labelledby="hero-title" className="bg-areia-50">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 pt-10 pb-4 sm:px-6 lg:grid-cols-[1fr_minmax(0,520px)] md:pt-14">
        <div className="flex flex-col gap-6 md:pt-10">
          <Manchete
            as="h1"
            id="hero-title"
            antes={
              <>
                <span className="block">A fila do portão</span>{' '}
                <span className="block">agora cabe no</span>{' '}
              </>
            }
            acento="celular."
            className="text-[2.75rem] leading-[1.02] sm:text-6xl xl:text-[5.25rem]"
          />
          <p className="max-w-xl text-lg text-tinta-suave sm:text-[1.1875rem]">
            O consulente pega a senha pelo link que a casa manda no WhatsApp, sem instalar nada. No dia, a Porta chama na ordem
            certa e a TV do salão mostra quem é o próximo.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Button asChild size="touch" className="h-14 rounded-[10px] bg-folha-600 px-6 text-base font-semibold text-white hover:bg-folha-700">
              <Link href="/cadastro">
                Criar a conta da casa <ArrowRight aria-hidden />
              </Link>
            </Button>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('whatsapp_click', { origem: 'hero' })}
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-tinta underline-offset-4 hover:underline"
              >
                Falar com a gente no WhatsApp <ArrowRight className="size-4" aria-hidden />
              </a>
            )}
          </div>
          <p className="text-sm text-tinta-suave">
            Grátis para sempre com 2 giras por mês. Toda casa nova testa o Premium por 30 dias, sem cartão.
          </p>
          {/* Divulgação da Área do Médium (AM-24) — só com a chave de lançamento ligada. */}
          {AREA_MEDIUM_DIVULGADA && <SouMediumDialog className="text-barro-700 hover:text-tinta" />}
        </div>

        <figure className="relative mx-auto h-[520px] w-full max-w-[560px] sm:h-[630px]">
          <div className="absolute top-0 right-0 h-[440px] w-[78%] border border-areia-300 p-3 sm:h-[584px]">
            <Photo name="corrente" priority sizes="(min-width: 900px) 440px, 80vw" className="h-full w-full rounded-[4px]" />
          </div>
          <MensagemWhatsApp className="absolute top-[52%] left-0 hidden sm:block" />
          <BilheteV2 className="absolute top-[38%] right-0 w-[220px] sm:right-[-24px] sm:w-[260px]" />
          <figcaption className="absolute bottom-0 left-[24%] text-[0.8125rem] text-tinta-suave">Corrente em dia de gira.</figcaption>
        </figure>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6">
        <Picote />
        <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-5">
          {FICHA.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[0.8125rem] font-medium text-tinta-suave">{k}</dt>
              <dd className="m-0 font-semibold text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ProvaCartaoDeGira() {
  return (
    <div className="w-[340px] max-w-full rounded-[14px] border border-areia-200 bg-white p-5" aria-hidden>
      <div className="flex items-start gap-3">
        <div className="w-14">
          <p className="font-display text-[2.125rem] leading-none text-tinta">8</p>
          <p className="text-xs text-tinta-suave">sáb · nov</p>
        </div>
        <div>
          <p className="font-semibold text-tinta">Gira de Caboclos</p>
          <p className="text-sm text-tinta-suave">19h</p>
          <span className="mt-1 inline-block rounded-md border border-folha-600/30 bg-folha-600/10 px-2 py-0.5 text-xs font-medium text-folha-700">
            Senhas abertas
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-tinta-suave">Senhas abertas até sáb 18h → gira 19h</p>
    </div>
  );
}

function ProvaPorta() {
  const linhas = [
    ['027', 'Maria Aparecida', 'Preferencial 60+', '18h41'],
    ['028', 'João Batista', '1 acompanhante', '18h44'],
    ['029', 'Ana Lúcia', 'Primeira vez', '18h47'],
  ];
  return (
    <ul className="m-0 w-[460px] max-w-full list-none overflow-hidden rounded-[10px] border border-areia-200 bg-white p-0" aria-hidden>
      {linhas.map(([n, nome, meta, hora]) => (
        <li key={n} className="flex items-center gap-3 border-b border-areia-200 px-4 py-3 last:border-b-0">
          <span className="font-display text-2xl text-tinta">{n}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-tinta">{nome}</span>
            <span className="block text-xs text-tinta-suave">{meta}</span>
          </span>
          <span className="rounded-md bg-folha-600/10 px-2 py-0.5 text-xs font-medium text-folha-700">Chegou</span>
          <span className="text-xs text-tinta-suave">{hora}</span>
        </li>
      ))}
    </ul>
  );
}

function ProvaRelatorio() {
  return (
    <div className="w-[300px] max-w-full rounded-[14px] border border-areia-200 bg-white p-5" aria-hidden>
      <p className="text-sm text-tinta-suave">Atendidos na gira</p>
      <p className="font-display text-5xl leading-tight text-tinta">86</p>
      <p className="text-sm text-tinta-suave">de 120 senhas · 14 faltaram</p>
    </div>
  );
}

const SABADO = [
  {
    quando: 'Terça, 10h',
    dia: 'Uma vez por gira',
    titulo: 'A casa cria a gira',
    texto: 'Nome, data e quantas senhas. Preferencial e acompanhante entram na conta sozinhos.',
    prova: <ProvaCartaoDeGira />,
  },
  {
    quando: 'Terça, 20h',
    dia: 'No grupo da casa',
    titulo: 'O link vai no WhatsApp',
    texto: 'Quem vem pega a senha pelo celular, com nome e contato. Sem aplicativo e sem cadastro.',
    prova: <MensagemWhatsApp className="shadow-none" />,
  },
  {
    quando: 'Sábado, 18h30',
    dia: 'No portão',
    titulo: 'A Porta chama na ordem',
    texto: 'Quem chega é marcado na hora. A ordem respeita preferencial e horário de chegada, e a TV do salão acompanha.',
    prova: <ProvaPorta />,
  },
  {
    quando: 'Sábado, 22h',
    dia: 'Depois da gira',
    titulo: 'O relatório já está pronto',
    texto: 'Quantos vieram, quantos faltaram e quanto tempo esperaram. Dá para comparar uma gira com a outra.',
    prova: <ProvaRelatorio />,
  },
];

const RESTO_DA_CASA = [
  ['Corrente', 'Cadastro dos médiuns, relatório de cada gira e mensalidade com comprovante pelo celular.', 'a partir do Basic'],
  ['Ficha e caminhada', 'Ficha espiritual do médium, guardada com acesso só de quem a casa liberar.', 'a partir do Pro'],
  ['Site e cursos', 'Endereço da casa na internet, agenda pública e inscrição em cursos.', 'a partir do Pro'],
  ['Fila de espera', 'Gira lotou? Quem fica de fora entra na espera e é avisado quando abre vaga.', 'Premium'],
  ['Financeiro e estoque', 'Contas a pagar e receber, caixa, associados e a lista de compras do congá.', 'Premium'],
] as const;

export function ComoFuncionaV2() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20 bg-areia-50 pt-16 md:pt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <Manchete
            id="como-funciona-title"
            antes={
              <>
                Um sábado de gira, <br />
                do começo ao{' '}
              </>
            }
            acento="fim."
            className="text-4xl leading-[1.05] sm:text-6xl lg:text-[4.5rem]"
          />
          <p className="max-w-sm text-lg text-tinta-suave">
            Nada de configurar sistema. A casa faz o que já fazia, só que sem papel e sem fila no portão.
          </p>
        </div>

        <ol className="m-0 mt-10 list-none p-0">
          {SABADO.map((p) => (
            <li
              key={p.quando}
              className="grid gap-6 border-t border-areia-300 py-10 md:grid-cols-[260px_minmax(0,360px)_1fr] md:items-start md:gap-10"
            >
              <div>
                <p className="font-display text-4xl leading-none tracking-[-0.03em] text-tinta md:text-[2.875rem]">{p.quando}</p>
                <p className="mt-1.5 text-[0.9375rem] font-medium text-tinta-suave">{p.dia}</p>
              </div>
              <div>
                <h3 className="font-display text-[1.875rem] leading-tight font-medium tracking-[-0.02em] text-tinta">{p.titulo}</h3>
                <p className="mt-2.5 text-tinta-suave">{p.texto}</p>
              </div>
              <div className="flex md:justify-end">{p.prova}</div>
            </li>
          ))}
        </ol>

        <Picote className="mt-6" />

        <div className="mt-12">
          <Manchete antes="O resto da casa também " acento="cabe aqui." className="text-3xl leading-tight sm:text-[3.25rem]" />
          <ul className="m-0 mt-8 list-none border-b border-areia-300 p-0">
            {RESTO_DA_CASA.map(([nome, texto, plano]) => (
              <li
                key={nome}
                className="grid gap-2 border-t border-areia-300 py-6 md:grid-cols-[420px_1fr_150px] md:items-center md:gap-10"
              >
                <span className="font-display text-[1.75rem] leading-tight tracking-[-0.02em] text-tinta md:text-[2.125rem]">{nome}</span>
                <span className="text-tinta-suave">{texto}</span>
                <span className="text-sm font-semibold text-barro-700 md:text-right">{plano}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Autoria({ t, grande = false }: { t: Testimonial; grande?: boolean }) {
  const iniciais = t.nome
    .split(' ')
    .filter((p) => /^[A-ZÀ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
  const tam = grande ? 64 : 44;
  return (
    <figcaption className="flex items-center gap-3">
      {t.foto ? (
        <Image src={t.foto} alt="" width={tam} height={tam} unoptimized className="shrink-0 rounded-full object-cover" style={{ width: tam, height: tam }} />
      ) : (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-full bg-areia-200 font-semibold text-tinta"
          style={{ width: tam, height: tam }}
        >
          {iniciais}
        </span>
      )}
      <span>
        <span className={cn('block font-semibold text-tinta', grande && 'text-lg')}>{t.nome}</span>
        <span className="block text-sm text-tinta-suave">{testimonialPlace(t)}</span>
      </span>
    </figcaption>
  );
}

export function DepoimentosV2() {
  if (TESTIMONIALS.length === 0) return null;
  const [destaque, ...outros] = TESTIMONIALS;
  return (
    <section aria-label="Depoimentos" className="bg-areia-50 pt-20 md:pt-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 md:grid-cols-[minmax(0,460px)_1fr] md:gap-20">
        <Photo name="assistencia" sizes="(min-width: 900px) 460px, 100vw" className="h-[420px] w-full rounded-[4px] md:h-[600px]" />
        <div className="flex flex-col gap-4">
          <figure className="m-0 flex flex-col gap-5">
            <blockquote className="m-0 font-display text-3xl leading-[1.12] tracking-[-0.02em] text-tinta italic sm:text-[3rem]">
              “{testimonialExcerpt(destaque, 120).replace(/^Desde que começamos a usar o site GiraHub, /, '')}”
            </blockquote>
            <Autoria t={destaque} grande />
          </figure>
          <div className="mt-6">
            {outros.map((t) => (
              <figure key={t.nome} className="m-0 flex flex-col gap-3 border-t border-areia-300 py-5">
                <blockquote className="m-0 text-tinta">“{testimonialExcerpt(t, 140)}”</blockquote>
                <Autoria t={t} />
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PerguntasV2() {
  const itens = visibleFaq();
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-20 bg-areia-50 pt-20 md:pt-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[380px_1fr] md:gap-24">
        <Manchete
          id="duvidas-title"
          antes={
            <>
              Perguntas de quem <br />
              está{' '}
            </>
          }
          acento="chegando."
          className="text-3xl leading-tight sm:text-[3.25rem]"
        />
        {/* Abertas, sem sanfona: ninguém precisa clicar para ler a resposta. Mesmo texto do JSON-LD. */}
        <dl className="m-0">
          {itens.map((f) => (
            <div key={f.q} className="border-t border-areia-300 py-5">
              <dt className="text-[1.1875rem] font-semibold text-tinta">{f.q}</dt>
              <dd className="m-0 mt-2 text-tinta-suave">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function FechoV2() {
  return (
    <section aria-labelledby="fecho-title" className="bg-areia-50 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Picote />
        <div className="mt-12 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Manchete id="fecho-title" antes="Crie a gira de sábado " acento="hoje." className="text-4xl leading-tight sm:text-[4rem]" />
          <Button asChild size="touch" className="h-14 rounded-[10px] bg-folha-600 px-6 text-base font-semibold text-white hover:bg-folha-700">
            <Link href="/cadastro">
              Criar a conta da casa <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <ul className="m-0 mt-6 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm text-tinta-suave">
          {['Sem cartão para testar', 'Pessoas da casa ilimitadas', 'Sai quando quiser'].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check className="size-4 text-folha-600" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
