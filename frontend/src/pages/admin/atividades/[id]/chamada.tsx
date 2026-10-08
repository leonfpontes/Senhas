/**
 * /admin/atividades/[id]/chamada — chamada da corrente (AM-17/AM-28; protótipo J14 "adm-chamada").
 *
 * Lista quem está na escala (esperados "todos os elegíveis" + escalados + quem já respondeu) com a
 * resposta (Vou / Não vou / sem resposta / marcou "Cheguei"), busca por nome e Presente/Ausente
 * (tocar de novo desfaz). Ações: "Marcar todos os confirmados como presentes", "Adicionar quem
 * veio" (avulso) e "Encerrar chamada" (quem ficou sem marcação vira ausente; no modo confiança,
 * quem confirmou "Vou" vira presente). Depois de encerrada, tocar ainda corrige (fica quem mudou).
 * Modo QR: painel com o QR do dia (muda a cada minuto) e "Mostrar em tela cheia" para a TV ou o
 * celular virado para a corrente.
 *
 * Gates: Área liberada (`area_medium`) e presença no plano (`atividades_corrente`, senão
 * `PlanLocked`); grupo `escalas:edit` ou, na gira, `porta:edit` (o servidor confere — atividade
 * interna sem `escalas:edit` → `PermissionDenied`). O motivo das faltas só aparece com
 * `escalas:view` (`ver_justificativa`), nunca para quem chegou só pela Porta (§6.8).
 * Backend: `api/v1/admin/atividades_presenca.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  Lock,
  Maximize2,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import AdminLayout from '../../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { QrPresenca } from '@/components/admin/presenca/QrPresenca';
import { TipoChip } from '@/components/atividades/TipoChip';
import { EmptyState } from '@/components/EmptyState';
import { Combobox } from '@/components/fields';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { minPlanFor } from '@/constants/plans';
import {
  CLASSE_TOM,
  OPCOES_MODO_PRESENCA,
  textoOrigemPresenca,
  type ChamadaResponse,
  type PessoaChamada,
  type Presenca,
} from '@/constants/presenca';
import { formatDateTimeBr } from '@/lib/dateBr';
import { cn } from '@/lib/utils';

const API = '/api/v1/admin/atividades';

export default function AdminChamadaPage() {
  return (
    <AdminLayout title="Chamada">
      <ChamadaGate />
    </AdminLayout>
  );
}

function ChamadaGate() {
  const { can, loading } = useSubscription();
  const { can: canGroup } = usePermissions();
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!can('area_medium')) {
    return (
      <EmptyState
        icon={<ClipboardCheck />}
        title="Chamada"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!can('atividades_corrente')) {
    return (
      <PlanLocked
        feature="Presença da corrente"
        minPlan={minPlanFor('atividades_corrente').label}
      />
    );
  }
  if (!canGroup('escalas', 'edit') && !canGroup('porta', 'edit'))
    return <PermissionDenied className="mt-4" />;
  return <Chamada />;
}

function respostaTexto(p: PessoaChamada): { texto: string; classe: string } {
  if (p.presenca_origem === 'checkin_medium')
    return { texto: 'Marcou “Cheguei”', classe: CLASSE_TOM.ok };
  if (p.resposta === 'vou') return { texto: 'Vou', classe: CLASSE_TOM.ok };
  if (p.resposta === 'nao_vou') return { texto: 'Não vou', classe: CLASSE_TOM.warn };
  return { texto: 'Sem resposta', classe: CLASSE_TOM.muted };
}

function Pessoa({
  p,
  verMotivo,
  podeMarcar,
  ocupado,
  onMarcar,
}: {
  p: PessoaChamada;
  verMotivo: boolean;
  podeMarcar: boolean;
  ocupado: boolean;
  onMarcar: (p: PessoaChamada, presenca: Presenca) => void;
}) {
  const resp = respostaTexto(p);
  const origem = p.presenca !== 'nao_registrada' ? textoOrigemPresenca(p) : null;
  return (
    <li
      className="flex flex-wrap items-start gap-3 border-b px-4 py-3 last:border-b-0"
      data-testid="chamada-pessoa"
      aria-label={p.nome}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="text-base">{p.nome}</strong>
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', resp.classe)}>
            {resp.texto}
          </span>
          {p.origem === 'avulso' && (
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', CLASSE_TOM.brand)}>
              Veio sem estar na escala
            </span>
          )}
          {(p.grupo || p.funcao) && (
            <span className="text-muted-foreground">
              {[p.grupo, p.funcao].filter(Boolean).join(' · ')}
            </span>
          )}
          {p.dispensado && (
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', CLASSE_TOM.muted)}>
              Fora da escala
            </span>
          )}
        </span>
        {verMotivo && p.justificativa ? (
          <span className="text-sm">Motivo: {p.justificativa}</span>
        ) : p.tem_justificativa ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden /> Contou o motivo (só quem cuida das escalas vê)
          </span>
        ) : null}
        {origem && <span className="text-xs text-muted-foreground">{origem}</span>}
      </div>
      {podeMarcar && (
        <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Presença de ${p.nome}`}>
          <Button
            type="button"
            size="sm"
            variant={p.presenca === 'presente' ? 'default' : 'outline'}
            aria-pressed={p.presenca === 'presente'}
            disabled={ocupado}
            onClick={() => onMarcar(p, p.presenca === 'presente' ? 'nao_registrada' : 'presente')}
          >
            <Check aria-hidden /> Presente
          </Button>
          <Button
            type="button"
            size="sm"
            variant={p.presenca === 'ausente' ? 'destructive' : 'outline'}
            aria-pressed={p.presenca === 'ausente'}
            disabled={ocupado}
            onClick={() => onMarcar(p, p.presenca === 'ausente' ? 'nao_registrada' : 'ausente')}
          >
            <X aria-hidden /> Ausente
          </Button>
        </div>
      )}
    </li>
  );
}

function Chamada() {
  const router = useRouter();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const [dados, setDados] = useState<ChamadaResponse | null>(null);
  const [erro, setErro] = useState<'proibido' | 'nao_encontrada' | 'rede' | null>(null);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [avulso, setAvulso] = useState<string | null>(null);
  const [encerrar, setEncerrar] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setErro(null);
    try {
      const res = await apiClient.get<ChamadaResponse>(`${API}/${encodeURIComponent(id)}/chamada`);
      setDados(res.data);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setErro(status === 403 ? 'proibido' : status === 404 ? 'nao_encontrada' : 'rede');
    }
  }, [id]);

  useEffect(() => {
    if (router.isReady) void carregar();
  }, [router.isReady, carregar]);

  const enviar = async (body: Record<string, unknown>, sucesso?: string) => {
    if (!id) return;
    setOcupado(true);
    try {
      const res = await apiClient.put<ChamadaResponse>(
        `${API}/${encodeURIComponent(id)}/chamada`,
        body,
      );
      setDados(res.data);
      if (sucesso) showSuccess(sucesso);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível salvar a chamada. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarEncerrar = async () => {
    if (!id) return;
    setOcupado(true);
    try {
      const res = await apiClient.post<ChamadaResponse>(
        `${API}/${encodeURIComponent(id)}/chamada/encerrar`,
      );
      setDados(res.data);
      showSuccess('Chamada encerrada. Quem ficou sem marcação contou como ausente.');
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível encerrar a chamada.'));
    } finally {
      setOcupado(false);
      setEncerrar(false);
    }
  };

  const pessoas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.pessoas ?? []).filter((p) => !termo || p.nome.toLowerCase().includes(termo));
  }, [dados, busca]);

  const voltar =
    dados?.atividade.origem === 'gira' && !canGroup('escalas', 'view')
      ? {
          href: `/admin/porta?gira=${encodeURIComponent(dados.atividade.ref_id)}`,
          texto: 'Voltar para a Porta',
        }
      : { href: '/admin/atividades', texto: 'Voltar para Atividades e escalas' };

  if (erro === 'proibido') return <PermissionDenied className="mt-4" />;
  if (erro) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title={
          erro === 'nao_encontrada'
            ? 'Atividade não encontrada'
            : 'Não foi possível abrir a chamada'
        }
        description={
          erro === 'nao_encontrada'
            ? 'Ela pode ter sido excluída.'
            : 'Confira a internet e tente de novo.'
        }
        action={
          erro === 'rede' ? (
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (!dados) return <Skeleton className="h-64 w-full" aria-label="Carregando a chamada" />;

  const a = dados.atividade;
  const c = dados.contadores;
  const modo =
    OPCOES_MODO_PRESENCA.find((o) => o.valor === a.modo_presenca)?.rotulo ?? a.modo_presenca;
  const podeMarcar = a.controla_presenca && !a.cancelada;
  const opcoesAvulso = dados.outros_mediuns.map((m) => ({ value: m.id, label: m.nome }));
  const confirmadosSemMarcar = dados.pessoas.filter(
    (p) => p.resposta === 'vou' && p.presenca === 'nao_registrada' && !p.dispensado,
  ).length;
  const qrUrl = `${API}/${encodeURIComponent(a.atividade_id)}/qr`;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={voltar.href}
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> {voltar.texto}
      </Link>

      <header className="flex flex-col gap-2">
        <TipoChip tipo={a.tipo} size="sm" />
        <h1 className="text-2xl font-bold">{a.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTimeBr(a.inicio)}
          {a.local ? ` · ${a.local}` : ''} · Presença: {modo}
        </p>
        {a.chamada_encerrada_em && (
          <p
            className={cn('self-start rounded-md px-3 py-1.5 text-sm font-semibold', CLASSE_TOM.ok)}
            role="status"
          >
            Chamada encerrada em {formatDateTimeBr(a.chamada_encerrada_em)}
            {a.chamada_encerrada_por ? ` por ${a.chamada_encerrada_por}` : ' automaticamente'}.
            Tocar ainda corrige.
          </p>
        )}
        {a.cancelada && (
          <p
            className={cn(
              'self-start rounded-md px-3 py-1.5 text-sm font-semibold',
              CLASSE_TOM.bad,
            )}
          >
            Atividade cancelada.
          </p>
        )}
        {!a.controla_presenca && (
          <p className="text-sm text-muted-foreground">
            Este tipo de atividade não controla presença.
          </p>
        )}
      </header>

      <div
        className="flex flex-wrap gap-2"
        aria-label="Resumo da chamada"
        data-testid="chamada-contadores"
      >
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', CLASSE_TOM.ok)}>
          {c.presentes} presentes
        </span>
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', CLASSE_TOM.bad)}>
          {c.ausentes} ausentes
        </span>
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', CLASSE_TOM.muted)}>
          {c.sem_registro} sem marcação
        </span>
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', CLASSE_TOM.brand)}>
          {c.confirmados} vão · {c.ausencias_avisadas} não vão · {c.sem_resposta} sem resposta
        </span>
      </div>

      {a.modo_presenca === 'qr' && podeMarcar && !a.chamada_encerrada_em && (
        <div className="flex flex-col items-start gap-2">
          <QrPresenca url={qrUrl} className="w-full max-w-sm" />
          <Button type="button" variant="outline" size="sm" onClick={() => setTelaCheia(true)}>
            <Maximize2 aria-hidden /> Mostrar o QR em tela cheia
          </Button>
        </div>
      )}

      {podeMarcar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {confirmadosSemMarcar > 0 && (
            <Button
              type="button"
              variant="secondary"
              disabled={ocupado}
              onClick={() =>
                void enviar({ marcar_confirmados: true }, 'Quem confirmou ficou como presente.')
              }
            >
              <Check aria-hidden /> Marcar todos os confirmados como presentes (
              {confirmadosSemMarcar})
            </Button>
          )}
          <div className="flex min-w-0 flex-1 items-end gap-2 sm:max-w-md">
            <Combobox
              label="Adicionar quem veio"
              options={opcoesAvulso}
              value={avulso}
              onChange={setAvulso}
              placeholder="Escolha o médium"
              searchPlaceholder="Buscar médium..."
              emptyText="Ninguém mais para adicionar."
            />
            <Button
              type="button"
              disabled={!avulso || ocupado}
              onClick={() => {
                if (!avulso) return;
                void enviar({ medium_ids: [avulso] }, 'Adicionado como presente.').then(() =>
                  setAvulso(null),
                );
              }}
            >
              <UserPlus aria-hidden /> Adicionar
            </Button>
          </div>
        </div>
      )}

      <div className="relative max-w-md">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome"
          aria-label="Buscar pelo nome"
          className="pl-9"
        />
      </div>

      {dados.pessoas.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="Ninguém na escala"
          description="Convoque médiuns em Confirmações ou use “Adicionar quem veio”."
        />
      ) : (
        <Card className="gap-0 py-0">
          <ul aria-label="Lista da chamada">
            {pessoas.map((p) => (
              <Pessoa
                key={p.medium_id}
                p={p}
                verMotivo={dados.ver_justificativa}
                podeMarcar={podeMarcar}
                ocupado={ocupado}
                onMarcar={(pessoa, presenca) =>
                  void enviar({ marcacoes: [{ medium_id: pessoa.medium_id, presenca }] })
                }
              />
            ))}
            {pessoas.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">Ninguém com esse nome.</li>
            )}
          </ul>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        O motivo das faltas só aparece para quem cuida das escalas e não vai para relatório nem
        e-mail.
      </p>

      {a.pode_encerrar && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setEncerrar(true)} disabled={ocupado}>
            <ClipboardCheck aria-hidden /> Encerrar chamada
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={encerrar}
        title="Encerrar chamada"
        message={
          a.modo_presenca === 'confianca'
            ? 'Quem confirmou “Vou” e não foi marcado ausente conta como presente; quem ficou sem marcação conta como ausente. Depois ainda dá para corrigir.'
            : 'Quem ficou sem marcação conta como ausente. Depois ainda dá para corrigir.'
        }
        confirmText="Encerrar"
        loading={ocupado}
        onConfirm={() => void confirmarEncerrar()}
        onCancel={() => setEncerrar(false)}
      />

      {telaCheia && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-6 text-black"
          role="dialog"
          aria-label="QR do Cheguei em tela cheia"
        >
          <QrPresenca url={qrUrl} className="w-full max-w-xl border-0" />
          <Button type="button" variant="outline" onClick={() => setTelaCheia(false)}>
            <X aria-hidden /> Fechar
          </Button>
        </div>
      )}
    </div>
  );
}
