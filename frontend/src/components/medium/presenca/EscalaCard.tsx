/**
 * Cartão "Você está na escala" da Área do Médium (AM-17/AM-28) — Início e detalhe da Agenda.
 *
 * Mostra a resposta e o que dá para fazer agora, na ordem do protótipo validado:
 * - "Cheguei" (botão grande) quando a janela do tipo está aberta — no modo QR abre o leitor;
 * - "Vou" / "Não vou" (o "Não vou" abre "Conte o motivo") enquanto a atividade não começou;
 * - "Você confirmou: Vou." / "Você avisou que não vai." com "Mudar resposta";
 * - "Presença marcada às 9h04."; ausência com "Conte o motivo (até 14/10)".
 * Impersonando (suporte), só leitura: as ações somem. Só a própria participação (D-07).
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleCheck, Info, MessageSquareText, X } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { TipoChip } from '@/components/atividades/TipoChip';
import { detalheHref } from '@/components/medium/agenda';
import { horaBr, quandoBr } from '@/components/medium/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ItemPresenca, MinhaParticipacao } from '@/constants/presenca';
import { ChegueiSheet } from './ChegueiSheet';
import { MotivoSheet } from './MotivoSheet';
import {
  cheguei,
  contarMotivo,
  estaImpersonando,
  janelaTexto,
  mensagemDoErro,
  prazoTexto,
  responder,
} from './presencaApi';

const CARD =
  'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm';

function ehHoje(iso: string, agora = new Date()): boolean {
  return quandoBr(iso).split(' · ')[0] === quandoBr(agora.toISOString()).split(' · ')[0];
}

export function Status({
  tom,
  children,
}: {
  tom: 'ok' | 'warn' | 'bad' | 'info';
  children: React.ReactNode;
}) {
  const classes = {
    ok: 'bg-success/15 text-success-strong',
    warn: 'bg-warning/15 text-warning-strong',
    bad: 'bg-destructive/10 text-destructive-strong',
    info: 'bg-info/10 text-info-strong',
  }[tom];
  const Icone = tom === 'ok' ? CircleCheck : Info;
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl p-3 text-base', classes)} role="status">
      <Icone className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export interface EscalaCardProps {
  item: ItemPresenca;
  /** No Início: mais curto e com "Ver detalhes". */
  compacto?: boolean;
  /** Sem o título/data (o detalhe da Agenda já mostra). */
  semCabecalho?: boolean;
  onAtualizado?: (p: MinhaParticipacao) => void;
}

export function EscalaCard({
  item,
  compacto = false,
  semCabecalho = false,
  onAtualizado,
}: EscalaCardProps) {
  const { showSuccess, showError } = useSnackbar();
  const [p, setP] = useState<MinhaParticipacao | null>(item.minha_participacao);
  const [mudando, setMudando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [naoVou, setNaoVou] = useState(false);
  const [motivo, setMotivo] = useState(false);
  const [qr, setQr] = useState(false);
  const leitura = estaImpersonando();
  if (!p || item.cancelada) return null;
  if (p.situacao === 'dispensado' || p.situacao === 'substituido') {
    return (
      <p
        className="rounded-2xl bg-muted px-4 py-3 text-base text-muted-foreground"
        data-testid="escala-fora"
      >
        A casa tirou você da escala desta {item.origem === 'gira' ? 'gira' : 'atividade'}.
      </p>
    );
  }

  const atualizar = (nova: MinhaParticipacao) => {
    setP(nova);
    setMudando(false);
    onAtualizado?.(nova);
  };

  const vou = async () => {
    setEnviando(true);
    try {
      atualizar(await responder(item, 'vou'));
      showSuccess('Combinado! A casa já sabe que você vai.');
    } catch (err) {
      showError(mensagemDoErro(err, 'Não conseguimos enviar sua resposta. Tente de novo.'));
    } finally {
      setEnviando(false);
    }
  };

  const chegueiPeloApp = async () => {
    setEnviando(true);
    try {
      atualizar(await cheguei(item));
      showSuccess('Presença marcada. Bom trabalho!');
    } catch (err) {
      showError(mensagemDoErro(err, 'Não conseguimos marcar sua presença. Tente de novo.'));
    } finally {
      setEnviando(false);
    }
  };

  const hoje = ehHoje(item.inicio);
  // "grupo G2" (§8.9 do plano; escala de faxina, AM-25) e a função da escala de gira.
  const complemento = [p.grupo ? `grupo ${p.grupo}` : null, p.funcao].filter(Boolean).join(' · ');
  const quando = `${quandoBr(item.inicio)}${item.fim ? ` às ${horaBr(item.fim)}` : ''}`;
  const janela = janelaTexto(p);
  const prazo = prazoTexto(p);
  const mostraResposta = p.pede_confirmacao && (p.pode_responder || p.resposta !== 'sem_resposta');
  const perguntar = !leitura && p.pode_responder && (p.resposta === 'sem_resposta' || mudando);
  const nomeCurto = item.titulo;

  return (
    <article className={cn(CARD, 'border-primary/40 bg-primary/5')} data-testid="escala-card">
      {!semCabecalho && (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-brand">
            <TipoChip tipo={item.tipo} size="sm" />
            {hoje ? 'Hoje · você está na escala' : 'Você está na escala'}
            {complemento && <span className="text-muted-foreground">· {complemento}</span>}
          </p>
          <div>
            <h3 className="font-display text-xl leading-tight font-semibold">{item.titulo}</h3>
            <p className="text-base text-muted-foreground first-letter:uppercase">{quando}</p>
          </div>
        </>
      )}
      {semCabecalho && (
        <p className="text-sm font-bold text-brand">
          Você está na escala{complemento ? ` · ${complemento}` : ''}
        </p>
      )}

      {p.presenca === 'presente' ? (
        <Status tom="ok">
          <b>
            {p.presenca_em ? `Presença marcada às ${horaBr(p.presenca_em)}.` : 'Presença marcada.'}
          </b>
        </Status>
      ) : p.pode_checkin && !leitura ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="touch"
            className="h-14 w-full text-lg font-bold"
            disabled={enviando}
            onClick={() => (p.modo_presenca === 'qr' ? setQr(true) : void chegueiPeloApp())}
          >
            <Check className="size-6" aria-hidden /> Cheguei
          </Button>
          {janela && <p className="text-sm text-muted-foreground">O botão vale {janela}.</p>}
        </div>
      ) : null}

      {p.presenca === 'ausente' && (
        <Status tom={p.justificativa ? 'warn' : 'bad'}>
          <b>{p.justificativa ? 'Ausência com motivo.' : 'A casa registrou sua ausência.'}</b>
          {p.justificativa && <span className="block">Motivo: {p.justificativa}</span>}
        </Status>
      )}
      {p.pode_justificar && !leitura && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="w-full font-bold"
          onClick={() => setMotivo(true)}
        >
          <MessageSquareText aria-hidden />
          {p.justificativa ? 'Mudar o motivo' : 'Conte o motivo'}
          {prazo ? ` (${prazo})` : ''}
        </Button>
      )}

      {p.presenca === 'nao_registrada' && mostraResposta && !perguntar && p.resposta === 'vou' && (
        <Status tom="ok">
          <b>Você confirmou: Vou.</b>
          {p.modo_presenca === 'confianca' && p.controla_presenca && (
            <span className="block text-sm">Na casa, sua confirmação já vale como presença.</span>
          )}
          {p.pode_responder && !leitura && (
            <button
              type="button"
              className="mt-1 block font-bold underline underline-offset-4"
              onClick={() => setMudando(true)}
            >
              Mudar resposta
            </button>
          )}
        </Status>
      )}
      {p.presenca === 'nao_registrada' &&
        mostraResposta &&
        !perguntar &&
        p.resposta === 'nao_vou' && (
          <Status tom="warn">
            <b>Você avisou que não vai.</b>
            {p.justificativa && <span className="block">Motivo: {p.justificativa}</span>}
            {p.pode_responder && !leitura && (
              <button
                type="button"
                className="mt-1 block font-bold underline underline-offset-4"
                onClick={() => setMudando(true)}
              >
                Mudar resposta
              </button>
            )}
          </Status>
        )}
      {perguntar && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              size="touch"
              className="font-bold"
              disabled={enviando}
              onClick={() => void vou()}
            >
              <Check aria-hidden /> Vou
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="font-bold"
              disabled={enviando}
              onClick={() => setNaoVou(true)}
            >
              <X aria-hidden /> Não vou
            </Button>
          </div>
          {!compacto && (
            <p className="text-sm text-muted-foreground">
              Você pode mudar a resposta até a hora de começar.
            </p>
          )}
          {compacto && (
            <p className="text-sm text-muted-foreground">
              Responda até {quandoBr(p.responder_ate)}.
            </p>
          )}
        </div>
      )}

      {compacto && (
        <Link
          href={detalheHref(item)}
          className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Ver detalhes <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}

      <MotivoSheet
        open={naoVou}
        onOpenChange={setNaoVou}
        titulo={`Não vou · ${nomeCurto}`}
        descricao={quando}
        obrigatorio={p.exige_justificativa}
        botao="Avisar a casa"
        onEnviar={async (texto) => {
          atualizar(await responder(item, 'nao_vou', texto));
          showSuccess('A casa foi avisada. Obrigado por avisar.');
        }}
      />
      <MotivoSheet
        open={motivo}
        onOpenChange={setMotivo}
        titulo="Por que você não foi?"
        descricao={`${nomeCurto} · ${quando}`}
        obrigatorio
        botao="Enviar para a casa"
        onEnviar={async (texto) => {
          atualizar(await contarMotivo(item, texto));
          showSuccess('Motivo enviado para a casa.');
        }}
      />
      <ChegueiSheet
        open={qr}
        onOpenChange={setQr}
        titulo={nomeCurto}
        onCodigo={async (codigo) => {
          atualizar(await cheguei(item, codigo));
          showSuccess('Presença marcada. Bom trabalho!');
        }}
      />
    </article>
  );
}
