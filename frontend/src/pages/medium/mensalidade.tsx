/**
 * /medium/mensalidade — "Pague sua mensalidade aqui" (AM-11) e comprovante (AM-12).
 *
 * Cartão do mês (valor em Fraunces, situação, vencimento) com UMA ação principal por situação:
 * em aberto/atrasada → "Pagar com PIX" (+ "Já paguei: enviar comprovante"); aguardando a casa →
 * aviso; não confirmado → motivo + "Enviar outro comprovante" + "Falar com a casa"; paga; isento.
 * Casa sem chave PIX → "Combine o pagamento com a casa" + WhatsApp da casa. Depois: meses em
 * aberto, "Quer pagar todo mês sem lembrar?" (Pix Agendado Recorrente) e meses anteriores.
 *
 * Baixa automática (F-02/AM-22): quando a casa conectou Stripe/Mercado Pago
 * (`cobranca_automatica`), "Pagar com PIX" abre o `PagarAutomaticoSheet` (cobrança dinâmica na
 * conta da casa, "Paga" sozinha pelo webhook) e o boleto aparece se a casa tiver; o comprovante
 * fica só como "Já paguei de outro jeito". Sem gateway, nada muda.
 *
 * Só chama `/api/v1/medium/mensalidades*` (e o `/medium/me` do MediumProvider). `?pagar=1`
 * (botão do Início) abre direto o "Pagar com PIX" do mês. 403 (módulo desligado pela casa ou
 * fora do plano) → aviso neutro, sem oferta de plano.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { CircleCheck, Clock, MessageCircle, TriangleAlert, Upload, Wallet } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { diaMesCurto, nomeDoMes, primeiroNome, valorBr } from '@/components/medium/format';
import { PagarPixSheet } from '@/components/medium/mensalidade/PagarPixSheet';
import { PagarAutomaticoSheet } from '@/components/medium/mensalidade/PagarAutomaticoSheet';
import { EnviarComprovanteSheet } from '@/components/medium/mensalidade/EnviarComprovanteSheet';
import { Passo } from '@/components/medium/mensalidade/MediumSheet';
import {
  EM_ABERTO,
  PILL,
  whatsappDaCasa,
  type CobrancaAutomaticaInfo,
  type MensalidadesResponse,
  type MesMensalidade,
  type MetodoCobranca,
} from '@/components/medium/mensalidade/tipos';
import { EmptyState } from '@/components/EmptyState';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BR_TIME_ZONE, monthLabelLong } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

const SECTION_TITLE = 'text-xs font-extrabold tracking-[0.16em] text-brand uppercase';
const CARD =
  'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm';
const STATUS_BOX = 'flex items-start gap-2.5 rounded-xl p-3 text-base';

type Estado = 'carregando' | 'ok' | 'erro' | 'indisponivel';

/** "2026-10-10" → "sábado, 10/10". */
function vencimentoBr(isoDate: string): string {
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIME_ZONE, weekday: 'long' })
    .format(new Date(`${isoDate.slice(0, 10)}T12:00:00-03:00`))
    .replace('-feira', '');
  return `${semana}, ${diaMesCurto(isoDate)}`;
}

/** "às 14h05 de 12/10". */
function quandoEnviado(iso: string): string {
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const dia = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(d);
  return `${dia} às ${hora.replace(':', 'h')}`;
}

function Pill({ mes }: { mes: MesMensalidade }) {
  const p = PILL[mes.status];
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold', p.className)}>
      {p.label}
    </span>
  );
}

function linhaVencimento(mes: MesMensalidade): string | null {
  if (mes.status === 'paga')
    return mes.data_pagamento ? `Paga em ${diaMesCurto(mes.data_pagamento)}` : 'Paga';
  if (!mes.vencimento) return null;
  return mes.status === 'atrasada'
    ? `Venceu em ${diaMesCurto(mes.vencimento)}`
    : `Vence ${vencimentoBr(mes.vencimento)}`;
}

export default function MediumMensalidadePage() {
  return (
    <MediumLayout title="Mensalidade">
      <Mensalidade />
    </MediumLayout>
  );
}

function Mensalidade() {
  const router = useRouter();
  const { me } = useMedium();
  const [data, setData] = useState<MensalidadesResponse | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nonce, setNonce] = useState(0);
  const [foco, setFoco] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'pagar' | 'comprovante' | 'automatico' | null>(null);
  const [metodoAuto, setMetodoAuto] = useState<MetodoCobranca>('pix');
  const [abriuDoInicio, setAbriuDoInicio] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<MensalidadesResponse>('/api/v1/medium/mensalidades')
      .then((res) => {
        if (!vivo) return;
        setData(res.data);
        setEstado('ok');
      })
      .catch((err: { status?: number }) => {
        if (!vivo) return;
        setEstado(err?.status === 403 || err?.status === 402 ? 'indisponivel' : 'erro');
      });
    return () => {
      vivo = false;
    };
  }, [nonce]);

  const recarregar = useCallback(() => setNonce((n) => n + 1), []);

  const meses = useMemo(() => data?.meses ?? [], [data]);
  const cartao = useMemo(
    () => meses.find((m) => m.mes === foco) ?? meses.find((m) => m.atual) ?? meses[0] ?? null,
    [meses, foco],
  );
  const emAberto = meses.filter(
    (m) => m !== cartao && (EM_ABERTO.has(m.status) || m.status === 'em_conferencia'),
  );
  const anteriores = meses.filter(
    (m) => m !== cartao && (m.status === 'paga' || m.status === 'isento'),
  );
  const temPix = Boolean(data?.pix);
  const auto = data?.cobranca_automatica ?? null;
  const pagarAutomatico = useCallback((metodo: MetodoCobranca) => {
    setMetodoAuto(metodo);
    setSheet('automatico');
  }, []);
  // "Pagar com PIX": cobrança automática quando a casa tem (PIX liberado), senão o PIX da chave.
  const pagarComPix = useCallback(() => {
    if (auto?.pix) pagarAutomatico('pix');
    else setSheet('pagar');
  }, [auto, pagarAutomatico]);
  const nome = primeiroNome(me?.nome);
  const whatsapp = whatsappDaCasa(
    me?.whatsapp_casa,
    cartao
      ? `Olá! ${nome ? `Aqui é ${nome}. ` : ''}Quero falar sobre a minha mensalidade de ${nomeDoMes(cartao.mes)}.`
      : undefined,
  );

  // Botão "Pagar com PIX" do Início: abre o sheet do mês uma vez e limpa o ?pagar=1.
  useEffect(() => {
    if (abriuDoInicio || estado !== 'ok' || router.query?.pagar !== '1') return;
    setAbriuDoInicio(true);
    if (cartao && EM_ABERTO.has(cartao.status) && (temPix || auto?.pix)) pagarComPix();
    void router.replace('/medium/mensalidade', undefined, { shallow: true });
  }, [abriuDoInicio, estado, router, cartao, temPix, auto, pagarComPix]);

  const abrirMes = (m: MesMensalidade) => {
    setFoco(m.mes);
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const aoEnviar = (atualizado: MesMensalidade) => {
    setData((d) =>
      d
        ? {
            ...d,
            meses: d.meses.map((m) => (m.mes === atualizado.mes ? { ...m, ...atualizado } : m)),
          }
        : d,
    );
    recarregar();
  };

  if (estado === 'carregando') return <Esqueleto />;
  if (estado === 'indisponivel') {
    return (
      <EmptyState
        className="flex-1 px-4"
        icon={<Wallet />}
        title="Mensalidade indisponível"
        description={
          <span className="text-base">
            A mensalidade não aparece na Área agora. Fale com a direção da casa.
          </span>
        }
      />
    );
  }
  if (estado === 'erro' || !data) {
    return (
      <EmptyState
        className="flex-1 px-4"
        icon={<TriangleAlert />}
        title="Não conseguimos carregar a mensalidade"
        description="Confira a internet e tente de novo."
        action={
          <Button type="button" size="touch" className="font-bold" onClick={recarregar}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
        <h1 className="font-display text-[1.9rem] leading-tight font-bold">Mensalidade</h1>

        {!cartao ? (
          <EmptyState
            icon={<Wallet />}
            title="Nenhuma mensalidade por aqui"
            description="Quando a casa definir a mensalidade, ela aparece aqui."
          />
        ) : (
          <CartaoDoMes
            mes={cartao}
            isento={data.isento}
            temPix={temPix}
            auto={auto}
            whatsapp={whatsapp}
            onPagar={pagarComPix}
            onBoleto={() => pagarAutomatico('boleto')}
            onComprovante={() => setSheet('comprovante')}
          />
        )}

        {emAberto.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="titulo-em-aberto">
            <h2 id="titulo-em-aberto" className={SECTION_TITLE}>
              Meses em aberto
            </h2>
            <ul className="flex flex-col gap-2">
              {emAberto.map((m) => (
                <li key={m.mes}>
                  <button
                    type="button"
                    onClick={() => abrirMes(m)}
                    className={cn(
                      CARD,
                      'min-h-16 w-full flex-row items-center text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="text-base first-letter:uppercase">
                        {monthLabelLong(m.mes)}
                      </strong>
                      <span className="text-sm text-muted-foreground">
                        {valorBr(m.valor)}
                        {linhaVencimento(m) ? ` · ${linhaVencimento(m)}` : ''}
                      </span>
                    </span>
                    <Pill mes={m} />
                    <span className="text-sm font-bold text-brand">Abrir</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {temPix && !auto && !data.isento && data.pix && (
          <Accordion
            type="single"
            collapsible
            className="rounded-2xl border border-border bg-card px-4"
          >
            <AccordionItem value="recorrente">
              <AccordionTrigger className="min-h-12 items-center text-base font-bold">
                Quer pagar todo mês sem lembrar?
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3 text-base">
                <p>
                  Você pode agendar um PIX que se repete todo mês no app do seu banco (
                  <strong>Pix Agendado Recorrente</strong>). Todos os bancos oferecem.
                </p>
                <ol className="flex flex-col gap-3">
                  <Passo n={1}>
                    <span>
                      No app do banco, entre em <strong>PIX</strong> e escolha{' '}
                      <strong>Agendar</strong> ou <strong>Programar</strong>.
                    </span>
                  </Passo>
                  <Passo n={2}>
                    <span>
                      Use a chave da casa: <strong className="break-all">{data.pix.chave}</strong>
                      {data.valor_mensal ? (
                        <>
                          , valor <strong>{valorBr(data.valor_mensal)}</strong>
                        </>
                      ) : null}
                      {data.dia_vencimento ? (
                        <>
                          , todo dia <strong>{data.dia_vencimento}</strong>
                        </>
                      ) : null}
                      .
                    </span>
                  </Passo>
                  <Passo n={3}>
                    <span>
                      Escolha <strong>Repetir todo mês</strong> e confirme.
                    </span>
                  </Passo>
                </ol>
                <p className="text-sm text-muted-foreground">
                  Se a casa mudar o valor, ajuste o agendamento no banco. Continue enviando o
                  comprovante aqui todo mês.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {anteriores.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="titulo-anteriores">
            <h2 id="titulo-anteriores" className={SECTION_TITLE}>
              Meses anteriores
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
              {anteriores.map((m) => (
                <li key={m.mes} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-base first-letter:uppercase">
                      {monthLabelLong(m.mes)}
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      {m.status === 'isento' ? 'Isento' : valorBr(m.valor)}
                      {m.status === 'paga' && m.data_pagamento
                        ? ` · paga em ${diaMesCurto(m.data_pagamento)}`
                        : ''}
                    </span>
                  </span>
                  <Pill mes={m} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <PagarPixSheet
        open={sheet === 'pagar'}
        onOpenChange={(v) => setSheet(v ? 'pagar' : null)}
        mes={cartao}
        terreiroNome={me?.terreiro.nome}
        logoUrl={me?.marca.logo_url}
        whatsapp={whatsapp}
        onEnviarComprovante={() => setSheet('comprovante')}
      />
      <PagarAutomaticoSheet
        open={sheet === 'automatico'}
        onOpenChange={(v) => setSheet(v ? 'automatico' : null)}
        mes={cartao}
        metodo={metodoAuto}
        terreiroNome={me?.terreiro.nome}
        logoUrl={me?.marca.logo_url}
        whatsapp={whatsapp}
        onPaga={recarregar}
      />
      <EnviarComprovanteSheet
        open={sheet === 'comprovante'}
        onOpenChange={(v) => setSheet(v ? 'comprovante' : null)}
        mes={cartao}
        onEnviado={aoEnviar}
      />
    </>
  );
}

function CartaoDoMes({
  mes,
  isento,
  temPix,
  auto,
  whatsapp,
  onPagar,
  onBoleto,
  onComprovante,
}: {
  mes: MesMensalidade;
  isento: boolean;
  temPix: boolean;
  auto: CobrancaAutomaticaInfo | null;
  whatsapp: string | null;
  onPagar: () => void;
  onBoleto: () => void;
  onComprovante: () => void;
}) {
  const falar = whatsapp ? (
    <Button asChild variant="outline" size="touch" className="w-full font-bold">
      <a href={whatsapp} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden /> Falar com a casa
      </a>
    </Button>
  ) : null;

  if (mes.status === 'isento' && (isento || mes.atual)) {
    return (
      <article className={CARD} data-testid="cartao-mensalidade">
        <div className={cn(STATUS_BOX, 'bg-success/10 text-success-strong')}>
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong>
              {isento
                ? 'Você é isento de mensalidade.'
                : `Você está isento em ${nomeDoMes(mes.mes)}.`}
            </strong>
            <br />
            Não precisa pagar nada. Qualquer dúvida, fale com a casa.
          </span>
        </div>
      </article>
    );
  }

  const venc = linhaVencimento(mes);
  return (
    <article className={CARD} data-testid="cartao-mensalidade">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold tracking-wide text-brand uppercase">
          {monthLabelLong(mes.mes)}
        </span>
        <Pill mes={mes} />
      </div>
      <span
        className="font-display text-[2.6rem] leading-none font-bold tabular-nums"
        data-testid="valor-mes"
      >
        {valorBr(mes.valor)}
      </span>
      {venc && <p className="text-base text-muted-foreground">{venc}</p>}

      {EM_ABERTO.has(mes.status) &&
        mes.status !== 'nao_confirmada' &&
        (auto && (auto.pix || auto.boleto) ? (
          <>
            {auto.pix && (
              <Button type="button" size="touch" className="w-full font-bold" onClick={onPagar}>
                Pagar com PIX
              </Button>
            )}
            {auto.boleto && (
              <Button
                type="button"
                variant={auto.pix ? 'outline' : 'default'}
                size="touch"
                className="w-full font-bold"
                onClick={onBoleto}
              >
                Pagar com boleto
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              A mensalidade aparece como paga sozinha, sem comprovante.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 self-start font-bold text-brand"
              onClick={onComprovante}
            >
              Já paguei de outro jeito: enviar comprovante
            </Button>
          </>
        ) : temPix ? (
          <>
            <Button type="button" size="touch" className="w-full font-bold" onClick={onPagar}>
              Pagar com PIX
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full font-bold"
              onClick={onComprovante}
            >
              <Upload aria-hidden /> Já paguei: enviar comprovante
            </Button>
          </>
        ) : (
          <>
            <div className={cn(STATUS_BOX, 'bg-muted')}>
              <Wallet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <strong>Combine o pagamento com a casa.</strong>
                <br />A casa ainda não cadastrou a chave PIX aqui.
              </span>
            </div>
            {whatsapp && (
              <Button asChild size="touch" className="w-full font-bold">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden /> Falar com a casa
                </a>
              </Button>
            )}
            <Button
              type="button"
              variant={whatsapp ? 'outline' : 'default'}
              size="touch"
              className="w-full font-bold"
              onClick={onComprovante}
            >
              <Upload aria-hidden /> Já paguei: enviar comprovante
            </Button>
          </>
        ))}

      {mes.status === 'em_conferencia' && (
        <>
          <div className={cn(STATUS_BOX, 'bg-info/10 text-info-strong')} role="status">
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <strong>Aguardando a casa confirmar.</strong>
              <br />
              {mes.comprovante_enviado_em
                ? `Comprovante enviado em ${quandoEnviado(mes.comprovante_enviado_em)}. `
                : 'Comprovante enviado. '}
              A casa confere e confirma.
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 self-start font-bold text-brand"
            onClick={onComprovante}
          >
            Enviar outro comprovante
          </Button>
        </>
      )}

      {mes.status === 'nao_confirmada' && (
        <>
          <div className={cn(STATUS_BOX, 'bg-destructive/10 text-destructive-strong')} role="alert">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <strong>A casa não confirmou seu comprovante.</strong>
              <br />
              Motivo: {mes.recusa_motivo || 'a casa não informou.'}
            </span>
          </div>
          <Button type="button" size="touch" className="w-full font-bold" onClick={onComprovante}>
            <Upload aria-hidden /> Enviar outro comprovante
          </Button>
          {(temPix || auto?.pix) && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full font-bold"
              onClick={onPagar}
            >
              Pagar com PIX
            </Button>
          )}
          {falar}
        </>
      )}

      {mes.status === 'paga' && (
        <div className={cn(STATUS_BOX, 'bg-success/10 text-success-strong')}>
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            {mes.pago_automatico ? (
              <>
                <strong>Paga.</strong> Recebemos seu pagamento automaticamente. Obrigado!
              </>
            ) : (
              <>
                <strong>Paga.</strong> A casa confirmou seu pagamento. Obrigado!
              </>
            )}
          </span>
        </div>
      )}

      {mes.status === 'isento' && (
        <div className={cn(STATUS_BOX, 'bg-muted')}>
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>Você está isento neste mês.</span>
        </div>
      )}
    </article>
  );
}

function Esqueleto() {
  return (
    <div
      className="flex flex-col gap-4 px-4 pt-5"
      role="status"
      aria-label="Carregando a mensalidade"
    >
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}
