/**
 * /platform/observatory — Observatório (J14 v2 · 19, 20 e 21; decisão do Leonardo, 04/11/2026).
 *
 * A reescrita de 06/10/2026 juntou o Observatório no "Hoje" e deixou de mostrar parte dele. Ele volta como página
 * própria no menu, logo depois de Hoje: quatro números (MRR em risco, giras e cursos que vêm aí, terreiros ativos),
 * as próximas giras e os próximos cursos de todos os terreiros, com a ocupação (80% ou mais em destaque), e as
 * funcionalidades mais usadas por terreiro, que abrem. Só dado do servidor: GET /api/v1/platform/tenant-observatory
 * (o mesmo que o Hoje já usa). O link antigo `#retencao` continua levando à coluna "Contatar" do Hoje.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, RefreshCw, Telescope } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { cn } from '@/lib/utils';
import PlatformLayout from './layout';
import { PageHeader } from '@/components/admin/PageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtMoney, plural } from '@/components/platform/format';

export interface ProximaGira {
  id: string;
  nome: string;
  data_inicio: string;
  max_tickets: number | null;
  tickets_emitidos: number;
  ocupacao_pct: number | null;
  tenant_id: string;
  tenant_name: string;
}

export interface ProximoCurso {
  id: string;
  titulo: string;
  data_inicio: string;
  max_participantes: number | null;
  inscritos: number;
  ocupacao_pct: number | null;
  tenant_id: string;
  tenant_name: string;
}

export interface FuncionalidadesDoTerreiro {
  tenant_id: string;
  tenant_name: string;
  total_acoes: number;
  features: { resource_type: string; label: string; uso: number }[];
}

export interface DadosDoObservatorio {
  retention_summary: { mrr_at_risk: number; total_at_risk: number };
  upcoming_giras: ProximaGira[];
  upcoming_cursos: ProximoCurso[];
  top_features_by_tenant: FuncionalidadesDoTerreiro[];
}

/** Ocupação alta: a régua do Observatório antigo (80% ou mais). */
export const OCUPACAO_ALTA = 80;

function SeloDeOcupacao({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="text-sm text-muted-foreground" title="Sem limite de vagas">
        —<span className="sr-only">sem limite</span>
      </span>
    );
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent tabular-nums', pct >= OCUPACAO_ALTA ? 'bg-warning/20 text-warning-strong' : 'bg-muted text-muted-foreground')}
    >
      {Math.round(pct)}%
    </Badge>
  );
}

function NomeECasa({ nome, casaId, casa }: { nome: string; casaId: string; casa: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{nome}</span>
      <Link href={`/platform/tenants/${casaId}`} className="truncate text-xs text-muted-foreground hover:underline">
        {casa}
      </Link>
    </span>
  );
}

/** "qua 05/11 · 19h" (J14 v2 · 19), no fuso de São Paulo. */
export function quandoCurto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const min = v('minute');
  return `${v('weekday').replace('.', '')} ${v('day')}/${v('month')} · ${Number(v('hour'))}h${min === '00' ? '' : min}`;
}

const vagas = (feitas: number, max: number | null) => (max ? `${feitas} de ${max}` : String(feitas));

const COLUNAS_GIRAS: ColumnDef<ProximaGira>[] = [
  { accessorKey: 'nome', header: 'Gira', enableSorting: false, meta: { cellClassName: 'max-w-56' }, cell: ({ row }) => <NomeECasa nome={row.original.nome} casaId={row.original.tenant_id} casa={row.original.tenant_name} /> },
  { accessorKey: 'data_inicio', header: 'Quando', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{quandoCurto(getValue<string>())}</span> },
  { id: 'senhas', header: 'Senhas', enableSorting: false, cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{vagas(row.original.tickets_emitidos, row.original.max_tickets)}</span> },
  { accessorKey: 'ocupacao_pct', header: 'Ocupação', enableSorting: false, cell: ({ row }) => <SeloDeOcupacao pct={row.original.ocupacao_pct} /> },
];

const COLUNAS_CURSOS: ColumnDef<ProximoCurso>[] = [
  { accessorKey: 'titulo', header: 'Curso', enableSorting: false, meta: { cellClassName: 'max-w-56' }, cell: ({ row }) => <NomeECasa nome={row.original.titulo} casaId={row.original.tenant_id} casa={row.original.tenant_name} /> },
  { accessorKey: 'data_inicio', header: 'Quando', enableSorting: false, meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{quandoCurto(getValue<string>())}</span> },
  { id: 'inscritos', header: 'Inscritos', enableSorting: false, cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{vagas(row.original.inscritos, row.original.max_participantes)}</span> },
  { accessorKey: 'ocupacao_pct', header: 'Ocupação', enableSorting: false, cell: ({ row }) => <SeloDeOcupacao pct={row.original.ocupacao_pct} /> },
];

/** O cartão do celular (DataTable em modo cartão, J14 v2 · 21). */
function cartao(nome: string, casa: string, quando: string, contagem: string, pct: number | null) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{nome}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {casa} · {quando}
          </span>
        </span>
        <SeloDeOcupacao pct={pct} />
      </div>
      <span className="text-sm font-semibold text-muted-foreground tabular-nums">{contagem}</span>
    </div>
  );
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div>
        <h2 id={id} className="text-base font-bold">
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

function Funcionalidades({ itens }: { itens: FuncionalidadesDoTerreiro[] }) {
  const [aberto, setAberto] = useState<string | null>(itens[0]?.tenant_id ?? null);
  return (
    <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border bg-card p-0">
      {itens.map((t) => {
        const open = aberto === t.tenant_id;
        const maior = Math.max(1, ...t.features.map((f) => f.uso));
        return (
          <li key={t.tenant_id} className="border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`uso-${t.tenant_id}`}
              onClick={() => setAberto(open ? null : t.tenant_id)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="min-w-0 truncate font-medium">{t.tenant_name}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums">
                {plural(t.total_acoes, 'ação', 'ações')}
                <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
              </span>
            </button>
            {open && (
              <ul id={`uso-${t.tenant_id}`} className="m-0 flex list-none flex-col gap-2 px-4 pt-1 pb-4">
                {t.features.map((f) => (
                  <li key={f.resource_type} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_3rem]">
                    <span className="truncate">{f.label}</span>
                    <span aria-hidden className="h-2 rounded-full bg-muted">
                      <span className="block h-2 rounded-full bg-primary" style={{ width: `${(f.uso / maior) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold text-muted-foreground tabular-nums">{f.uso}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function PlatformObservatoryPage() {
  const router = useRouter();
  const [data, setData] = useState<DadosDoObservatorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  // Link antigo do Observatório para a retenção: a lista de quem contatar mora no Hoje.
  useEffect(() => {
    if (router.isReady && typeof window !== 'undefined' && window.location.hash === '#retencao') router.replace('/platform#contatar');
  }, [router]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(false);
    try {
      const res = await apiClient.get<DadosDoObservatorio>('/api/v1/platform/tenant-observatory');
      setData(res.data);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const giras = data?.upcoming_giras ?? [];
  const cursos = data?.upcoming_cursos ?? [];
  const features = data?.top_features_by_tenant ?? [];
  const altas = giras.filter((g) => g.ocupacao_pct !== null && g.ocupacao_pct >= OCUPACAO_ALTA).length;
  const inscritos = cursos.reduce((s, c) => s + c.inscritos, 0);
  const vazio = !loading && !erro && data !== null && giras.length === 0 && cursos.length === 0 && features.length === 0;

  return (
    <PlatformLayout title="Observatório">
      <PageHeader
        title="Observatório"
        subtitle="O que acontece em todos os terreiros: o que vem aí e o que mais se usa."
        actions={
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={loading}>
            Atualizar <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        }
      />

      {erro && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Não deu para carregar o Observatório agora.
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="MRR em risco"
          value={fmtMoney(data?.retention_summary.mrr_at_risk ?? 0)}
          subtitle={`Soma dos ${plural(data?.retention_summary.total_at_risk ?? 0, 'terreiro')} em risco`}
          loading={loading}
        />
        <KpiCard label="Giras (próx. 30 dias)" value={giras.length} subtitle={`${altas} com ocupação alta`} loading={loading} />
        <KpiCard label="Cursos (próx. 60 dias)" value={cursos.length} subtitle={`${plural(inscritos, 'inscrito')} no total`} loading={loading} />
        <KpiCard label="Terreiros ativos (30 dias)" value={features.length} subtitle="Com alguma ação no painel" loading={loading} />
      </div>

      {vazio ? (
        <EmptyState
          icon={<Telescope />}
          title="Nada para observar ainda"
          description="Quando os terreiros marcarem giras e cursos e usarem o painel, eles aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <Secao id="obs-giras" titulo="Próximas giras" descricao="Próximos 30 dias, todos os terreiros. 80% ou mais de ocupação aparece em destaque.">
              <DataTable
                className="min-[640px]:rounded-xl min-[640px]:border min-[640px]:bg-card"
                data-testid="obs-giras"
                columns={COLUNAS_GIRAS}
                data={giras}
                getRowId={(g) => g.id}
                loading={loading}
                skeletonRows={4}
                pageSize={8}
                emptyMessage="Nenhuma gira nos próximos 30 dias."
                renderCard={(g) => cartao(g.nome, g.tenant_name, quandoCurto(g.data_inicio), vagas(g.tickets_emitidos, g.max_tickets), g.ocupacao_pct)}
              />
            </Secao>
            <Secao id="obs-cursos" titulo="Próximos cursos" descricao="Próximos 60 dias, todos os terreiros.">
              <DataTable
                className="min-[640px]:rounded-xl min-[640px]:border min-[640px]:bg-card"
                data-testid="obs-cursos"
                columns={COLUNAS_CURSOS}
                data={cursos}
                getRowId={(c) => c.id}
                loading={loading}
                skeletonRows={3}
                pageSize={8}
                emptyMessage="Nenhum curso nos próximos 60 dias."
                renderCard={(c) => cartao(c.titulo, c.tenant_name, quandoCurto(c.data_inicio), vagas(c.inscritos, c.max_participantes), c.ocupacao_pct)}
              />
            </Secao>
          </div>
          <Secao id="obs-features" titulo="Funcionalidades mais usadas por terreiro" descricao="Últimos 30 dias. Toque no terreiro para ver o uso de cada recurso.">
            {loading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : features.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ação registrada nos últimos 30 dias.</p>
            ) : (
              <Funcionalidades itens={features} />
            )}
          </Secao>
        </div>
      )}
    </PlatformLayout>
  );
}
