/**
 * /medium — Início da Área do Médium (AM-06).
 *
 * Saudação "Olá, <primeiro nome>" (`MediumPageHeader`); depois as PENDÊNCIAS primeiro (D-24: responder escala,
 * mensalidade a vencer ou vencida, aviso novo — na ordem que o backend devolve), a próxima gira
 * e o que está "Acompanhando" (mensalidade paga/isenta). Nada publicado → EmptyState amigável.
 * Só chama `GET /api/v1/medium/inicio` (e o `/medium/me` do MediumProvider).
 * Escala (AM-17/AM-28): cada escala que pede ação vira um cartão "Você está na escala" no topo
 * (`EscalaCard`: Vou / Não vou com "Conte o motivo", "Responda até…", "Cheguei" na janela — no
 * modo QR abre o leitor); as já respondidas ficam em "Acompanhando".
 * Mensalidade em aberto (AM-11/AM-29): "Pagar com PIX" só quando a casa cadastrou a chave
 * (`mensalidade.pix_disponivel`); sem chave, "Ver mensalidade" (a tela diz como combinar com a casa).
 * Aniversários (AM-20): no dia do aniversário do médium, a mensagem da casa no topo
 * (`meu_aniversario`); e "Aniversariantes da semana" (só quem aceitou mostrar, dia e mês) depois da
 * próxima gira — some quando a lista está vazia.
 * Troca (AM-27): pedido de um colega vira cartão em "Para você ver agora" (Aceito ir / Não posso);
 * os pedidos do médium ainda abertos ficam em "Acompanhando".
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Backpack,
  CalendarDays,
  CircleCheck,
  Clock,
  MapPin,
  Megaphone,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import {
  MediumList,
  MediumListItem,
  MediumPage,
  MediumPageHeader,
  MediumSection,
  MediumSectionLink,
  StatusBadge,
} from '@/components/medium/ui';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import {
  diaMesCurto,
  nomeDoMes,
  primeiroNome,
  quandoBr,
  valorBr,
} from '@/components/medium/format';
import {
  AniversariantesDaSemana,
  MeuAniversarioCard,
  type Aniversariante,
} from '@/components/medium/Aniversarios';
import { EscalaCard } from '@/components/medium/presenca/EscalaCard';
import { fraseDaFuncao } from '@/components/medium/presenca/presencaApi';
import { detalheHref } from '@/components/medium/agenda';
import { EmptyState } from '@/components/EmptyState';
import { ROTULO_SITUACAO_MEDIUM, type ItemPresenca } from '@/constants/presenca';
import { trocaAberta, type MinhasTrocas } from '@/constants/trocas';
import { TrocaCard } from '@/components/medium/troca/TrocaCard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  status: 'pendente' | 'atrasada' | 'em_conferencia' | 'nao_confirmada' | 'paga' | 'isento';
  /** Em aberto: o que FALTA pagar (pagamento parcial, migração 092). */
  valor?: number | null;
  /** O que a casa já recebeu no mês (> 0 = pagou parte). */
  valor_recebido?: number;
  vencimento?: string | null;
  data_pagamento?: string | null;
  /** AM-29: a casa cadastrou a chave PIX (só o sim/não; a chave nunca vem no Início). */
  pix_disponivel?: boolean;
}

export type InicioPendencia =
  | { tipo: 'escala'; quantidade: number }
  | { tipo: 'troca'; quantidade: number }
  | { tipo: 'aviso'; quantidade: number }
  | {
      tipo: 'mensalidade';
      situacao: 'pendente' | 'atrasada' | 'nao_confirmada';
      mes: string;
      /** O que FALTA pagar (pagamento parcial, migração 092). */
      valor?: number | null;
      valor_recebido?: number;
      vencimento?: string | null;
      dias_para_vencer?: number | null;
    };

export interface InicioResponse {
  hoje: string;
  pendencias: InicioPendencia[];
  proxima_gira: InicioGira | null;
  mensalidade: InicioMensalidade | null;
  avisos: { nao_lidos: number; ultimos: unknown[] };
  /** AM-17: próximas escalas do médium (com a participação dele). */
  escalas?: ItemPresenca[];
  /** AM-20: quem aceitou mostrar o aniversário e faz aniversário nesta semana (sem o ano). */
  aniversariantes?: Aniversariante[];
  /** AM-20: só no dia do aniversário do próprio médium. */
  meu_aniversario?: { mensagem: string } | null;
  /** AM-27: trocas na escala (null sem o plano das escalas). */
  trocas?: MinhasTrocas | null;
}

/** A escala pede ação agora: responder (sem resposta) ou marcar "Cheguei". */
export function escalaPedeAcao(e: ItemPresenca): boolean {
  const p = e.minha_participacao;
  return Boolean(p && ((p.pode_responder && p.resposta === 'sem_resposta') || p.pode_checkin));
}

function EscalasAcompanhando({ escalas }: { escalas: ItemPresenca[] }) {
  return (
    <>
      {escalas.map((e) => (
        <MediumListItem
          key={`${e.origem}-${e.id}`}
          href={detalheHref(e)}
          data-testid="escala-acompanhando"
          icon={CircleCheck}
          tom="sucesso"
          title={`${e.titulo} · ${quandoBr(e.inicio).split(' · ')[0]}`}
          description={
            <>
              {fraseDaFuncao(e) && (
                <span className="block font-medium text-brand" data-testid="escala-funcao">
                  {fraseDaFuncao(e)}
                </span>
              )}
              <span className="block">
                {e.minha_participacao?.resposta === 'vou'
                  ? 'Você confirmou: Vou'
                  : e.minha_participacao
                    ? ROTULO_SITUACAO_MEDIUM[e.minha_participacao.situacao]
                    : ''}
              </span>
            </>
          }
        />
      ))}
    </>
  );
}

function MensalidadeCard({ p, pixDisponivel }: { p: Extract<InicioPendencia, { tipo: 'mensalidade' }>; pixDisponivel: boolean }) {
  if (p.situacao === 'nao_confirmada') {
    return (
      <Card className="gap-4 rounded-xl py-5 shadow-xs" data-testid="pendencia-mensalidade">
        <CardHeader className="gap-1.5 px-5">
          <StatusBadge tom="perigo">
            <TriangleAlert aria-hidden /> Mensalidade de {nomeDoMes(p.mes)}
          </StatusBadge>
          <CardTitle className="text-lg leading-snug">A casa não confirmou seu comprovante</CardTitle>
          <CardDescription className="text-base">Veja o motivo e envie outro comprovante.</CardDescription>
        </CardHeader>
        <CardFooter className="px-5">
          <Button asChild size="touch" className="w-full font-semibold">
            <Link href="/medium/mensalidade">Ver o motivo</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  const atrasada = p.situacao === 'atrasada';
  const venc = p.vencimento ? diaMesCurto(p.vencimento) : null;
  return (
    <Card className="gap-4 rounded-xl py-5 shadow-xs" data-testid="pendencia-mensalidade">
      <CardHeader className="px-5">
        <CardDescription className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wallet className="size-4 text-brand" aria-hidden /> Mensalidade de {nomeDoMes(p.mes)}
        </CardDescription>
        {(p.valor_recebido ?? 0) > 0 && (
          <span className="text-sm font-semibold text-warning-strong">Falta pagar</span>
        )}
        <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">{valorBr(p.valor)}</CardTitle>
        {venc && (
          <CardAction>
            <StatusBadge tom={atrasada ? 'perigo' : 'atencao'}>
              {atrasada ? `Venceu em ${venc}` : p.dias_para_vencer === 0 ? 'Vence hoje' : `Vence em ${venc}`}
            </StatusBadge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="px-5">
        <Button asChild size="touch" className="w-full font-semibold">
          {/* AM-11: abre direto o "Pagar com PIX" do mês — só se a casa tem chave (AM-29). */}
          {pixDisponivel ? (
            <Link href="/medium/mensalidade?pagar=1">Pagar com PIX</Link>
          ) : (
            <Link href="/medium/mensalidade">Ver mensalidade</Link>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function PendenciaLinha({ p }: { p: Extract<InicioPendencia, { tipo: 'aviso' | 'escala' }> }) {
  const aviso = p.tipo === 'aviso';
  return (
    <MediumListItem
      href={aviso ? '/medium/avisos' : '/medium/agenda'}
      icon={aviso ? Megaphone : CalendarDays}
      title={
        aviso
          ? p.quantidade === 1
            ? '1 aviso novo da casa'
            : `${p.quantidade} avisos novos da casa`
          : 'Você está na escala'
      }
      description={aviso ? 'Leia os recados e orientações da casa.' : 'Veja a data e responda se vai.'}
    />
  );
}

function ProximaGira({ gira, comAgenda }: { gira: InicioGira; comAgenda: boolean }) {
  const corpo = (
    <>
      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-2xl leading-tight font-semibold tracking-tight">{gira.nome}</h3>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="flex items-center gap-2 first-letter:uppercase">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            <span className="first-letter:uppercase">{quandoBr(gira.data_inicio)}</span>
          </span>
          {gira.local && (
            <span className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" aria-hidden /> {gira.local}
            </span>
          )}
        </div>
      </div>
      {gira.orientacoes && (
        <div className="flex gap-2.5 border-t border-primary-foreground/20 px-5 py-3.5 text-sm">
          <Backpack className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <strong className="block font-semibold">O que levar</strong>
            <span className={cn('whitespace-pre-line', comAgenda && 'line-clamp-3')}>{gira.orientacoes}</span>
          </div>
        </div>
      )}
    </>
  );
  const classes =
    'block overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
  return (
    <MediumSection
      id="titulo-proxima-gira"
      title="Próxima gira"
      action={comAgenda ? <MediumSectionLink href="/medium/agenda">Ver agenda</MediumSectionLink> : undefined}
    >
      {comAgenda ? (
        <Link
          href={`/medium/agenda/gira/${encodeURIComponent(gira.id)}`}
          className={classes}
          data-testid="proxima-gira"
          aria-label={`Ver detalhes da gira: ${gira.nome}`}
        >
          {corpo}
        </Link>
      ) : (
        <article className={classes} data-testid="proxima-gira">
          {corpo}
        </article>
      )}
    </MediumSection>
  );
}

function Acompanhando({ mensalidade }: { mensalidade: InicioMensalidade }) {
  const isento = mensalidade.status === 'isento';
  const conferencia = mensalidade.status === 'em_conferencia';
  // Em aberto e longe do vencimento (mais de 5 dias): acompanha aqui, sem subir para o topo.
  const aVencer = mensalidade.status === 'pendente' || conferencia;
  return (
    <MediumListItem
      href="/medium/mensalidade"
      icon={aVencer ? Clock : CircleCheck}
      tom={aVencer ? 'neutro' : 'sucesso'}
      title={`Mensalidade de ${nomeDoMes(mensalidade.mes)}`}
      description={
        conferencia
          ? 'Comprovante enviado · aguardando a casa confirmar'
          : aVencer
            ? `${mensalidade.valor != null ? `${(mensalidade.valor_recebido ?? 0) > 0 ? 'Falta ' : ''}${valorBr(mensalidade.valor)} · ` : ''}vence em ${mensalidade.vencimento ? diaMesCurto(mensalidade.vencimento) : 'breve'}`
            : isento
              ? 'Você está isento de mensalidade'
              : 'Paga · confirmada pela casa'
      }
    />
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando o início">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-36 w-full rounded-xl" />
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
  const escalas = data?.escalas ?? [];
  const escalasComAcao = escalas.filter(escalaPedeAcao);
  const escalasRespondidas = escalas.filter((e) => !escalaPedeAcao(e));
  const trocasParaResponder = data?.trocas?.para_responder ?? [];
  const minhasTrocasAbertas = (data?.trocas?.minhas ?? []).filter((t) => t.papel === 'pedi' && trocaAberta(t));
  const n = pendencias.reduce(
    (t, p) =>
      t +
      (p.tipo === 'escala'
        ? Math.max(1, escalasComAcao.length)
        : p.tipo === 'troca'
          ? Math.max(1, trocasParaResponder.length)
          : 1),
    0,
  );
  const recarregar = () => setNonce((x) => x + 1);
  const mensalidadeNoTopo = pendencias.some((p) => p.tipo === 'mensalidade');
  const acompanhando =
    data?.mensalidade &&
    (data.mensalidade.status === 'paga' ||
      data.mensalidade.status === 'isento' ||
      data.mensalidade.status === 'em_conferencia' ||
      (data.mensalidade.status === 'pendente' && !mensalidadeNoTopo))
      ? data.mensalidade
      : null;
  const aniversariantes = data?.aniversariantes ?? [];
  const meuAniversario = data?.meu_aniversario ?? null;
  const vazio =
    data &&
    n === 0 &&
    !data.proxima_gira &&
    !acompanhando &&
    escalas.length === 0 &&
    minhasTrocasAbertas.length === 0 &&
    aniversariantes.length === 0 &&
    !meuAniversario;

  const pendenciasSimples = pendencias.filter(
    (p): p is Extract<InicioPendencia, { tipo: 'aviso' | 'escala' }> =>
      p.tipo === 'aviso' || (p.tipo === 'escala' && escalasComAcao.length === 0),
  );

  return (
    <MediumPage>
      <MediumPageHeader
        title={nome ? `Olá, ${nome}` : 'Olá'}
        description={
          data
            ? n === 0
              ? 'Tudo em dia por aqui.'
              : n === 1
                ? 'Você tem 1 coisa para ver.'
                : `Você tem ${n} coisas para ver.`
            : undefined
        }
      />

      {erro ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Não conseguimos carregar o início"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" size="touch" className="font-semibold" onClick={() => setNonce((x) => x + 1)}>
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
          {meuAniversario && <MeuAniversarioCard mensagem={meuAniversario.mensagem} />}
          {n > 0 && (
            <MediumSection id="titulo-pendencias" title="Para você ver agora">
              {pendencias.map((p, i) =>
                p.tipo === 'troca' ? (
                  trocasParaResponder.map((t) => (
                    <TrocaCard key={t.id} troca={t} comAtividade onAtualizado={recarregar} />
                  ))
                ) : p.tipo === 'escala' && escalasComAcao.length > 0 ? (
                  escalasComAcao.map((e) => (
                    <EscalaCard
                      key={`${e.origem}-${e.id}-${e.minha_participacao?.resposta}`}
                      item={e}
                      compacto
                      onAtualizado={recarregar}
                    />
                  ))
                ) : p.tipo === 'mensalidade' ? (
                  <MensalidadeCard
                    key={`${p.tipo}-${i}`}
                    p={p}
                    pixDisponivel={Boolean(data?.mensalidade?.pix_disponivel)}
                  />
                ) : null,
              )}
              {pendenciasSimples.length > 0 && (
                <MediumList>
                  {pendenciasSimples.map((p, i) => (
                    <PendenciaLinha key={`${p.tipo}-${i}`} p={p} />
                  ))}
                </MediumList>
              )}
            </MediumSection>
          )}
          {data.proxima_gira && (
            <ProximaGira gira={data.proxima_gira} comAgenda={(me?.modulos ?? []).includes('agenda')} />
          )}
          <AniversariantesDaSemana lista={aniversariantes} />
          {(acompanhando || escalasRespondidas.length > 0 || minhasTrocasAbertas.length > 0) && (
            <MediumSection id="titulo-acompanhando" title="Acompanhando">
              {minhasTrocasAbertas.map((t) => (
                <TrocaCard key={`${t.id}-${t.status}`} troca={t} comAtividade onAtualizado={recarregar} />
              ))}
              {(escalasRespondidas.length > 0 || acompanhando) && (
                <MediumList>
                  {escalasRespondidas.length > 0 && <EscalasAcompanhando escalas={escalasRespondidas} />}
                  {acompanhando && <Acompanhando mensalidade={acompanhando} />}
                </MediumList>
              )}
            </MediumSection>
          )}
        </>
      )}
    </MediumPage>
  );
}
