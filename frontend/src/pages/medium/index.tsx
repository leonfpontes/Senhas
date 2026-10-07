/**
 * /medium — Início da Área do Médium (AM-06).
 *
 * Faixa café com "Olá, <primeiro nome>"; depois as PENDÊNCIAS primeiro (D-24: responder escala,
 * mensalidade a vencer ou vencida, aviso novo — na ordem que o backend devolve), a próxima gira
 * e o que está "Acompanhando" (mensalidade paga/isenta). Nada publicado → EmptyState amigável.
 * Só chama `GET /api/v1/medium/inicio` (e o `/medium/me` do MediumProvider).
 * Os cartões da v2 ("Sua próxima escala", "Cheguei") entram aqui pelo AM-17/AM-25.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock,
  Megaphone,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import {
  diaMesBr,
  diaMesCurto,
  nomeDoMes,
  primeiroNome,
  quandoBr,
  valorBr,
} from '@/components/medium/format';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

export interface InicioGira {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim?: string | null;
  local?: string | null;
  orientacoes?: string | null;
}

export interface InicioMensalidade {
  mes: string;
  status: 'pendente' | 'atrasada' | 'paga' | 'isento';
  valor?: number | null;
  vencimento?: string | null;
  data_pagamento?: string | null;
}

export type InicioPendencia =
  | { tipo: 'escala'; quantidade: number }
  | { tipo: 'aviso'; quantidade: number }
  | {
      tipo: 'mensalidade';
      situacao: 'pendente' | 'atrasada';
      mes: string;
      valor?: number | null;
      vencimento?: string | null;
      dias_para_vencer?: number | null;
    };

export interface InicioResponse {
  hoje: string;
  pendencias: InicioPendencia[];
  proxima_gira: InicioGira | null;
  mensalidade: InicioMensalidade | null;
  avisos: { nao_lidos: number; ultimos: unknown[] };
}

const SECTION_TITLE = 'text-xs font-extrabold tracking-[0.16em] text-brand uppercase';
const CARD =
  'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm';

function Pendencia({ p }: { p: InicioPendencia }) {
  if (p.tipo === 'mensalidade') {
    const atrasada = p.situacao === 'atrasada';
    const venc = p.vencimento ? diaMesCurto(p.vencimento) : null;
    return (
      <article className={CARD} data-testid="pendencia-mensalidade">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand">
          <Wallet className="size-4" aria-hidden /> Mensalidade de {nomeDoMes(p.mes)}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-3xl font-bold tabular-nums">{valorBr(p.valor)}</span>
          {venc && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-sm font-bold',
                atrasada
                  ? 'bg-destructive/15 text-destructive-strong'
                  : 'bg-warning/15 text-warning-strong',
              )}
            >
              {atrasada
                ? `Venceu em ${venc}`
                : p.dias_para_vencer === 0
                  ? 'Vence hoje'
                  : `Vence em ${venc}`}
            </span>
          )}
        </div>
        <Button asChild size="touch" className="w-full font-bold">
          <Link href="/medium/mensalidade">Ver mensalidade</Link>
        </Button>
      </article>
    );
  }
  const aviso = p.tipo === 'aviso';
  const href = aviso ? '/medium/avisos' : '/medium/agenda';
  const Icon = aviso ? Megaphone : CalendarDays;
  const texto = aviso
    ? p.quantidade === 1
      ? '1 aviso novo da casa'
      : `${p.quantidade} avisos novos da casa`
    : 'Você está na escala';
  return (
    <Link
      href={href}
      className={cn(
        CARD,
        'min-h-16 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="flex-1 text-base font-bold">{texto}</span>
        <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
      </span>
    </Link>
  );
}

function ProximaGira({ gira, comAgenda }: { gira: InicioGira; comAgenda: boolean }) {
  const { dia, mes } = diaMesBr(gira.data_inicio);
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="titulo-proxima-gira">
      <h2 id="titulo-proxima-gira" className={SECTION_TITLE}>
        Próxima gira
      </h2>
      <article className={CARD} data-testid="proxima-gira">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-primary py-1.5 text-primary-foreground"
          >
            <b className="font-display text-2xl leading-none">{dia}</b>
            <small className="text-xs font-extrabold tracking-wider uppercase">{mes}</small>
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-xl leading-tight font-semibold">{gira.nome}</h3>
            <p className="text-base text-muted-foreground first-letter:uppercase">
              {quandoBr(gira.data_inicio)}
            </p>
            {gira.local && <p className="text-sm text-muted-foreground">{gira.local}</p>}
          </div>
        </div>
        {gira.orientacoes && (
          <div className="flex flex-col gap-1 rounded-xl bg-muted px-3.5 py-3 text-base">
            <strong className="text-xs tracking-wider text-muted-foreground uppercase">
              O que levar
            </strong>
            <span className="whitespace-pre-line">{gira.orientacoes}</span>
          </div>
        )}
        {comAgenda && (
          <Link
            href={`/medium/agenda/gira/${encodeURIComponent(gira.id)}`}
            className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Ver detalhes da gira <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </article>
    </section>
  );
}

function Acompanhando({ mensalidade }: { mensalidade: InicioMensalidade }) {
  const isento = mensalidade.status === 'isento';
  // Em aberto e longe do vencimento (mais de 5 dias): acompanha aqui, sem subir para o topo.
  const aVencer = mensalidade.status === 'pendente';
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="titulo-acompanhando">
      <h2 id="titulo-acompanhando" className={SECTION_TITLE}>
        Acompanhando
      </h2>
      <div className={cn(CARD, 'flex-row items-center')}>
        {aVencer ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Clock className="size-5" aria-hidden />
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success-strong">
            <CircleCheck className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-base font-bold">Mensalidade de {nomeDoMes(mensalidade.mes)}</p>
          <p className="text-sm text-muted-foreground">
            {aVencer
              ? `${mensalidade.valor != null ? `${valorBr(mensalidade.valor)} · ` : ''}vence em ${mensalidade.vencimento ? diaMesCurto(mensalidade.vencimento) : 'breve'}`
              : isento
                ? 'Você está isento de mensalidade'
                : 'Paga · confirmada pela casa'}
          </p>
        </div>
      </div>
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando o início">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

export default function MediumInicioPage() {
  return (
    <MediumLayout title="Início">
      <Inicio />
    </MediumLayout>
  );
}

function Inicio() {
  const { me } = useMedium();
  const [data, setData] = useState<InicioResponse | null>(null);
  const [erro, setErro] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setErro(false);
    apiClient
      .get<InicioResponse>('/api/v1/medium/inicio')
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setErro(true));
    return () => {
      alive = false;
    };
  }, [nonce]);

  const nome = primeiroNome(me?.nome);
  const pendencias = data?.pendencias ?? [];
  const n = pendencias.length;
  const mensalidadeNoTopo = pendencias.some((p) => p.tipo === 'mensalidade');
  const acompanhando =
    data?.mensalidade &&
    (data.mensalidade.status === 'paga' ||
      data.mensalidade.status === 'isento' ||
      (data.mensalidade.status === 'pendente' && !mensalidadeNoTopo))
      ? data.mensalidade
      : null;
  const vazio = data && n === 0 && !data.proxima_gira && !acompanhando;

  return (
    <>
      <section className="relative bg-cafe-950 px-4 pt-6 pb-7 text-areia-100">
        <p className="text-xs font-extrabold tracking-[0.18em] text-ouro-300 uppercase">
          Área do Médium
        </p>
        <h1 className="mt-2 font-display text-[1.9rem] leading-[1.1] font-bold tracking-tight text-white">
          {nome ? `Olá, ${nome}` : 'Olá'}
        </h1>
        {data && (
          <p className="mt-2 text-base text-areia-200">
            {n === 0
              ? 'Tudo em dia por aqui.'
              : n === 1
                ? 'Você tem 1 coisa para ver.'
                : `Você tem ${n} coisas para ver.`}
          </p>
        )}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary to-ouro-400"
        />
      </section>

      <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
        {erro ? (
          <EmptyState
            icon={<TriangleAlert />}
            title="Não conseguimos carregar o início"
            description="Confira a internet e tente de novo."
            action={
              <Button
                type="button"
                size="touch"
                className="font-bold"
                onClick={() => setNonce((x) => x + 1)}
              >
                Tentar de novo
              </Button>
            }
          />
        ) : !data ? (
          <Esqueleto />
        ) : vazio ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Nada novo por aqui"
            description="Quando a casa marcar uma gira ou mandar um aviso, ele aparece aqui."
          />
        ) : (
          <>
            {n > 0 && (
              <section className="flex flex-col gap-2.5" aria-labelledby="titulo-pendencias">
                <h2 id="titulo-pendencias" className={SECTION_TITLE}>
                  Para você ver agora
                </h2>
                {pendencias.map((p, i) => (
                  <Pendencia key={`${p.tipo}-${i}`} p={p} />
                ))}
              </section>
            )}
            {data.proxima_gira && (
              <ProximaGira
                gira={data.proxima_gira}
                comAgenda={(me?.modulos ?? []).includes('agenda')}
              />
            )}
            {acompanhando && <Acompanhando mensalidade={acompanhando} />}
          </>
        )}
      </div>
    </>
  );
}
