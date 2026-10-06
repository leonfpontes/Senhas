/**
 * Página pública de status do sistema — girahub.com.br/status
 *
 * Mostra saúde em tempo real de cada componente e histórico de 90 dias, em linguagem
 * leiga ("Emissão de senhas: funcionando"). Quando a verificação falha, diz que não
 * conseguiu verificar — nunca assume "tudo operacional". Não requer autenticação.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleHelp, Ticket, TriangleAlert } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const POLLING_MS = 60_000;

type StatusKey = 'operational' | 'degraded' | 'outage' | 'unknown';

/** Rótulo leigo por status (completa a frase "Emissão de senhas: …"). */
export const STATUS_LABEL: Record<StatusKey, string> = {
  operational: 'funcionando',
  degraded: 'com lentidão',
  outage: 'fora do ar',
  unknown: 'sem dados',
};

const STATUS_BAR_CLASS: Record<StatusKey, string> = {
  operational: 'bg-success',
  degraded: 'bg-warning',
  outage: 'bg-destructive',
  unknown: 'bg-muted-foreground/30',
};

const STATUS_BADGE_CLASS: Record<StatusKey, string> = {
  operational: 'bg-success/15 text-success-strong',
  degraded: 'bg-warning/15 text-warning-strong',
  outage: 'bg-destructive/15 text-destructive-strong',
  unknown: 'bg-muted text-muted-foreground',
};

/** Nome leigo para os componentes que o backend reporta (system_status.py). */
const COMPONENT_LABEL: Record<string, { name: string; description: string }> = {
  API: { name: 'Painel e site', description: 'Login, painel do terreiro e páginas públicas' },
  'Banco de Dados': { name: 'Armazenamento de dados', description: 'Onde ficam as senhas, giras e cadastros' },
  'Emissão de Senhas': { name: 'Emissão de senhas', description: 'Pegar senha pelo link do terreiro e reenvio por e-mail' },
};

function asStatus(s: string): StatusKey {
  return s === 'operational' || s === 'degraded' || s === 'outage' ? s : 'unknown';
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface HistoryEntry {
  date: string;
  status: string;
}

interface Component {
  name: string;
  description: string;
  status: string;
  latency_ms?: number | null;
  uptime_30d: number;
  uptime_90d: number;
  history: HistoryEntry[];
}

interface StatusData {
  overall: string;
  components: Component[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<StatusKey, React.ReactNode> = {
  operational: <CircleCheck />,
  degraded: <TriangleAlert />,
  outage: <CircleAlert />,
  unknown: <CircleHelp />,
};

function StatusBadge({ status }: { status: StatusKey }) {
  return (
    <Badge variant="secondary" className={cn('gap-1 text-sm font-semibold capitalize', STATUS_BADGE_CLASS[status])}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
}

/** Barra de um dia do histórico — Popover (funciona no toque) no lugar de tooltip. */
function HistoryBar({ entry }: { entry: HistoryEntry }) {
  const status = asStatus(entry.status);
  const label = `${formatDay(entry.date)}: ${STATUS_LABEL[status]}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'h-7 min-w-[3px] flex-1 rounded-[2px] transition-opacity hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            STATUS_BAR_CLASS[status],
          )}
        />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto px-3 py-2 text-sm">
        {label}
      </PopoverContent>
    </Popover>
  );
}

function ComponentCard({ component }: { component: Component }) {
  const status = asStatus(component.status);
  const label = COMPONENT_LABEL[component.name] ?? { name: component.name, description: component.description };
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              {label.name}: <span className="font-semibold">{STATUS_LABEL[status]}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {label.description}
              {component.latency_ms != null && (
                <>
                  {' '}· responde em <strong>{component.latency_ms} ms</strong>
                </>
              )}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="flex gap-[2px]" aria-label="Histórico dos últimos 90 dias">
          {component.history.map((entry) => (
            <HistoryBar key={entry.date} entry={entry} />
          ))}
        </div>

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>90 dias atrás</span>
          <span className="font-semibold">{component.uptime_30d}% no ar (30 dias)</span>
          <span>Hoje</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

const OVERALL_TITLE: Record<StatusKey, string> = {
  operational: 'Tudo funcionando',
  degraded: 'Parte do sistema está lenta',
  outage: 'Parte do sistema está fora do ar',
  unknown: 'Não foi possível verificar',
};

const OVERALL_VARIANT: Record<StatusKey, 'success' | 'warning' | 'destructive'> = {
  operational: 'success',
  degraded: 'warning',
  outage: 'destructive',
  unknown: 'warning',
};

const StatusPage: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get<StatusData>('/api/v1/platform/status');
      setData(res.data);
      setFetchFailed(false);
    } catch {
      // Mantém os dados anteriores (se houver), mas registra que a verificação falhou.
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const timer = setInterval(fetchStatus, POLLING_MS);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const overall: StatusKey = data ? asStatus(data.overall) : 'unknown';
  const verifyFailed = fetchFailed && !data;

  return (
    <>
      <Head>
        <title>Status — GiraHub</title>
        <meta name="description" content="Status dos serviços do GiraHub" />
      </Head>

      <div data-slot="status-page" className="min-h-screen bg-background text-base text-foreground">
        {/* Navbar mínima */}
        <header className="border-b">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-foreground no-underline">
              <Ticket aria-hidden className="size-6 text-brand" />
              GiraHub
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Voltar ao site
            </Link>
          </div>
        </header>

        <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Status dos serviços</h1>

          {loading ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
              <p className="text-center text-sm text-muted-foreground">Verificando os serviços…</p>
            </div>
          ) : (
            <>
              {/* Banner geral */}
              <Alert variant={OVERALL_VARIANT[verifyFailed ? 'unknown' : overall]} className="items-center [&>svg]:size-6">
                {STATUS_ICON[verifyFailed ? 'unknown' : overall]}
                <AlertTitle className="text-base">{OVERALL_TITLE[verifyFailed ? 'unknown' : overall]}</AlertTitle>
                <AlertDescription>
                  {verifyFailed ? (
                    <>
                      <p>Não conseguimos consultar o status agora. Isso pode ser um problema na sua conexão ou no próprio sistema.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => { setLoading(true); fetchStatus(); }}>
                        Tentar de novo
                      </Button>
                    </>
                  ) : (
                    data && (
                      <p>
                        Verificado em{' '}
                        {new Date(data.generated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        {fetchFailed && ' — a atualização mais recente falhou; mostrando a última verificação.'}
                      </p>
                    )
                  )}
                </AlertDescription>
              </Alert>

              {!verifyFailed && (
                <>
                  {/* Legenda de cores */}
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Legenda">
                    {(['operational', 'degraded', 'outage', 'unknown'] as const).map((s) => (
                      <li key={s} className="flex items-center gap-1.5">
                        <span aria-hidden className={cn('inline-block size-3 rounded-[2px]', STATUS_BAR_CLASS[s])} />
                        {STATUS_LABEL[s]}
                      </li>
                    ))}
                  </ul>

                  {/* Componentes */}
                  <div className="flex flex-col gap-3">
                    {(data?.components ?? []).map((component) => (
                      <ComponentCard key={component.name} component={component} />
                    ))}
                  </div>
                </>
              )}

              <Separator />

              <p className="text-center text-sm text-muted-foreground">GiraHub · Histórico dos últimos 90 dias</p>
            </>
          )}
        </main>
      </div>
    </>
  );
};

export default StatusPage;
