/**
 * /admin/mediuns/grupos — Grupos da corrente (AM-23): G1, G2, "Ogãs", "Desenvolvimento"...
 *
 * Um cadastro só para o público dos avisos e, nos próximos cards, para a escala de faxina e de
 * gira. Lista com a cor e a contagem; `CrudDrawer` com nome, cor (paleta fechada, contraste AA),
 * descrição e os médiuns (só ativos). Arquivar tira o grupo das telas e dos avisos; os membros
 * ficam guardados e voltam com ele. O médium vê só o nome do próprio grupo (D-07).
 *
 * Gates (CLAUDE.md): a tela inteira só existe com `can('area_medium')` (plano + chave do piloto;
 * sem ela, aviso neutro, sem PlanLocked). Grupo de permissão `mediuns` (§6.7 do plano): view
 * para ver; insert para criar; edit para editar, pôr/tirar médiuns e desarquivar; delete para
 * arquivar. Backend: `api/v1/admin/corrente_grupos.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Users } from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied } from '@/components/gates';
import { MultiCombobox, TextField } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { CORES_GRUPO, corDoGrupo, proximaCorLivre, type CorGrupo } from '@/constants/correnteGrupos';
import { cn } from '@/lib/utils';

export const API_GRUPOS = '/api/v1/admin/corrente-grupos';
const NOME_MAX = 60;
const DESCRICAO_MAX = 300;
/** Quantos nomes aparecem no cartão antes do "+N". */
const NOMES_NO_CARTAO = 6;

export interface MembroGrupo {
  medium_id: string;
  nome: string;
  desde: string;
}

export interface GrupoCorrente {
  id: string;
  nome: string;
  cor: string;
  descricao: string | null;
  arquivado_em: string | null;
  total_membros: number;
  membros: MembroGrupo[];
}

interface MediumOpcao {
  id: string;
  nome: string;
  is_atendimento: boolean;
}

interface FormState {
  nome: string;
  cor: CorGrupo;
  descricao: string;
  medium_ids: string[];
}

export function resumoMembros(membros: MembroGrupo[], max = NOMES_NO_CARTAO): string {
  if (membros.length === 0) return 'Ninguém no grupo ainda';
  const nomes = membros.slice(0, max).map((m) => m.nome);
  const resto = membros.length - nomes.length;
  return resto > 0 ? `${nomes.join(', ')} e mais ${resto}` : nomes.join(', ');
}

export default function AdminGruposCorrentePage() {
  return (
    <AdminLayout title="Grupos da corrente">
      <GruposContent />
    </AdminLayout>
  );
}

function ListaSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="grupos-loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function GruposContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const liberado = can('area_medium');
  const canView = canGroup('mediuns', 'view');
  const canInsert = canGroup('mediuns', 'insert');
  const canEdit = canGroup('mediuns', 'edit');
  const canDelete = canGroup('mediuns', 'delete');

  const [grupos, setGrupos] = useState<GrupoCorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);
  const [mediuns, setMediuns] = useState<MediumOpcao[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GrupoCorrente | null>(null);
  const [form, setForm] = useState<FormState>({ nome: '', cor: 'ambar', descricao: '', medium_ids: [] });
  const [inicial, setInicial] = useState<FormState | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [arquivar, setArquivar] = useState<GrupoCorrente | null>(null);
  const [arquivando, setArquivando] = useState(false);

  const carregar = useCallback(async () => {
    if (!liberado || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiClient.get<GrupoCorrente[]>(API_GRUPOS, {
        params: verArquivados ? { incluir_arquivados: true } : undefined,
      });
      setGrupos(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [liberado, canView, verArquivados]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Médiuns ativos para o seletor — só para quem pode criar ou editar.
  useEffect(() => {
    if (!liberado || !canView || !(canInsert || canEdit)) return;
    apiClient
      .get<MediumOpcao[]>('/api/v1/admin/mediuns/options')
      .then((res) => setMediuns(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMediuns([]));
  }, [liberado, canView, canInsert, canEdit]);

  const opcoesMediuns = useMemo(
    () =>
      mediuns.map((m) => ({
        value: m.id,
        label: m.nome,
        description: m.is_atendimento ? 'Médium' : 'Cambone',
      })),
    [mediuns],
  );

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNovo = () => {
    const novo: FormState = {
      nome: '',
      cor: proximaCorLivre(grupos.filter((g) => !g.arquivado_em).map((g) => g.cor)),
      descricao: '',
      medium_ids: [],
    };
    setEditing(null);
    setForm(novo);
    setInicial(novo);
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const abrirEdicao = (g: GrupoCorrente) => {
    const atual: FormState = {
      nome: g.nome,
      cor: (CORES_GRUPO.some((c) => c.chave === g.cor) ? g.cor : 'ambar') as CorGrupo,
      descricao: g.descricao ?? '',
      medium_ids: g.membros.map((m) => m.medium_id),
    };
    setEditing(g);
    setForm(atual);
    setInicial(atual);
    setTouched(false);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const nomeErro = touched && !form.nome.trim() ? 'Dê um nome ao grupo' : undefined;
  const isDirty = inicial !== null && JSON.stringify(form) !== JSON.stringify(inicial);

  const salvar = async () => {
    setTouched(true);
    if (!form.nome.trim()) return;
    if (editing ? !canEdit : !canInsert) return;
    const payload = {
      nome: form.nome.trim(),
      cor: form.cor,
      descricao: form.descricao.trim() || null,
      medium_ids: form.medium_ids,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await apiClient.put(`${API_GRUPOS}/${editing.id}`, payload);
        showSuccess('Grupo atualizado.');
      } else {
        await apiClient.post(API_GRUPOS, payload);
        showSuccess('Grupo criado.');
      }
      setDrawerOpen(false);
      void carregar();
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, 'Não foi possível salvar o grupo. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarArquivar = async () => {
    if (!arquivar || !canDelete) return;
    setArquivando(true);
    try {
      await apiClient.delete(`${API_GRUPOS}/${arquivar.id}`);
      showSuccess('Grupo arquivado. Ele saiu das telas e dos avisos.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível arquivar o grupo.'));
    } finally {
      setArquivando(false);
      setArquivar(null);
    }
  };

  const desarquivar = async (g: GrupoCorrente) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_GRUPOS}/${g.id}/desarquivar`);
      showSuccess('Grupo de volta.');
      void carregar();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível trazer o grupo de volta.'));
    }
  };

  if (subLoading) return <ListaSkeleton />;
  if (!liberado) {
    // Piloto da Área do Médium: sem a chave, nada de oferta de plano — só um aviso neutro.
    return (
      <EmptyState
        icon={<Users />}
        title="Grupos da corrente"
        description="A Área do Médium ainda não está disponível para este terreiro."
      />
    );
  }
  if (!canView) return <PermissionDenied className="mt-4" />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/mediuns">
            <ArrowLeft aria-hidden />
            Médiuns e Cambones
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Grupos da corrente"
        subtitle="G1, G2, Ogãs, Desenvolvimento… Use nos avisos (e, em breve, nas escalas). O médium vê só o nome do grupo dele."
        actions={
          canInsert ? (
            <Button onClick={abrirNovo}>
              <Plus aria-hidden />
              Novo grupo
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2">
        <Switch id="grupos-arquivados" checked={verArquivados} onCheckedChange={setVerArquivados} />
        <Label htmlFor="grupos-arquivados" className="text-sm font-normal">
          Mostrar arquivados
        </Label>
      </div>

      {loading ? (
        <ListaSkeleton />
      ) : loadError ? (
        <EmptyState
          icon={<Users />}
          title="Não foi possível carregar os grupos"
          description="Confira a internet e tente de novo."
          action={
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          }
        />
      ) : grupos.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Nenhum grupo ainda"
          description="Crie os grupos da casa (G1, G2, Ogãs…) e ponha os médiuns neles."
          action={
            canInsert ? (
              <Button onClick={abrirNovo}>
                <Plus aria-hidden />
                Novo grupo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Grupos da corrente">
          {grupos.map((g) => (
            <li key={g.id}>
              <Card
                className={cn('h-full flex-row items-start gap-3 p-4', g.arquivado_em && 'opacity-75')}
                data-testid="grupo-item"
              >
                <span
                  aria-hidden
                  className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: corDoGrupo(g.cor) }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <GrupoChip grupo={g} />
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {g.total_membros} {g.total_membros === 1 ? 'médium' : 'médiuns'}
                    </span>
                    {g.arquivado_em && <span className="text-xs text-muted-foreground">Arquivado</span>}
                  </span>
                  {g.descricao && <p className="text-sm">{g.descricao}</p>}
                  <p className="text-sm text-muted-foreground">{resumoMembros(g.membros)}</p>
                </div>
                {(canEdit || canDelete) && (
                  <div className="flex shrink-0 gap-1">
                    {!g.arquivado_em && canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => abrirEdicao(g)}
                        title="Editar"
                        aria-label={`Editar ${g.nome}`}
                      >
                        <Pencil />
                      </Button>
                    )}
                    {!g.arquivado_em && canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setArquivar(g)}
                        title="Arquivar"
                        aria-label={`Arquivar ${g.nome}`}
                      >
                        <Archive />
                      </Button>
                    )}
                    {g.arquivado_em && canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void desarquivar(g)}
                        title="Trazer de volta"
                        aria-label={`Trazer de volta ${g.nome}`}
                      >
                        <ArchiveRestore />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CrudDrawer
        open={drawerOpen}
        title={editing ? 'Editar grupo' : 'Novo grupo'}
        subtitle="Os médiuns do grupo recebem os avisos feitos para ele."
        icon={<Users />}
        onClose={() => setDrawerOpen(false)}
        onSave={salvar}
        saving={saving}
        saveLabel={editing ? 'Salvar' : 'Criar grupo'}
        isDirty={isDirty}
        error={saveError}
      >
        <TextField
          label="Nome"
          required
          fullWidth
          maxLength={NOME_MAX}
          placeholder="Ex.: G1, Ogãs, Desenvolvimento"
          value={form.nome}
          onChange={(e) => setField('nome', e.target.value)}
          error={nomeErro}
          autoFocus
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cor</legend>
          <div role="radiogroup" aria-label="Cor do grupo" className="flex flex-wrap gap-2">
            {CORES_GRUPO.map((c) => {
              const marcada = form.cor === c.chave;
              return (
                <button
                  key={c.chave}
                  type="button"
                  role="radio"
                  aria-checked={marcada}
                  aria-label={c.nome}
                  title={c.nome}
                  onClick={() => setField('cor', c.chave)}
                  className={cn(
                    'size-9 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    marcada && 'ring-2 ring-foreground',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
          </div>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Assim aparece: <GrupoChip grupo={{ nome: form.nome.trim() || 'Nome do grupo', cor: form.cor }} />
          </span>
        </fieldset>

        <TextField
          label="Descrição (opcional)"
          fullWidth
          multiline
          rows={2}
          maxLength={DESCRICAO_MAX}
          placeholder="Ex.: Faxina no 1º e no 3º sábado"
          value={form.descricao}
          onChange={(e) => setField('descricao', e.target.value)}
        />

        <MultiCombobox
          label="Médiuns do grupo"
          options={opcoesMediuns}
          value={form.medium_ids}
          onChange={(v) => setField('medium_ids', v)}
          placeholder="Escolha os médiuns"
          searchPlaceholder="Buscar médium..."
          emptyText="Nenhum médium ativo encontrado."
          countLabel={(n) => `${n} ${n === 1 ? 'médium escolhido' : 'médiuns escolhidos'}`}
          helperText="Só médiuns e cambones ativos. Quem é inativado sai do grupo."
        />
      </CrudDrawer>

      <ConfirmDialog
        open={arquivar !== null}
        title="Arquivar grupo"
        message={
          <>
            O grupo <strong className="text-foreground">{arquivar?.nome}</strong> sai das telas e dos avisos. Os
            médiuns continuam guardados nele: dá para trazer o grupo de volta depois.
          </>
        }
        confirmText="Arquivar"
        destructive
        loading={arquivando}
        onConfirm={confirmarArquivar}
        onCancel={() => setArquivar(null)}
      />
    </div>
  );
}
