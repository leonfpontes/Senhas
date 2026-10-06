/**
 * Admin Financeiro — Configuração
 * Abas: Categorias | Contas bancárias | Mensalidade (Card + Switch, salvar fixo no rodapé).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, MoreHorizontal, Pencil, Plus, Power, PowerOff, Save, Settings2, Tags, Trash2, Loader2 } from 'lucide-react';
import AdminLayout from '../admin_layout';
import CrudDrawer from '../../../components/CrudDrawer';
import { apiClient, extractApiErrorMessage } from '../../../services/api_client';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { PermissionDenied, PlanLocked, ReadOnlyNotice } from '@/components/gates';
import { MoneyInput, TextField } from '@/components/fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBRL } from '@/lib/dateBr';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Categoria { id: string; nome: string; tipo: string; cor: string | null; ativo: boolean }
interface ContaBancaria { id: string; nome: string; banco: string | null; saldo_inicial: number; ativo: boolean }

const COR_OPTIONS = [
  '#1D9E75', '#378ADD', '#D4537E', '#BA7517', '#A32D2D', '#534AB7',
  '#0F6E56', '#993C1D', '#185FA5', '#3B6D11', '#5F5E5A', '#D85A30',
];

const TIPO_LABEL: Record<string, string> = { pagar: 'Saída', receber: 'Entrada', ambos: 'Ambos' };

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'pagar') return <Badge variant="outline" className="border-destructive/40 text-destructive">{TIPO_LABEL.pagar}</Badge>;
  if (tipo === 'receber') return <Badge variant="outline" className="border-success/40 text-success">{TIPO_LABEL.receber}</Badge>;
  return <Badge variant="outline">{TIPO_LABEL[tipo] ?? tipo}</Badge>;
}

/** Desativado: some das listas de escolha dos lançamentos, mas continua aqui para reativar. */
function InativoBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Inativa
    </Badge>
  );
}

function ListSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function RowMenu({
  nome,
  ativo,
  onEdit,
  onToggleAtivo,
  onDelete,
}: {
  nome: string;
  ativo?: boolean;
  onEdit?: () => void;
  onToggleAtivo?: () => void;
  onDelete?: () => void;
}) {
  if (!onEdit && !onDelete && !onToggleAtivo) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${nome}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {onToggleAtivo && (
          <DropdownMenuItem onSelect={onToggleAtivo}>
            {ativo ? <PowerOff /> : <Power />}
            {ativo ? 'Desativar' : 'Reativar'}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aba: Categorias
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_CAT = { nome: '', tipo: 'ambos', cor: COR_OPTIONS[0] };

function CategoriasTab() {
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');

  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<Categoria | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_CAT);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get<Categoria[]>('/api/v1/admin/financeiro/categorias', { params: { incluir_inativos: true } });
      setItems(res.data);
    } catch {
      showError('Erro ao carregar categorias.');
    } finally {
      setLoading(false);
    }
  }, [canView, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_CAT);
    setTouched({});
    setDrawerMode('create');
    setEditTarget(null);
    setDrawerOpen(true);
  };
  const openEdit = (cat: Categoria) => {
    setForm({ nome: cat.nome, tipo: cat.tipo, cor: cat.cor ?? COR_OPTIONS[0] });
    setTouched({});
    setDrawerMode('edit');
    setEditTarget(cat);
    setDrawerOpen(true);
  };

  const isDirty =
    drawerMode === 'create'
      ? form.nome !== '' || form.tipo !== EMPTY_CAT.tipo
      : !!editTarget && (form.nome !== editTarget.nome || form.tipo !== editTarget.tipo || form.cor !== (editTarget.cor ?? COR_OPTIONS[0]));

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!form.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      const body = { nome: form.nome.trim(), tipo: form.tipo, cor: form.cor };
      if (drawerMode === 'create') await apiClient.post('/api/v1/admin/financeiro/categorias', body);
      else if (editTarget) await apiClient.put(`/api/v1/admin/financeiro/categorias/${editTarget.id}`, body);
      setDrawerOpen(false);
      showSuccess(drawerMode === 'create' ? 'Categoria criada.' : 'Categoria atualizada.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (cat: Categoria) => {
    if (!canEdit) return;
    try {
      await apiClient.put(`/api/v1/admin/financeiro/categorias/${cat.id}`, { ativo: !cat.ativo });
      showSuccess(cat.ativo ? 'Categoria desativada.' : 'Categoria reativada.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao atualizar a categoria.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/categorias/${deleteTarget.id}`);
      showSuccess('Categoria excluída.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao excluir.'));
    } finally {
      setDeleteTarget(null);
      setDeleting(false);
    }
  };

  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar categorias financeiras." />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? '' : `${items.length} categoria${items.length !== 1 ? 's' : ''}`}
        </p>
        {canInsert && (
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Nova categoria
          </Button>
        )}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-10 text-ghost" aria-hidden />}
          title="Nenhuma categoria"
          description="Crie a primeira para organizar seus lançamentos."
          action={canInsert ? <Button size="sm" onClick={openCreate}><Plus />Nova categoria</Button> : undefined}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {items.map((cat) => (
              <li key={cat.id} className={`flex items-center gap-3 px-4 py-3 ${cat.ativo ? '' : 'opacity-60'}`}>
                <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: cat.cor ?? '#888' }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.nome}</span>
                {!cat.ativo && <InativoBadge />}
                <TipoBadge tipo={cat.tipo} />
                <RowMenu
                  nome={cat.nome}
                  ativo={cat.ativo}
                  onEdit={canEdit ? () => openEdit(cat) : undefined}
                  onToggleAtivo={canEdit ? () => toggleAtivo(cat) : undefined}
                  onDelete={canDelete ? () => setDeleteTarget(cat) : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nova categoria' : 'Editar categoria'}
        subtitle="Organize seus lançamentos financeiros por categoria"
        icon={<Tags />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!form.nome.trim()}
        isDirty={isDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
            required
            error={touched.nome && !form.nome.trim() && 'Obrigatório'}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-tipo">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
              <SelectTrigger id="cat-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pagar">Saída (a pagar)</SelectItem>
                <SelectItem value="receber">Entrada (a receber)</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Cor de identificação</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor de identificação">
              {COR_OPTIONS.map((cor) => {
                const selected = form.cor === cor;
                return (
                  <button
                    key={cor}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Cor ${cor}`}
                    onClick={() => setForm((f) => ({ ...f, cor }))}
                    className={`size-7 rounded-full border-2 transition-[border-color,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      selected ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: cor }}
                  />
                );
              })}
            </div>
          </fieldset>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir categoria"
        message={
          <>
            A categoria <strong>{deleteTarget?.nome}</strong> sai da lista e não pode mais ser escolhida em novos
            lançamentos. Os lançamentos que já usam essa categoria continuam com ela. Para só escondê-la por um tempo,
            use &quot;Desativar&quot;.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aba: Contas bancárias
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_CONTA = { nome: '', banco: '', saldo_inicial: 0 };

function ContasBancariasTab() {
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('contas_financeiras', 'view');
  const canInsert = canGroup('contas_financeiras', 'insert');
  const canEdit = canGroup('contas_financeiras', 'edit');
  const canDelete = canGroup('contas_financeiras', 'delete');

  const [items, setItems] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editTarget, setEditTarget] = useState<ContaBancaria | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_CONTA);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ContaBancaria | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get<ContaBancaria[]>('/api/v1/admin/financeiro/contas-bancarias', { params: { incluir_inativos: true } });
      setItems(res.data);
    } catch {
      showError('Erro ao carregar contas bancárias.');
    } finally {
      setLoading(false);
    }
  }, [canView, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_CONTA);
    setTouched({});
    setDrawerMode('create');
    setEditTarget(null);
    setDrawerOpen(true);
  };
  const openEdit = (conta: ContaBancaria) => {
    setForm({ nome: conta.nome, banco: conta.banco ?? '', saldo_inicial: conta.saldo_inicial });
    setTouched({});
    setDrawerMode('edit');
    setEditTarget(conta);
    setDrawerOpen(true);
  };

  const isDirty =
    drawerMode === 'create'
      ? form.nome !== '' || form.banco !== '' || form.saldo_inicial !== 0
      : !!editTarget &&
        (form.nome !== editTarget.nome || form.banco !== (editTarget.banco ?? '') || form.saldo_inicial !== editTarget.saldo_inicial);

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!form.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      const body = { nome: form.nome.trim(), banco: form.banco.trim() || null, saldo_inicial: form.saldo_inicial };
      if (drawerMode === 'create') await apiClient.post('/api/v1/admin/financeiro/contas-bancarias', body);
      else if (editTarget) await apiClient.put(`/api/v1/admin/financeiro/contas-bancarias/${editTarget.id}`, body);
      setDrawerOpen(false);
      showSuccess(drawerMode === 'create' ? 'Conta criada.' : 'Conta atualizada.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (conta: ContaBancaria) => {
    if (!canEdit) return;
    try {
      await apiClient.put(`/api/v1/admin/financeiro/contas-bancarias/${conta.id}`, { ativo: !conta.ativo });
      showSuccess(conta.ativo ? 'Conta desativada.' : 'Conta reativada.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao atualizar a conta.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/financeiro/contas-bancarias/${deleteTarget.id}`);
      showSuccess('Conta excluída.');
      load();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao excluir.'));
    } finally {
      setDeleteTarget(null);
      setDeleting(false);
    }
  };

  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar contas bancárias." />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{loading ? '' : `${items.length} conta${items.length !== 1 ? 's' : ''}`}</p>
        {canInsert && (
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Nova conta
          </Button>
        )}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-10 text-ghost" aria-hidden />}
          title="Nenhuma conta bancária"
          description="Adicione contas para registrar pagamentos e recebimentos."
          action={canInsert ? <Button size="sm" onClick={openCreate}><Plus />Nova conta</Button> : undefined}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {items.map((conta) => (
              <li key={conta.id} className={`flex items-center gap-3 px-4 py-3 ${conta.ativo ? '' : 'opacity-60'}`}>
                <Landmark className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{conta.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {conta.banco ? `${conta.banco} · ` : ''}Saldo inicial {formatBRL(conta.saldo_inicial)}
                  </p>
                </div>
                {!conta.ativo && <InativoBadge />}
                <RowMenu
                  nome={conta.nome}
                  ativo={conta.ativo}
                  onEdit={canEdit ? () => openEdit(conta) : undefined}
                  onToggleAtivo={canEdit ? () => toggleAtivo(conta) : undefined}
                  onDelete={canDelete ? () => setDeleteTarget(conta) : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CrudDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nova conta bancária' : 'Editar conta bancária'}
        subtitle="Conta corrente, poupança, carteira ou caixa do terreiro"
        icon={<Landmark />}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!form.nome.trim()}
        isDirty={isDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome da conta"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
            required
            error={touched.nome && !form.nome.trim() && 'Obrigatório'}
            helperText="Ex.: Conta Bradesco, Caixa do Terreiro"
            autoFocus
          />
          <TextField
            label="Banco / instituição"
            value={form.banco}
            onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
            helperText="Opcional — ex.: Bradesco, Nubank, Caixa"
          />
          <MoneyInput
            label="Saldo inicial"
            value={form.saldo_inicial}
            onChange={(v) => setForm((f) => ({ ...f, saldo_inicial: v }))}
            helperText="Saldo da conta no momento do cadastro — é o ponto de partida do saldo acumulado no Fluxo de caixa"
          />
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir conta bancária"
        message={
          <>
            A conta <strong>{deleteTarget?.nome}</strong> sai da lista e não pode mais ser escolhida em novos
            lançamentos. Os lançamentos que já usam essa conta continuam com ela.
          </>
        }
        confirmText="Excluir"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aba: Mensalidade
// ═══════════════════════════════════════════════════════════════════════════════

// O toggle "Enviar relatório por e-mail" (email_relatorio_ativo) saiu daqui: nenhum job lia
// a flag e não existe botão "Enviar relatório" na tela. A coluna segue no banco.
interface MensalidadeForm {
  valorMensal: number;
  diaVencimento: string;
  flagAssociado: boolean;
  valorMensalAssociado: number;
  diaVencimentoAssociado: string;
}

const DIAS = Array.from({ length: 28 }, (_, i) => String(i + 1));

function DiaSelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DIAS.map((d) => (
          <SelectItem key={d} value={d}>
            Dia {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MensalidadeTab() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('financeiro', 'view');
  const canEdit = canGroup('financeiro', 'edit');
  const planMediuns = can('mensalidade_mediun');
  const planAssoc = can('mensalidade_associado');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const EMPTY: MensalidadeForm = useMemo(
    () => ({ valorMensal: 0, diaVencimento: '10', flagAssociado: false, valorMensalAssociado: 0, diaVencimentoAssociado: '10' }),
    [],
  );
  const [form, setForm] = useState<MensalidadeForm>(EMPTY);
  const [saved, setSaved] = useState<MensalidadeForm>(EMPTY);
  // Falha ao carregar: o formulário mostraria os padrões e salvar sobrescreveria a config real.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    apiClient
      .get('/api/v1/admin/financeiro/config')
      .then((res) => {
        if (!res.data) return;
        const next: MensalidadeForm = {
          valorMensal: res.data.valor_mensal ?? 0,
          diaVencimento: String(res.data.dia_vencimento ?? '10'),
          flagAssociado: Boolean(res.data.enable_mensalidade_associado),
          valorMensalAssociado: res.data.valor_mensal_associado ?? 0,
          diaVencimentoAssociado: String(res.data.dia_vencimento_associado ?? '10'),
        };
        setForm(next);
        setSaved(next);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [canView, reloadKey]);

  const set = <K extends keyof MensalidadeForm>(k: K, v: MensalidadeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  const handleSave = async () => {
    if (!canEdit || loadError) return;
    if (planMediuns && form.valorMensal < 0) {
      showError('Informe um valor mensal válido (≥ 0).');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (planMediuns) {
        body.valor_mensal = form.valorMensal;
        body.dia_vencimento = parseInt(form.diaVencimento, 10);
      }
      if (planAssoc) {
        // Único lugar que liga/desliga a mensalidade de associados (saiu de Configurações).
        body.enable_mensalidade_associado = form.flagAssociado;
        // 0 é um valor válido (volta a não cobrar) — antes só valores > 0 eram enviados.
        if (form.valorMensalAssociado >= 0) body.valor_mensal_associado = form.valorMensalAssociado;
        if (form.diaVencimentoAssociado) body.dia_vencimento_associado = parseInt(form.diaVencimentoAssociado, 10);
      }
      await apiClient.put('/api/v1/admin/financeiro/config', body);
      setSaved(form);
      showSuccess('Configuração salva.');
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Erro ao salvar configuração.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ListSkeleton />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar a configuração de mensalidade." />;
  if (loadError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Não foi possível carregar a configuração de mensalidade.</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          Para não sobrescrever a configuração atual, o formulário fica bloqueado até carregar.
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      {!canEdit && <ReadOnlyNotice />}

      {planMediuns && (
        <Card>
          <CardHeader>
            <CardTitle>Médiuns</CardTitle>
            <CardDescription>Valor e vencimento da mensalidade da corrente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MoneyInput label="Valor mensal" value={form.valorMensal} onChange={(v) => set('valorMensal', v)} disabled={!canEdit} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dia-venc">Dia de vencimento</Label>
              <DiaSelect id="dia-venc" value={form.diaVencimento} onChange={(v) => set('diaVencimento', v)} disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>
      )}

      {planAssoc && (
        <Card>
          <CardHeader>
            <CardTitle>Associados</CardTitle>
            <CardDescription>Controle de mensalidade para associados do terreiro.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="flag-assoc" className="font-medium">
                  Habilitar mensalidade de associados
                </Label>
                <p className="text-xs text-muted-foreground">Mostra a aba Associados em Mensalidades.</p>
              </div>
              <Switch id="flag-assoc" checked={form.flagAssociado} onCheckedChange={(v) => set('flagAssociado', v)} disabled={!canEdit} />
            </div>
            {form.flagAssociado && (
              <>
                <MoneyInput
                  label="Valor mensal (associados)"
                  value={form.valorMensalAssociado}
                  onChange={(v) => set('valorMensalAssociado', v)}
                  disabled={!canEdit}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dia-venc-assoc">Dia de vencimento (associados)</Label>
                  <DiaSelect id="dia-venc-assoc" value={form.diaVencimentoAssociado} onChange={(v) => set('diaVencimentoAssociado', v)} disabled={!canEdit} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+56px)] z-30 md:bottom-0 -mx-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-t-lg sm:border-x">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {isDirty ? 'Alterações não salvas' : 'Tudo salvo'}
            </span>
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar configuração
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Página
// ═══════════════════════════════════════════════════════════════════════════════

export default function FinanceiroConfigPage() {
  return (
    <AdminLayout title="Configuração Financeira">
      <FinanceiroConfigContent />
    </AdminLayout>
  );
}

function FinanceiroConfigContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const [tab, setTab] = useState('categorias');

  if (!can('mensalidade_mediun') && !can('mensalidade_associado') && !can('contas_financeiras')) {
    return <PlanLocked feature="Configuração Financeira" minPlan="Pro" />;
  }
  if (!canGroup('contas_financeiras', 'view') && !canGroup('financeiro', 'view')) {
    return <PermissionDenied message="Você não tem permissão para visualizar a configuração financeira." />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Configuração Financeira"
        subtitle="Categorias, contas bancárias e mensalidades do terreiro"
        actions={<Settings2 className="size-6 text-brand" aria-hidden />}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="contas">Contas bancárias</TabsTrigger>
          <TabsTrigger value="mensalidade">Mensalidade</TabsTrigger>
        </TabsList>
        <TabsContent value="categorias" className="mt-3">
          <CategoriasTab />
        </TabsContent>
        <TabsContent value="contas" className="mt-3">
          <ContasBancariasTab />
        </TabsContent>
        <TabsContent value="mensalidade" className="mt-3">
          <MensalidadeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
