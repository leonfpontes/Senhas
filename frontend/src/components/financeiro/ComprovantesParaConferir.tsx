/**
 * Comprovantes de mensalidade enviados pelos médiuns na Área (AM-12 + pagamento parcial, 092).
 *
 * - `ComprovantesParaConferir`: KPI "Comprovantes para conferir" + lista (cada comprovante em
 *   conferência, de todos os meses, o mais antigo primeiro) de
 *   `GET /api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir`, com o valor do mês,
 *   o que falta e o valor que o médium disse ter pago.
 * - `ConferirComprovanteSheet`: o mês do médium (`GET .../{mediun_id}/{mes}/comprovantes`):
 *   valor, recebido, falta ou pago a mais, e o histórico de TODOS os comprovantes com o status.
 *   Para o comprovante em conferência escolhido (arquivo por `.../comprovantes/{id}/arquivo`):
 *     · "Conferir" com o valor que entrou (já vem o valor informado pelo médium ou o que falta;
 *       atalho "Valor total") = `PATCH .../comprovantes/{id}/conferir` — "recebi só uma parte" é
 *       o mesmo gesto com um valor menor; o mês vira pago sozinho quando completa;
 *     · "Não confirmar" com motivo (comprovante errado/ilegível) =
 *       `PATCH .../comprovantes/{id}/nao-confirmar` — o médium vê o motivo e envia outro.
 *   Os dois exigem FINANCEIRO:edit; sem ele os botões ficam ocultos (não desabilitados).
 *
 * A tela de Mensalidades só monta isto com `can('area_medium')` (piloto) — sem a Área a tela
 * continua exatamente como antes.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, Inbox, Loader2, X } from 'lucide-react';
import { KpiCard } from '@/components/admin/KpiCard';
import { MoneyInput } from '@/components/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { formatBRL, formatDateTimeBr, monthLabelLong } from '@/lib/dateBr';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { baixarComprovante } from './comprovante';

/** Um item da fila (`comprovantes-para-conferir`). */
export interface ComprovanteNaFila {
  comprovante_id: string;
  pagamento_id: string;
  mediun_id: string;
  mediun_nome: string;
  mes: string; // AAAA-MM
  valor?: number | null;
  valor_recebido?: number;
  falta?: number | null;
  valor_informado?: number | null;
  mes_status?: string;
  comprovante_enviado_em?: string | null;
  comprovante_filename?: string | null;
  comprovante_mime?: string | null;
}

/** O que a conferência precisa para abrir (da fila ou da linha da tabela do mês). */
export interface ComprovanteAlvo {
  mediun_id: string;
  mediun_nome: string;
  mes: string; // AAAA-MM
  valor?: number | null;
  /** Comprovante a abrir; sem ele, o primeiro em conferência do mês. */
  comprovante_id?: string | null;
}

export interface ComprovanteDoMes {
  id: string;
  origem: 'medium' | 'painel';
  enviado_em: string;
  arquivo_filename: string;
  arquivo_mime: string;
  arquivo_tamanho: number;
  valor_informado?: number | null;
  status: 'em_conferencia' | 'conferido' | 'nao_confirmado';
  valor_conferido?: number | null;
  conferido_em?: string | null;
  motivo?: string | null;
}

/** `GET/PATCH` do mês do médium (saldo + histórico). */
export interface HistoricoMes {
  mediun_id: string;
  mediun_nome: string;
  mes: string;
  pagamento_id?: string | null;
  status?: 'PENDENTE' | 'PAGO' | 'ISENTO' | null;
  valor_mensalidade?: number | null;
  valor_recebido: number;
  recebido_automatico: number;
  falta?: number | null;
  pago_a_mais: number;
  valor_pago?: number | null;
  comprovantes: ComprovanteDoMes[];
}

export const MOTIVOS_RAPIDOS = [
  'Não dá para ler o comprovante.',
  'O comprovante é de outro mês.',
  'O comprovante não mostra o valor pago.',
  'O pagamento não apareceu na conta da casa.',
];

const BASE = '/api/v1/admin/financeiro/mensalidades';
const FILA_URL = `${BASE}/comprovantes-para-conferir`;
const historicoUrl = (a: ComprovanteAlvo) => `${BASE}/${a.mediun_id}/${a.mes}/comprovantes`;
const arquivoUrl = (id: string) => `${BASE}/comprovantes/${id}/arquivo`;

const STATUS_COMPROVANTE: Record<ComprovanteDoMes['status'], { label: string; className: string }> =
  {
    em_conferencia: { label: 'Em conferência', className: 'bg-info/15 text-info-strong' },
    conferido: { label: 'Conferido', className: 'bg-success/15 text-success-strong' },
    nao_confirmado: {
      label: 'Não confirmado',
      className: 'bg-destructive/15 text-destructive-strong',
    },
  };

const primeiroNome = (nome: string) => nome.split(' ')[0];

// ─── Fila + KPI ───────────────────────────────────────────────────────────────

export interface ComprovantesParaConferirProps {
  /** Busca só com a Área do Médium no plano E FINANCEIRO:view. */
  enabled: boolean;
  /** Muda para recarregar (ex.: depois de registrar um pagamento na tabela). */
  refreshKey?: number;
  onConferir: (alvo: ComprovanteAlvo) => void;
}

export function ComprovantesParaConferir({
  enabled,
  refreshKey = 0,
  onConferir,
}: ComprovantesParaConferirProps) {
  const [itens, setItens] = useState<ComprovanteNaFila[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let vivo = true;
    apiClient
      .get<ComprovanteNaFila[]>(FILA_URL)
      .then((res) => vivo && setItens(res.data))
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [enabled, refreshKey]);

  if (!enabled) return null;
  const n = itens?.length ?? 0;

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="Comprovantes enviados pelos médiuns"
      data-testid="comprovantes-conferir"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Comprovantes para conferir"
          value={itens ? n : '—'}
          loading={itens === null}
          color={n > 0 ? 'var(--info)' : 'var(--success)'}
          icon={<Inbox />}
          subtitle="Enviados pelos médiuns na Área"
        />
      </div>
      {n > 0 && (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {itens!.map((c) => {
              const parcial = (c.valor_recebido ?? 0) > 0;
              return (
                <div key={c.comprovante_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{c.mediun_nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {monthLabelLong(c.mes)} ·{' '}
                      {parcial && c.falta !== null && c.falta !== undefined
                        ? `falta ${formatBRL(c.falta)} de ${formatBRL(c.valor)}`
                        : formatBRL(c.valor)}
                      {c.valor_informado ? ` · informou ${formatBRL(c.valor_informado)}` : ''} ·
                      enviado em {formatDateTimeBr(c.comprovante_enviado_em)}
                    </span>
                  </div>
                  <Badge className="border-transparent bg-info/15 text-info-strong">
                    {parcial ? 'Pagamento parcial' : 'Comprovante enviado'}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      onConferir({
                        mediun_id: c.mediun_id,
                        mediun_nome: c.mediun_nome,
                        mes: c.mes,
                        valor: c.valor,
                        comprovante_id: c.comprovante_id,
                      })
                    }
                    aria-label={`Conferir comprovante de ${c.mediun_nome}`}
                  >
                    Conferir
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ─── Sheet de conferência ─────────────────────────────────────────────────────

export interface ConferirComprovanteSheetProps {
  alvo: ComprovanteAlvo | null;
  onClose: () => void;
  /** FINANCEIRO:edit — conferir e não confirmar. */
  canEdit: boolean;
  onDone: () => void;
}

/** Valor sugerido para conferir: o que o médium informou ou o que falta (nunca mais que isso sem ele dizer). */
function valorSugerido(h: HistoricoMes | null, c: ComprovanteDoMes | null): number {
  if (c?.valor_informado) return c.valor_informado;
  if (h?.falta && h.falta > 0) return h.falta;
  return h?.valor_mensalidade ?? 0;
}

export function ConferirComprovanteSheet({
  alvo,
  onClose,
  canEdit,
  onDone,
}: ConferirComprovanteSheetProps) {
  const { showSuccess, showError } = useSnackbar();
  const [historico, setHistorico] = useState<HistoricoMes | null>(null);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState(0);
  const [salvando, setSalvando] = useState<'conferir' | 'recusar' | null>(null);

  // Mês do médium (saldo + histórico).
  useEffect(() => {
    setHistorico(null);
    setErroHistorico(false);
    setSelecionado(null);
    setRecusando(false);
    setMotivo('');
    if (!alvo) return;
    let vivo = true;
    apiClient
      .get<HistoricoMes>(historicoUrl(alvo))
      .then((res) => {
        if (!vivo) return;
        const h = res.data;
        setHistorico(h);
        const inicial =
          h.comprovantes.find((c) => c.id === alvo.comprovante_id) ??
          h.comprovantes.find((c) => c.status === 'em_conferencia') ??
          h.comprovantes[h.comprovantes.length - 1] ??
          null;
        setSelecionado(inicial?.id ?? null);
      })
      .catch(() => vivo && setErroHistorico(true));
    return () => {
      vivo = false;
    };
  }, [alvo]);

  const atual = useMemo(
    () => historico?.comprovantes.find((c) => c.id === selecionado) ?? null,
    [historico, selecionado],
  );

  useEffect(() => {
    setValor(valorSugerido(historico, atual));
    setRecusando(false);
    setMotivo('');
  }, [historico, atual]);

  // Arquivo do comprovante escolhido.
  useEffect(() => {
    setErroArquivo(false);
    setBlobUrl(null);
    setMime(null);
    if (!selecionado) return;
    let vivo = true;
    let url: string | null = null;
    apiClient
      .get(arquivoUrl(selecionado), { responseType: 'blob' })
      .then((res) => {
        if (!vivo) return;
        const blob = res.data as Blob;
        setMime(blob.type || null);
        if (typeof URL.createObjectURL === 'function') {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      })
      .catch(() => vivo && setErroArquivo(true));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selecionado]);

  const conferir = useCallback(async () => {
    if (!alvo || !atual || valor <= 0) return;
    setSalvando('conferir');
    try {
      const res = await apiClient.patch<HistoricoMes>(`${BASE}/comprovantes/${atual.id}/conferir`, {
        valor,
      });
      const h = res.data;
      const nome = primeiroNome(alvo.mediun_nome);
      if (h?.status === 'PAGO') {
        showSuccess(
          h.pago_a_mais > 0
            ? `Mensalidade de ${nome} paga (pago a mais ${formatBRL(h.pago_a_mais)}) e lançada em contas a receber.`
            : `Mensalidade de ${nome} paga e lançada em contas a receber.`,
        );
      } else {
        showSuccess(
          `Recebido ${formatBRL(valor)}. ${nome} ainda deve ${formatBRL(h?.falta ?? 0)} — ela vê isso na Área.`,
        );
      }
      onDone();
      onClose();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível conferir o comprovante.'));
    } finally {
      setSalvando(null);
    }
  }, [alvo, atual, valor, showSuccess, showError, onDone, onClose]);

  const recusar = useCallback(async () => {
    if (!alvo || !atual || motivo.trim().length < 3) return;
    setSalvando('recusar');
    try {
      await apiClient.patch(`${BASE}/comprovantes/${atual.id}/nao-confirmar`, {
        motivo: motivo.trim(),
      });
      showSuccess(
        `${primeiroNome(alvo.mediun_nome)} vai ver o motivo na Área e pode enviar outro comprovante.`,
      );
      onDone();
      onClose();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível avisar o médium.'));
    } finally {
      setSalvando(null);
    }
  }, [alvo, atual, motivo, showSuccess, showError, onDone, onClose]);

  const ehImagem = (mime ?? atual?.arquivo_mime ?? '').startsWith('image/');
  const emConferencia = atual?.status === 'em_conferencia';
  const falta = historico?.falta ?? null;

  return (
    <Sheet open={Boolean(alvo)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-[480px]"
        data-testid="sheet-conferir-comprovante"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{alvo ? alvo.mediun_nome : 'Comprovante'}</SheetTitle>
          <SheetDescription>
            {alvo ? <>Mensalidade de {monthLabelLong(alvo.mes)}</> : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {erroHistorico && (
            <p
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
              role="alert"
            >
              Não foi possível carregar os comprovantes deste mês.
            </p>
          )}
          {historico && (
            <dl
              className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm"
              data-testid="saldo-do-mes"
            >
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Mensalidade</dt>
                <dd className="font-semibold tabular-nums">
                  {formatBRL(historico.valor_mensalidade)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Recebido</dt>
                <dd className="font-semibold tabular-nums">
                  {formatBRL(historico.valor_recebido)}
                </dd>
              </div>
              <div className="flex flex-col">
                {historico.pago_a_mais > 0 ? (
                  <>
                    <dt className="text-xs text-muted-foreground">Pago a mais</dt>
                    <dd className="font-semibold text-info-strong tabular-nums">
                      {formatBRL(historico.pago_a_mais)}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-xs text-muted-foreground">Falta</dt>
                    <dd
                      className={cn(
                        'font-semibold tabular-nums',
                        (falta ?? 0) > 0 ? 'text-warning-strong' : 'text-success-strong',
                      )}
                    >
                      {formatBRL(falta ?? 0)}
                    </dd>
                  </>
                )}
              </div>
              {historico.recebido_automatico > 0 && (
                <p className="col-span-3 text-xs text-muted-foreground">
                  {formatBRL(historico.recebido_automatico)} pelo PIX automático.
                </p>
              )}
            </dl>
          )}

          {atual && (
            <p className="text-sm text-muted-foreground">
              {atual.origem === 'painel' ? 'Anexado pela casa' : 'Enviado pelo médium'} em{' '}
              {formatDateTimeBr(atual.enviado_em)}
              {atual.valor_informado ? ` · diz ter pago ${formatBRL(atual.valor_informado)}` : ''}
            </p>
          )}
          {!selecionado ? null : erroArquivo ? (
            <p
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
              role="alert"
            >
              Não foi possível abrir o comprovante.
            </p>
          ) : !blobUrl ? (
            <div
              className="flex h-48 items-center justify-center rounded-md bg-muted"
              role="status"
              aria-label="Carregando o comprovante"
            >
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : ehImagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob autenticado
            <img
              src={blobUrl}
              alt={`Comprovante enviado por ${alvo?.mediun_nome ?? 'médium'}`}
              className="max-h-[50vh] w-full rounded-md border border-border object-contain"
            />
          ) : (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border p-3 text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              <FileText className="size-5" aria-hidden /> Abrir o PDF do comprovante
            </a>
          )}
          {atual && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                void baixarComprovante(arquivoUrl(atual.id), atual.arquivo_filename).catch(() =>
                  showError('Comprovante não encontrado.'),
                )
              }
            >
              <Download /> Baixar comprovante
            </Button>
          )}

          {canEdit && emConferencia && !recusando && (
            <div
              className="flex flex-col gap-2 rounded-md border border-border p-3"
              data-testid="conferir-valor"
            >
              <MoneyInput
                label="Quanto entrou na conta da casa"
                value={valor}
                onChange={setValor}
                helperText="Recebeu só uma parte? Coloque o valor que entrou — o médium vê quanto falta."
              />
              {falta !== null && falta > 0 && valor !== falta && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setValor(falta)}
                >
                  Valor total ({formatBRL(falta)})
                </Button>
              )}
            </div>
          )}

          {recusando && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium" id="motivo-label">
                Por que não vai confirmar?
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="motivo-label">
                {MOTIVOS_RAPIDOS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={motivo === m ? 'default' : 'outline'}
                    aria-pressed={motivo === m}
                    onClick={() => setMotivo(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
              <Textarea
                aria-labelledby="motivo-label"
                placeholder="O médium vê esta mensagem."
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          )}

          {historico && historico.comprovantes.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="historico-label">
              <h3 id="historico-label" className="text-sm font-semibold">
                Comprovantes deste mês
              </h3>
              <ul
                className="flex flex-col divide-y divide-border rounded-md border border-border"
                data-testid="historico-comprovantes"
              >
                {historico.comprovantes.map((c) => {
                  const st = STATUS_COMPROVANTE[c.status];
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelecionado(c.id)}
                        aria-current={c.id === selecionado ? 'true' : undefined}
                        className={cn(
                          'flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-muted/60',
                          c.id === selecionado && 'bg-muted',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{formatDateTimeBr(c.enviado_em)}</span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-semibold',
                              st.className,
                            )}
                          >
                            {st.label}
                            {c.status === 'conferido' && c.valor_conferido
                              ? ` ${formatBRL(c.valor_conferido)}`
                              : ''}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.origem === 'painel' ? 'Anexado pela casa' : 'Enviado pelo médium'}
                          {c.valor_informado ? ` · informou ${formatBRL(c.valor_informado)}` : ''}
                          {c.status === 'nao_confirmado' && c.motivo ? ` · ${c.motivo}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          {!canEdit ? (
            <p className="text-sm text-muted-foreground">
              Só quem pode editar o financeiro confere ou recusa comprovantes.
            </p>
          ) : !emConferencia ? (
            <p className="text-sm text-muted-foreground">
              {atual
                ? 'Este comprovante já foi conferido.'
                : 'Nenhum comprovante esperando conferência.'}
            </p>
          ) : recusando ? (
            <>
              <Button
                type="button"
                onClick={() => void recusar()}
                disabled={motivo.trim().length < 3 || salvando !== null}
              >
                {salvando === 'recusar' && <Loader2 className="animate-spin" aria-hidden />}
                Avisar o médium
              </Button>
              <Button type="button" variant="outline" onClick={() => setRecusando(false)}>
                Voltar
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => void conferir()}
                disabled={salvando !== null || valor <= 0}
              >
                {salvando === 'conferir' ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Check />
                )}
                Conferir {formatBRL(valor)}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setRecusando(true)}
                disabled={salvando !== null}
              >
                <X /> Não confirmar
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ComprovantesParaConferir;
