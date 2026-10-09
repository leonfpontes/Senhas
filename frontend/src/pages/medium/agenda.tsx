/**
 * /medium/agenda — Agenda da casa para a corrente (AM-07, decisão D-26).
 *
 * Lista por mês (Brasília) das giras e das atividades da casa (AM-08: faxina, ritual, reunião...
 * que o tipo deixa o médium ver) do mês corrente e dos dois seguintes (`GET
 * /api/v1/medium/agenda`), com "Ver os próximos meses" para continuar. Filtro Tudo · Giras ·
 * Atividades — só aparecem as origens que existem. Cada item mostra o tipo com o ícone e a cor que
 * a casa escolheu e abre o detalhe (`/medium/agenda/[tipo]/[id]`); a data fica na cor do terreiro,
 * o que já passou fica neutro e a atividade cancelada aparece riscada. Só chama `/api/v1/medium/*`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { DataChip } from '@/components/medium/DataChip';
import {
  MediumList,
  MediumListItem,
  MediumPage,
  MediumPageHeader,
  MediumSection,
  StatusBadge,
} from '@/components/medium/ui';
import { TipoChip } from '@/components/atividades/TipoChip';
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
import { CLASSE_TOM } from '@/constants/presenca';
import { seloDaAgenda } from '@/components/medium/presenca/presencaApi';
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
  // AM-17: "Na escala" / "Vou" / "Não vou" / "Presente" — só a participação do próprio médium.
  const selo = item.cancelada ? null : seloDaAgenda(item.minha_participacao);
  const semana = quandoBr(item.inicio).split(',')[0];
  return (
    <MediumListItem
      href={detalheHref(item)}
      media={<DataChip iso={item.inicio} passado={passou || Boolean(item.cancelada)} />}
      title={<span className={cn(item.cancelada && 'line-through')}>{item.titulo}</span>}
      description={
        <span className="first-letter:uppercase">
          {semana} · {horaBr(item.inicio)}
          {item.local ? ` · ${item.local}` : ''}
        </span>
      }
      meta={
        <>
          <TipoChip tipo={item.tipo} />
          {selo && (
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold', CLASSE_TOM[selo.tom])}
              data-testid="selo-escala"
            >
              {selo.texto}
            </span>
          )}
          {item.cancelada && <StatusBadge tom="perigo">Cancelada</StatusBadge>}
          {passou && !item.cancelada && !selo && <StatusBadge>Já aconteceu</StatusBadge>}
        </>
      }
    />
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando a agenda">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-48 w-full rounded-xl" />
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
    <MediumPage>
      <MediumPageHeader title="Agenda" description="Giras e atividades da casa." />

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
          <div
            role="group"
            aria-label="Filtrar agenda"
            className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted p-1"
          >
            {filtros.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  'min-h-11 rounded-lg px-3 text-base font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  filtro === f.valor
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground',
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
                <span className="text-base">Quando a casa marcar uma gira ou atividade, ela aparece aqui.</span>
              }
            />
          ) : (
            meses.map((mes) => (
              <MediumSection
                key={mes.chave}
                id={`mes-${mes.chave}`}
                title={<span className="first-letter:uppercase">{mes.rotulo}</span>}
              >
                <MediumList>
                  {mes.itens.map((item) => (
                    <Item key={`${item.origem}-${item.id}`} item={item} />
                  ))}
                </MediumList>
              </MediumSection>
            ))
          )}

          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full bg-card font-semibold"
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
    </MediumPage>
  );
}
