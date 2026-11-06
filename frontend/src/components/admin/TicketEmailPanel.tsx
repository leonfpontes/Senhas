/**
 * TicketEmailPanel — rastreio do e-mail de uma senha (status no provedor, reenvio e prévia).
 * Conteúdo da página /admin/tickets/[ticketId]/email, reutilizado no Sheet de detalhes da
 * tela de Senhas.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api_client';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export interface EmailStatus {
  ticket_id: string;
  ticket_numero: number;
  consulente_nome?: string;
  consulente_email?: string;
  ticket_status: string;
  email_sent_at?: string;
  email_provider?: string;
  resend_id?: string;
  resend_status?: string;
  resend_html?: string;
  resend_subject?: string;
  resend_created_at?: string;
}

type Tone = 'success' | 'error' | 'warning' | 'info' | 'default';

const RESEND_STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  delivered: { label: 'Entregue', tone: 'success' },
  opened: { label: 'Aberto', tone: 'success' },
  clicked: { label: 'Link clicado', tone: 'success' },
  sent: { label: 'Enviado', tone: 'info' },
  delivery_delayed: { label: 'Atraso na entrega', tone: 'warning' },
  bounced: { label: 'Não entregue (bounce)', tone: 'error' },
  complained: { label: 'Marcado como spam', tone: 'error' },
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  emitted: 'Emitida',
  called: 'Chamada',
  completed: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'Não veio',
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success/15 text-success-strong border-success/30',
  error: 'bg-destructive/15 text-destructive-strong border-destructive/30',
  warning: 'bg-warning/20 text-warning-strong border-warning/40',
  info: 'bg-info/15 text-info-strong border-info/30',
  default: '',
};

export function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[tone])}>
      {children}
    </Badge>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {typeof value === 'string' || typeof value === 'number' ? <span className="min-w-0 text-right break-all">{value}</span> : value}
    </div>
  );
}

export interface TicketEmailPanelProps {
  ticketId: string;
  /** Prévia do HTML do e-mail (iframe). Desligue em contextos estreitos. */
  showPreview?: boolean;
  /**
   * `pagina` (J2 v2 · 07): o rastreio à esquerda, em lista de detalhes, e o e-mail como o consulente
   * vê à direita. `compacto` (padrão) é o do Sheet de detalhes da tela de Senhas.
   */
  layout?: 'compacto' | 'pagina';
  /** Volta à lista de senhas (só no layout `pagina`). */
  onVoltar?: () => void;
  className?: string;
}

export function TicketEmailPanel({
  ticketId,
  showPreview = true,
  layout = 'compacto',
  onVoltar,
  className,
}: TicketEmailPanelProps) {
  const [data, setData] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<EmailStatus>(`/api/v1/admin/tickets/${ticketId}/email-status`);
      setData(res.data);
    } catch {
      toast.error('Erro ao carregar o status do e-mail.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (ticketId) fetchStatus();
  }, [ticketId, fetchStatus]);

  const handleResend = async () => {
    setResending(true);
    try {
      await apiClient.post(`/api/v1/admin/tickets/${ticketId}/resend-email`);
      toast.success('E-mail reenviado!');
      // Dá tempo do worker processar antes de recarregar
      setTimeout(() => fetchStatus(), 3500);
    } catch {
      toast.error('Erro ao reenviar o e-mail.');
    } finally {
      setResending(false);
    }
  };

  if (loading && !data) {
    return (
      <div className={cn('flex min-h-40 items-center justify-center', className)} role="status" aria-label="Carregando">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!data) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertDescription>Senha não encontrada.</AlertDescription>
      </Alert>
    );
  }

  const numero = String(data.ticket_numero).padStart(4, '0');
  const resendInfo = data.resend_status
    ? (RESEND_STATUS_MAP[data.resend_status] ?? { label: data.resend_status, tone: 'default' as Tone })
    : null;
  const sentAt = data.email_sent_at
    ? new Date(data.email_sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  if (layout === 'pagina') {
    // Só o que o produto registra do envio: quando saiu, por qual provedor e, no Resend, o último
    // evento de entrega e o assunto. Nada de etapa estimada (design ético).
    const provedor =
      data.email_provider === 'resend' ? 'Resend' : data.email_provider === 'brevo' ? 'Brevo' : data.email_provider;
    const linhas: [string, React.ReactNode][] = [
      ['Para', data.consulente_email ?? '—'],
      ...(sentAt ? ([['Enviado em', sentAt]] as [string, React.ReactNode][]) : []),
      ...(data.email_sent_at && data.email_provider !== 'failed' && provedor
        ? ([['Provedor', provedor]] as [string, React.ReactNode][])
        : []),
      ...(data.email_provider === 'resend'
        ? ([
            [
              'Entrega',
              resendInfo ? (
                <ToneBadge tone={resendInfo.tone}>{resendInfo.label}</ToneBadge>
              ) : (
                <span className="font-normal text-muted-foreground">Aguardando o provedor</span>
              ),
            ],
            ...(data.resend_subject ? [['Assunto', data.resend_subject]] : []),
          ] as [string, React.ReactNode][])
        : []),
    ];
    return (
      <div className={cn('grid gap-8 lg:grid-cols-2', className)} data-testid="ticket-email-panel">
        <section aria-labelledby="email-titulo" className="flex flex-col gap-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {['Senhas', numero, data.consulente_nome].filter(Boolean).join(' · ')}
            </p>
            <h1
              id="email-titulo"
              className="mt-2 font-display text-[2.75rem] leading-[1.05] font-normal tracking-[-0.03em] text-foreground"
            >
              A senha chega por <em className="text-[color:var(--color-barro-600)]">e-mail.</em>
            </h1>
            <p className="mt-3 max-w-md text-base text-muted-foreground">
              Quem pega a senha recebe o bilhete na hora, com o recado da gira. Aqui a casa vê se o e-mail chegou.
            </p>
          </div>

          <dl className="m-0 border-b border-border" data-testid="email-rastreio">
            {linhas.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-t border-border py-3">
                <dt className="text-[0.9375rem] text-muted-foreground">{k}</dt>
                <dd className="m-0 min-w-0 text-right text-[0.9375rem] font-semibold break-all">{v}</dd>
              </div>
            ))}
          </dl>

          {!data.consulente_email ? (
            <Alert variant="warning">
              <AlertDescription>Consulente sem e-mail cadastrado.</AlertDescription>
            </Alert>
          ) : !data.email_sent_at ? (
            <Alert variant="info">
              <AlertDescription>Nenhum e-mail enviado para esta senha.</AlertDescription>
            </Alert>
          ) : data.email_provider === 'failed' ? (
            <Alert variant="destructive">
              <AlertDescription>Falha no envio: os dois provedores retornaram erro. Reenvie para tentar de novo.</AlertDescription>
            </Alert>
          ) : data.email_provider === 'brevo' ? (
            <p className="text-sm text-muted-foreground">Enviado pelo Brevo: esse provedor não devolve o rastreio da entrega.</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {data.consulente_email && (
              <Button type="button" variant="outline" className="h-11 px-4 text-[0.9375rem] font-semibold" onClick={handleResend} disabled={resending}>
                {resending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {resending ? 'Reenviando…' : 'Reenviar o e-mail'}
                {!resending && <Mail aria-hidden />}
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="size-11" onClick={fetchStatus} disabled={loading} aria-label="Atualizar status">
              <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden />
            </Button>
            {onVoltar && (
              <Button type="button" variant="ghost" className="h-11 text-[0.9375rem] font-semibold" onClick={onVoltar}>
                Voltar para Senhas
              </Button>
            )}
          </div>
        </section>

        <section aria-label="O e-mail como o consulente vê" className="rounded-2xl bg-muted p-6 sm:p-8">
          {showPreview && data.resend_html ? (
            <iframe
              srcDoc={data.resend_html}
              title="Prévia do e-mail enviado"
              className="mx-auto block min-h-[640px] w-full max-w-[480px] rounded-lg border bg-card shadow-sm"
              sandbox="allow-same-origin"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              A prévia aparece aqui quando o provedor devolve o e-mail enviado (só no Resend).
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)} data-testid="ticket-email-panel">
      <Card className="py-4">
        <CardContent className="px-4">
          <p className="mb-1 text-sm font-semibold text-foreground">Senha</p>
          <InfoRow label="Número" value={<span className="font-mono font-semibold">{numero}</span>} />
          <Separator />
          <InfoRow label="Consulente" value={data.consulente_nome ?? '—'} />
          <Separator />
          <InfoRow label="E-mail" value={data.consulente_email ?? '—'} />
          <Separator />
          <InfoRow
            label="Situação"
            value={
              <ToneBadge tone={data.ticket_status === 'completed' ? 'success' : 'default'}>
                {TICKET_STATUS_LABELS[data.ticket_status] ?? data.ticket_status}
              </ToneBadge>
            }
          />
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">E-mail</p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={fetchStatus} disabled={loading} aria-label="Atualizar status">
                <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden />
              </Button>
              {data.consulente_email && (
                <Button type="button" size="sm" onClick={handleResend} disabled={resending}>
                  <Send aria-hidden /> {resending ? 'Reenviando…' : 'Reenviar'}
                </Button>
              )}
            </div>
          </div>

          {!data.consulente_email ? (
            <Alert variant="warning">
              <AlertDescription>Consulente sem e-mail cadastrado.</AlertDescription>
            </Alert>
          ) : !data.email_sent_at ? (
            <Alert variant="info">
              <AlertDescription>Nenhum e-mail enviado para esta senha.</AlertDescription>
            </Alert>
          ) : data.email_provider === 'failed' ? (
            <Alert variant="destructive">
              <AlertDescription>
                Falha no envio — os dois provedores retornaram erro. Clique em &quot;Reenviar&quot; para tentar de novo.
              </AlertDescription>
            </Alert>
          ) : (
            <div>
              <InfoRow label="Enviado em" value={sentAt ?? '—'} />
              <Separator />
              <InfoRow
                label="Provedor"
                value={
                  <Badge variant="outline">
                    {data.email_provider === 'resend' ? 'Resend' : data.email_provider === 'brevo' ? 'Brevo' : (data.email_provider ?? '—')}
                  </Badge>
                }
              />
              {data.email_provider === 'resend' && (
                <>
                  <Separator />
                  <InfoRow
                    label="Entrega"
                    value={
                      resendInfo ? (
                        <ToneBadge tone={resendInfo.tone}>{resendInfo.label}</ToneBadge>
                      ) : (
                        <span className="text-muted-foreground">Aguardando evento…</span>
                      )
                    }
                  />
                  {data.resend_subject && (
                    <>
                      <Separator />
                      <InfoRow label="Assunto" value={data.resend_subject} />
                    </>
                  )}
                </>
              )}
              {data.email_provider === 'brevo' && (
                <Alert variant="info" className="mt-3">
                  <AlertDescription>Enviado via Brevo — rastreio detalhado indisponível.</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showPreview && data.resend_html && (
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Como o consulente vê</p>
            <iframe
              srcDoc={data.resend_html}
              title="Prévia do e-mail enviado"
              className="block min-h-[520px] w-full rounded-md border"
              sandbox="allow-same-origin"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TicketEmailPanel;
