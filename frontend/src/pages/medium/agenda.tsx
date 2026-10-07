/**
 * /medium/agenda — Agenda da casa para a corrente (AM-07, decisão D-26).
 *
 * Lista por mês (Brasília) das giras do mês corrente e dos dois seguintes (`GET
 * /api/v1/medium/agenda`), com "Ver os próximos meses" para continuar. Filtro Tudo · Giras —
 * só aparecem as origens que existem (Atividades chegam com o AM-08). Cada item abre o detalhe
 * (`/medium/agenda/[tipo]/[id]`); a data fica na cor do terreiro e o que já passou fica neutro.
 * Só chama `/api/v1/medium/*`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { DataChip } from '@/components/medium/DataChip';
import {
  agruparPorMes,
  detalheHref,
  jaPassou,
  ROTULO_ORIGEM,
  type AgendaItem,
  type AgendaOrigem,
  type AgendaResponse,
} from '@/components/medium/agenda';
import { horaBr, quandoBr } from '@/components/medium/format';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { addDaysIso } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

type Filtro = 'tudo' | AgendaOrigem;

export default function MediumAgendaPage() {
  return (
    <MediumLayout title="Agenda">
      <Agenda />
    </MediumLayout>
  );
}

function Item({ item }: { item: AgendaItem }) {
  const passou = jaPassou(item);
  const semana = quandoBr(item.inicio).split(',')[0];
  return (
    <li>
      <Link
        href={detalheHref(item)}
        className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <DataChip iso={item.inicio} passado={passou} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="font-display text-lg leading-tight font-semibold">{item.titulo}</strong>
          <span className="text-base text-muted-foreground first-letter:uppercase">
            {semana} · {horaBr(item.inicio)}
            {item.local ? ` · ${item.local}` : ''}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-primary bg-card px-2.5 py-0.5 text-sm font-bold text-brand">
              {item.tipo.nome}
            </span>
            {passou && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground">
                Já aconteceu
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando a agenda">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}

function Agenda() {
  const [data, setData] = useState<AgendaResponse | null>(null);
  const [erro, setErro] = useState<'rede' | 'indisponivel' | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setErro(null);
    apiClient
      .get<AgendaResponse>('/api/v1/medium/agenda')
      .then((res) => alive && setData(res.data))
      .catch((err: { status?: number }) => {
        if (alive) setErro(err?.status === 403 ? 'indisponivel' : 'rede');
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const verMais = useCallback(async () => {
    if (!data) return;
    setCarregandoMais(true);
    try {
      const res = await apiClient.get<AgendaResponse>(
        `/api/v1/medium/agenda?inicio=${addDaysIso(data.fim, 1)}`,
      );
      setData({ inicio: data.inicio, fim: res.data.fim, itens: [...data.itens, ...res.data.itens] });
    } catch {
      setErro('rede');
    } finally {
      setCarregandoMais(false);
    }
  }, [data]);

  const origens = useMemo(
    () => Array.from(new Set((data?.itens ?? []).map((i) => i.origem))),
    [data],
  );
  const itens = (data?.itens ?? []).filter((i) => filtro === 'tudo' || i.origem === filtro);
  const meses = agruparPorMes(itens);
  const filtros: { valor: Filtro; rotulo: string }[] = [
    { valor: 'tudo', rotulo: 'Tudo' },
    ...origens.map((o) => ({ valor: o as Filtro, rotulo: ROTULO_ORIGEM[o] ?? o })),
  ];

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 pb-8">
      <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">Agenda</h1>

      {erro === 'indisponivel' ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Agenda indisponível"
          description={<span className="text-base">A casa não deixou a agenda aberta na Área do Médium.</span>}
        />
      ) : erro === 'rede' && !data ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Não conseguimos carregar a agenda"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" size="touch" className="font-bold" onClick={() => setNonce((n) => n + 1)}>
              Tentar de novo
            </Button>
          }
        />
      ) : !data ? (
        <Esqueleto />
      ) : (
        <>
          <div role="group" aria-label="Filtrar agenda" className="flex flex-wrap gap-2">
            {filtros.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  'min-h-12 rounded-full border px-5 text-base font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  filtro === f.valor
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground',
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {meses.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Nada na agenda por enquanto"
              description={
                <span className="text-base">Quando a casa marcar uma gira, ela aparece aqui.</span>
              }
            />
          ) : (
            meses.map((mes) => (
              <section key={mes.chave} className="flex flex-col gap-2.5" aria-labelledby={`mes-${mes.chave}`}>
                <h2
                  id={`mes-${mes.chave}`}
                  className="text-xs font-extrabold tracking-[0.16em] text-brand uppercase"
                >
                  {mes.rotulo}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {mes.itens.map((item) => (
                    <Item key={`${item.origem}-${item.id}`} item={item} />
                  ))}
                </ul>
              </section>
            ))
          )}

          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full font-bold"
            onClick={() => void verMais()}
            disabled={carregandoMais}
          >
            <CalendarDays aria-hidden />
            {carregandoMais ? 'Carregando…' : 'Ver os próximos meses'}
          </Button>
          {erro === 'rede' && (
            <p className="text-sm text-destructive-strong" role="alert">
              Não conseguimos carregar mais meses. Tente de novo.
            </p>
          )}
        </>
      )}
    </div>
  );
}
