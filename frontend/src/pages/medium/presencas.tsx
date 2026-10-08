/**
 * /medium/presencas — "Minhas presenças" (AM-17, aberta pelo Perfil — D-27).
 *
 * `GET /api/v1/medium/presencas`: o percentual dos últimos 3 meses (presentes ÷ escalas com a
 * chamada encerrada, sem as dispensadas), as próximas escalas (cartão "Você está na escala" com
 * Vou / Não vou e "Cheguei") e o histórico com a situação de cada gira/atividade — falta ainda
 * dentro do prazo mostra "Conte o motivo (até dd/mm)". Só a própria presença (D-07): "Só você e a
 * direção da casa veem suas presenças." Plano sem a presença → aviso neutro.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, MessageSquareText, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { DataChip } from '@/components/medium/DataChip';
import { detalheHref } from '@/components/medium/agenda';
import { quandoBr } from '@/components/medium/format';
import { EscalaCard } from '@/components/medium/presenca/EscalaCard';
import { MotivoSheet } from '@/components/medium/presenca/MotivoSheet';
import {
  contarMotivo,
  estaImpersonando,
  prazoTexto,
} from '@/components/medium/presenca/presencaApi';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSnackbar } from '@/contexts/SnackbarContext';
import {
  CLASSE_TOM,
  ROTULO_SITUACAO_MEDIUM,
  TOM_SITUACAO,
  type ItemPresenca,
  type PresencasResponse,
} from '@/constants/presenca';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

const SECTION_TITLE = 'text-xs font-extrabold tracking-[0.16em] text-brand uppercase';

export default function MediumPresencasPage() {
  return (
    <MediumLayout title="Minhas presenças">
      <Presencas />
    </MediumLayout>
  );
}

function Historico({
  item,
  onJustificar,
}: {
  item: ItemPresenca;
  onJustificar: (i: ItemPresenca) => void;
}) {
  const p = item.minha_participacao;
  if (!p) return null;
  const prazo = prazoTexto(p);
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-sm">
      <DataChip iso={item.inicio} passado />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={detalheHref(item)}
          className="font-display text-lg leading-tight font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {item.titulo}
        </Link>
        <span className="text-sm text-muted-foreground first-letter:uppercase">
          {quandoBr(item.inicio)}
        </span>
        <span
          className={cn(
            'self-start rounded-full px-2.5 py-0.5 text-sm font-semibold',
            CLASSE_TOM[TOM_SITUACAO[p.situacao]],
          )}
          data-testid="situacao"
        >
          {ROTULO_SITUACAO_MEDIUM[p.situacao]}
        </span>
        {p.funcao && p.situacao !== 'dispensado' && (
          <span className="text-sm text-muted-foreground" data-testid="historico-funcao">
            Função: {p.funcao}
          </span>
        )}
        {p.justificativa && <span className="text-sm">Motivo: {p.justificativa}</span>}
        {!p.chamada_encerrada && p.situacao !== 'presente' && p.situacao !== 'ausente' && (
          <span className="text-sm text-muted-foreground">A casa ainda não fechou a chamada.</span>
        )}
        {p.pode_justificar && !estaImpersonando() && (
          <button
            type="button"
            onClick={() => onJustificar(item)}
            className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MessageSquareText className="size-4" aria-hidden />
            {p.justificativa ? 'Mudar o motivo' : 'Conte o motivo'}
            {prazo ? ` (${prazo})` : ''}
          </button>
        )}
      </div>
    </li>
  );
}

function Presencas() {
  const { showSuccess } = useSnackbar();
  const [data, setData] = useState<PresencasResponse | null>(null);
  const [erro, setErro] = useState<'rede' | 'indisponivel' | null>(null);
  const [nonce, setNonce] = useState(0);
  const [justificar, setJustificar] = useState<ItemPresenca | null>(null);
  const recarregar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setErro(null);
    apiClient
      .get<PresencasResponse>('/api/v1/medium/presencas')
      .then((res) => alive && setData(res.data))
      .catch(
        (err: { status?: number }) =>
          alive && setErro(err?.status === 403 ? 'indisponivel' : 'rede'),
      );
    return () => {
      alive = false;
    };
  }, [nonce]);

  const resumo = data?.resumo;
  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-8">
      <Link
        href="/medium/perfil"
        className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-5" aria-hidden /> Voltar para o perfil
      </Link>
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">
          Minhas presenças
        </h1>
        <p className="text-base text-muted-foreground">Últimos 3 meses</p>
      </div>

      {erro === 'indisponivel' ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="Presenças indisponíveis"
          description={
            <span className="text-base">A casa ainda não usa a presença pela Área do Médium.</span>
          }
        />
      ) : erro === 'rede' ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Não conseguimos carregar suas presenças"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" size="touch" className="font-bold" onClick={recarregar}>
              Tentar de novo
            </Button>
          }
        />
      ) : !data || !resumo ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando suas presenças">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <article
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm"
            data-testid="resumo-presencas"
          >
            <span className="font-display text-5xl font-bold text-brand tabular-nums">
              {resumo.percentual != null ? `${resumo.percentual}%` : '—'}
            </span>
            <p className="text-base">
              {resumo.total > 0 ? (
                <>
                  Você esteve em{' '}
                  <b>
                    {resumo.presentes} de {resumo.total}
                  </b>{' '}
                  giras, faxinas e atividades em que estava na escala.
                </>
              ) : (
                'Quando a casa fechar a chamada das suas escalas, sua presença aparece aqui.'
              )}
            </p>
          </article>

          {data.proximas.length > 0 && (
            <section className="flex flex-col gap-2.5" aria-labelledby="titulo-proximas">
              <h2 id="titulo-proximas" className={SECTION_TITLE}>
                Próximas escalas
              </h2>
              {data.proximas.map((item) => (
                <EscalaCard
                  key={`${item.origem}-${item.id}-${item.minha_participacao?.resposta}`}
                  item={item}
                  compacto
                  onAtualizado={recarregar}
                />
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2.5" aria-labelledby="titulo-historico">
            <h2 id="titulo-historico" className={SECTION_TITLE}>
              Histórico
            </h2>
            {data.historico.length === 0 ? (
              <p className="text-base text-muted-foreground">Nada por aqui ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.historico.map((item) => (
                  <Historico
                    key={`${item.origem}-${item.id}`}
                    item={item}
                    onJustificar={setJustificar}
                  />
                ))}
              </ul>
            )}
          </section>

          <p className="text-sm text-muted-foreground">
            Só você e a direção da casa veem suas presenças. Você tem{' '}
            {data.prazo_justificativa_dias} dias depois de cada atividade para contar o motivo de
            uma falta.
          </p>
        </>
      )}

      <MotivoSheet
        open={justificar !== null}
        onOpenChange={(open) => !open && setJustificar(null)}
        titulo="Por que você não foi?"
        descricao={justificar ? `${justificar.titulo} · ${quandoBr(justificar.inicio)}` : undefined}
        obrigatorio
        botao="Enviar para a casa"
        onEnviar={async (texto) => {
          if (!justificar) return;
          await contarMotivo(justificar, texto);
          showSuccess('Motivo enviado para a casa.');
          recarregar();
        }}
      />
    </div>
  );
}
