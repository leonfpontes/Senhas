/**
 * Comprovantes de mensalidade enviados pelos médiuns na Área (AM-12, jornada J12).
 *
 * - `ComprovantesParaConferir`: KPI "Comprovantes para conferir" + lista (todos os meses, o mais
 *   antigo primeiro) de `GET /api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir`.
 * - `ConferirComprovanteSheet`: mostra o comprovante (rota de download que já existia), o valor
 *   esperado e as ações:
 *     · "Confirmar pagamento" = o POST de registro de sempre com status PAGO (FINANCEIRO:insert)
 *       → o mês vira pago e espelha em contas a receber;
 *     · "Não confirmar" com motivo (atalhos + texto) = `PATCH .../{mediun_id}/{mes}/recusa`
 *       (FINANCEIRO:edit) → o médium vê o motivo na Área e pode reenviar.
 *   Botões sem permissão ficam ocultos (não desabilitados).
 *
 * A tela de Mensalidades só monta isto com `can('area_medium')` (piloto) — sem a Área a tela
 * continua exatamente como antes.
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, FileText, Inbox, Loader2, X } from 'lucide-react';
import { KpiCard } from '@/components/admin/KpiCard';
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
import { formatBRL, formatDateTimeBr, monthLabelLong, todayBr } from '@/lib/dateBr';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { baixarComprovante, montarFormPagamento, MULTIPART } from './comprovante';

export interface ComprovanteAlvo {
  mediun_id: string;
  mediun_nome: string;
  mes: string; // AAAA-MM
  valor?: number | null;
  comprovante_enviado_em?: string | null;
  comprovante_filename?: string | null;
  comprovante_mime?: string | null;
}

export const MOTIVOS_RAPIDOS = [
  'O valor é diferente da mensalidade.',
  'Não dá para ler o comprovante.',
  'O comprovante é de outro mês.',
  'O pagamento não apareceu na conta da casa.',
];

const FILA_URL = '/api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir';
const comprovanteUrl = (a: ComprovanteAlvo) =>
  `/api/v1/admin/financeiro/mensalidades/${a.mediun_id}/${a.mes}/comprovante`;

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
  const [itens, setItens] = useState<ComprovanteAlvo[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let vivo = true;
    apiClient
      .get<ComprovanteAlvo[]>(FILA_URL)
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
            {itens!.map((c) => (
              <div
                key={`${c.mediun_id}-${c.mes}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{c.mediun_nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {monthLabelLong(c.mes)} · {formatBRL(c.valor)} · enviado em{' '}
                    {formatDateTimeBr(c.comprovante_enviado_em)}
                  </span>
                </div>
                <Badge className="border-transparent bg-info/15 text-info-strong">
                  Comprovante enviado
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onConferir(c)}
                  aria-label={`Conferir comprovante de ${c.mediun_nome}`}
                >
                  Conferir
                </Button>
              </div>
            ))}
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
  canInsert: boolean;
  canEdit: boolean;
  /** Valor esperado quando o alvo não traz (ex.: valor da configuração). */
  valorPadrao?: number | null;
  onDone: () => void;
}

/** Data do envio no fuso de Brasília ("AAAA-MM-DD"), usada como data do pagamento confirmado. */
function dataDoEnvio(iso?: string | null): string {
  if (!iso) return todayBr();
  return todayBr(new Date(iso));
}

export function ConferirComprovanteSheet({
  alvo,
  onClose,
  canInsert,
  canEdit,
  valorPadrao,
  onDone,
}: ConferirComprovanteSheetProps) {
  const { showSuccess, showError } = useSnackbar();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState<'confirmar' | 'recusar' | null>(null);

  useEffect(() => {
    setRecusando(false);
    setMotivo('');
    setErroArquivo(false);
    setBlobUrl(null);
    setMime(null);
    if (!alvo) return;
    let vivo = true;
    let url: string | null = null;
    apiClient
      .get(comprovanteUrl(alvo), { responseType: 'blob' })
      .then((res) => {
        if (!vivo) return;
        const blob = res.data as Blob;
        setMime(blob.type || alvo.comprovante_mime || null);
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
  }, [alvo]);

  const valor = alvo?.valor ?? valorPadrao ?? null;

  const confirmar = useCallback(async () => {
    if (!alvo) return;
    setSalvando('confirmar');
    try {
      await apiClient.post(
        `/api/v1/admin/financeiro/mensalidades/${alvo.mediun_id}/${alvo.mes}`,
        montarFormPagamento({
          status: 'PAGO',
          valor_pago: valor,
          data_pagamento: dataDoEnvio(alvo.comprovante_enviado_em),
        }),
        MULTIPART,
      );
      showSuccess(
        `Pagamento de ${alvo.mediun_nome.split(' ')[0]} confirmado e lançado em contas a receber.`,
      );
      onDone();
      onClose();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível confirmar o pagamento.'));
    } finally {
      setSalvando(null);
    }
  }, [alvo, valor, showSuccess, showError, onDone, onClose]);

  const recusar = useCallback(async () => {
    if (!alvo || motivo.trim().length < 3) return;
    setSalvando('recusar');
    try {
      await apiClient.patch(
        `/api/v1/admin/financeiro/mensalidades/${alvo.mediun_id}/${alvo.mes}/recusa`,
        {
          motivo: motivo.trim(),
        },
      );
      showSuccess(
        `${alvo.mediun_nome.split(' ')[0]} vai ver o motivo na Área e pode enviar outro comprovante.`,
      );
      onDone();
      onClose();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível avisar o médium.'));
    } finally {
      setSalvando(null);
    }
  }, [alvo, motivo, showSuccess, showError, onDone, onClose]);

  const ehImagem = (mime ?? alvo?.comprovante_mime ?? '').startsWith('image/');

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
            {alvo ? (
              <>
                Mensalidade de {monthLabelLong(alvo.mes)} · esperado{' '}
                <strong>{formatBRL(valor)}</strong>
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {alvo && (
            <p className="text-sm text-muted-foreground">
              Enviado pelo médium em {formatDateTimeBr(alvo.comprovante_enviado_em)}
            </p>
          )}
          {erroArquivo ? (
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
          {alvo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                void baixarComprovante(comprovanteUrl(alvo), alvo.comprovante_filename).catch(() =>
                  showError('Comprovante não encontrado.'),
                )
              }
            >
              <Download /> Baixar comprovante
            </Button>
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
        </div>

        <SheetFooter className="border-t border-border">
          {recusando ? (
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
              {canInsert && (
                <Button type="button" onClick={() => void confirmar()} disabled={salvando !== null}>
                  {salvando === 'confirmar' ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Check />
                  )}
                  Confirmar pagamento
                </Button>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setRecusando(true)}
                  disabled={salvando !== null}
                >
                  <X /> Não confirmar
                </Button>
              )}
              {!canInsert && !canEdit && (
                <p className="text-sm text-muted-foreground">
                  Só quem pode registrar pagamentos confirma ou recusa comprovantes.
                </p>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ComprovantesParaConferir;
