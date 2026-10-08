/**
 * /medium/agenda/[tipo]/[id] — detalhe de um item da Agenda: `tipo = gira` (AM-07,
 * `GET /api/v1/medium/agenda/gira/{id}`) ou `tipo = atividade` (AM-08, faxina, ritual, reunião...,
 * `GET /api/v1/medium/agenda/atividade/{id}`).
 *
 * Dia e hora (Brasília), local ou endereço da casa com "Abrir no mapa", "Orientações para a
 * corrente" (o que levar — só na Área, nunca no site, e-mail ou bilhete). Na gira, a situação das
 * senhas para o público (sem dado de consulente) e "Divulgar a gira no WhatsApp"; a atividade é
 * interna — nunca tem link público nem botão de divulgar, e cancelada mostra o motivo. Ações,
 * enquanto não passou:
 * - "Adicionar à agenda do celular" (principal): o .ics servido pela API (`text/calendar`) —
 *   no iPhone o Safari oferece "Adicionar à agenda"; no Android o Chrome baixa e abre a agenda;
 * - "Abrir no Google Agenda": link comum, funciona até no navegador do WhatsApp.
 * Aberto dentro do WhatsApp/Instagram, mostra como abrir no navegador (baixar pode falhar).
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CalendarPlus,
  Clock,
  Info,
  MapPin,
  Share2,
  Ticket,
  TriangleAlert,
} from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { DataChip } from '@/components/medium/DataChip';
import { TipoChip } from '@/components/atividades/TipoChip';
import {
  divulgarUrl,
  horarioCompleto,
  isInAppBrowser,
  jaPassou,
  textoSenhas,
  type AtividadeDetalhe,
  type GiraDetalhe,
} from '@/components/medium/agenda';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/services/api_client';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm';

type Detalhe = ({ kind: 'gira' } & GiraDetalhe) | ({ kind: 'atividade' } & AtividadeDetalhe);

export default function MediumAgendaDetalhePage() {
  return (
    <MediumLayout title="Agenda">
      <DetalheDoItem />
    </MediumLayout>
  );
}

function Voltar() {
  return (
    <Link
      href="/medium/agenda"
      className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-5" aria-hidden /> Voltar para a agenda
    </Link>
  );
}

function DetalheDoItem() {
  const router = useRouter();
  const { me } = useMedium();
  const tipo = typeof router.query.tipo === 'string' ? router.query.tipo : null;
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const [item, setItem] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<'rede' | 'nao_encontrada' | 'indisponivel' | null>(null);
  const [nonce, setNonce] = useState(0);
  const [noApp, setNoApp] = useState(false);

  useEffect(() => setNoApp(isInAppBrowser()), []);

  useEffect(() => {
    if (!router.isReady || !tipo || !id) return;
    if (tipo !== 'gira' && tipo !== 'atividade') {
      setErro('nao_encontrada');
      return;
    }
    let alive = true;
    setErro(null);
    apiClient
      .get<GiraDetalhe | AtividadeDetalhe>(`/api/v1/medium/agenda/${tipo}/${encodeURIComponent(id)}`)
      .then((res) => alive && setItem({ kind: tipo, ...res.data } as Detalhe))
      .catch((err: { status?: number }) => {
        if (!alive) return;
        setErro(
          err?.status === 404 || err?.status === 422
            ? 'nao_encontrada'
            : err?.status === 403
              ? 'indisponivel'
              : 'rede',
        );
      });
    return () => {
      alive = false;
    };
  }, [router.isReady, tipo, id, nonce]);

  const ehGira = tipo !== 'atividade';
  const nomeDoItem = ehGira ? 'gira' : 'atividade';

  if (erro) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
        <Voltar />
        {erro === 'rede' ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={`Não conseguimos abrir ${ehGira ? 'a gira' : 'a atividade'}`}
            description="Confira a internet e tente de novo."
            action={
              <Button type="button" size="touch" className="font-bold" onClick={() => setNonce((n) => n + 1)}>
                Tentar de novo
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<CalendarDays />}
            title={erro === 'indisponivel' ? 'Agenda indisponível' : `Não encontramos esta ${nomeDoItem}`}
            description={
              <span className="text-base">
                {erro === 'indisponivel'
                  ? 'A casa não deixou a agenda aberta na Área do Médium.'
                  : `Ela pode ter sido desmarcada. Veja a agenda para as próximas.`}
              </span>
            }
          />
        )}
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8" role="status" aria-label={`Carregando a ${nomeDoItem}`}>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const passou = jaPassou(item);
  const cancelada = item.kind === 'atividade' && Boolean(item.cancelada);
  const senhas = item.kind === 'gira' ? textoSenhas(item.senhas) : null;
  const icsHref = `${apiClient.getBaseURL?.() ?? ''}${item.agenda_celular.ics_path}`;
  const lugar = [item.local, item.endereco].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-8">
      <Voltar />

      <header className="flex items-center gap-3.5">
        <DataChip iso={item.inicio} passado={passou || cancelada} />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <TipoChip tipo={item.tipo} />
          <h1 className="font-display text-[1.6rem] leading-tight font-bold tracking-tight">{item.titulo}</h1>
        </div>
      </header>

      {item.kind === 'atividade' && cancelada && (
        <p
          className="flex items-start gap-3 rounded-2xl bg-destructive/10 px-4 py-3.5 text-base text-destructive-strong"
          role="status"
          data-testid="atividade-cancelada"
        >
          <Ban className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong className="block">A casa cancelou esta atividade.</strong>
            {item.cancelamento_motivo && <span className="block">{item.cancelamento_motivo}</span>}
          </span>
        </p>
      )}

      <div className={CARD}>
        <p className="flex items-start gap-3 text-base">
          <Clock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <strong className="block first-letter:uppercase">{horarioCompleto(item)}</strong>
            {passou && (
              <span className="block text-sm text-muted-foreground">
                {item.kind === 'gira' ? 'Esta gira já aconteceu.' : 'Esta atividade já aconteceu.'}
              </span>
            )}
          </span>
        </p>
        {lugar.length > 0 && (
          <p className="flex items-start gap-3 text-base">
            <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              {lugar.map((l) => (
                <span key={l}>{l}</span>
              ))}
              {item.mapa_url && (
                <a
                  href={item.mapa_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center font-bold text-brand underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Abrir no mapa
                </a>
              )}
            </span>
          </p>
        )}
        {senhas && (
          <p className="flex items-start gap-3 text-base" data-testid="gira-senhas">
            <Ticket className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{senhas}</span>
          </p>
        )}
      </div>

      <section
        className="flex flex-col gap-1.5 rounded-2xl bg-muted px-4 py-3.5"
        aria-labelledby="titulo-orientacoes"
      >
        <h2 id="titulo-orientacoes" className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
          O que levar · Orientações para a corrente
        </h2>
        {item.orientacoes_corrente ? (
          <p className="text-base whitespace-pre-line">{item.orientacoes_corrente}</p>
        ) : (
          <p className="text-base text-muted-foreground">
            A casa ainda não deixou orientações para esta {nomeDoItem}.
          </p>
        )}
      </section>

      {item.descricao && (
        <section className="flex flex-col gap-1.5" aria-labelledby="titulo-sobre">
          <h2 id="titulo-sobre" className="text-xs font-extrabold tracking-[0.16em] text-brand uppercase">
            {item.kind === 'gira' ? 'Sobre a gira' : 'Sobre a atividade'}
          </h2>
          <p className="text-base whitespace-pre-line">{item.descricao}</p>
        </section>
      )}

      {!passou && !cancelada && (
        <section className="flex flex-col gap-2.5" aria-label={item.kind === 'gira' ? 'Ações da gira' : 'Ações da atividade'}>
          <Button asChild size="touch" className="w-full font-bold">
            <a href={icsHref} data-testid={item.kind === 'gira' ? 'gira-ics' : 'atividade-ics'}>
              <CalendarPlus aria-hidden /> Adicionar à agenda do celular
            </a>
          </Button>
          <Button asChild variant="outline" size="touch" className="w-full font-bold">
            <a href={item.agenda_celular.google_url} target="_blank" rel="noopener noreferrer">
              <CalendarDays aria-hidden /> Abrir no Google Agenda
            </a>
          </Button>
          {item.kind === 'gira' && (
            <Button asChild variant="outline" size="touch" className="w-full font-bold">
              <a href={divulgarUrl(item, me?.terreiro.nome)} target="_blank" rel="noopener noreferrer">
                <Share2 aria-hidden /> Divulgar a gira no WhatsApp
              </a>
            </Button>
          )}
          {noApp && (
            <p className="flex items-start gap-2.5 rounded-xl bg-info/10 p-3 text-sm text-info-strong" role="note">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Abriu dentro do WhatsApp? Se a agenda do celular não abrir, toque nos três pontinhos e escolha{' '}
                <strong>Abrir no navegador</strong>, ou use o Google Agenda.
              </span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
