/**
 * Admin Associados — lista (DataTable, cartões no celular) com busca + Sheet de cadastro.
 *
 * A API pagina (máx. 200 por página): a tela busca TODAS as páginas para que a busca local
 * (nome, e-mail, telefone) cubra todos os associados — antes vinham só os 50 primeiros.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { MaskedInput, TextField, unmask } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { maskTelefone } from '@/components/fields/MaskedInput';

interface Associado {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  mensalidade_isento?: boolean;
  created_at: string;
}

interface AssociadoForm {
  nome: string;
  email: string;
  telefone: string;
  mensalidade_isento: boolean;
}

const EMPTY_FORM: AssociadoForm = { nome: '', email: '', telefone: '', mensalidade_isento: false };

/** Tamanho de página aceito pela API (`limit` máx. 200). */
export const ASSOCIADOS_PAGE_SIZE = 200;

/** Busca todas as páginas de `/api/v1/admin/associados` (para até 50 mil associados). */
export async function fetchTodosAssociados(): Promise<Associado[]> {
  const todos: Associado[] = [];
  for (let skip = 0; skip < 50_000; skip += ASSOCIADOS_PAGE_SIZE) {
    const res = await apiClient.get<Associado[]>('/api/v1/admin/associados', {
      params: { skip, limit: ASSOCIADOS_PAGE_SIZE },
    });
    const page = Array.isArray(res.data) ? res.data : [];
    todos.push(...page);
    if (page.length < ASSOCIADOS_PAGE_SIZE) break;
  }
  return todos;
}

export default function AdminAssociadosPage() {
  return (
    <AdminLayout title="Associados">
      <AdminAssociadosContent />
    </AdminLayout>
  );
}

function AdminAssociadosContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const planAllows = can('associados');
  const canView = canGroup('associados', 'view');
  const canInsert = canGroup('associados', 'insert');
  const canEdit = canGroup('associados', 'edit');
  const canDelete = canGroup('associados', 'delete');

  const [associados, setAssociados] = useState<Associado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Associado | null>(null);
  const [formData, setFormData] = useState<AssociadoForm>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [deleteTarget, setDeleteTarget] = useState<Associado | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAssociados = useCallback(async () => {
    if (subLoading) return;
    if (!canView || !planAllows) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setAssociados(await fetchTodosAssociados());
    } catch {
      showError('Erro ao carregar associados');
    } finally {
      setLoading(false);
    }
  }, [canView, planAllows, subLoading, showError]);

  useEffect(() => {
    loadAssociados();
  }, [loadAssociados]);

  // ── Sheet ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (item: Associado) => {
    setCurrentItem(item);
    setFormData({
      nome: item.nome,
      email: item.email,
      telefone: item.telefone ? maskTelefone(item.telefone) : '',
      mensalidade_isento: !!item.mensalidade_isento,
    });
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
    setFormData(EMPTY_FORM);
    setTouched({});
  };

  const handleChange = <K extends keyof AssociadoForm>(field: K, value: AssociadoForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? Object.entries(formData).some(([k, v]) => v !== EMPTY_FORM[k as keyof AssociadoForm])
      : currentItem != null &&
        (formData.nome !== currentItem.nome ||
          formData.email !== currentItem.email ||
          formData.mensalidade_isento !== !!currentItem.mensalidade_isento ||
          formData.telefone !== (currentItem.telefone ? maskTelefone(currentItem.telefone) : ''));

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const emailError = touched.email
    ? !formData.email.trim()
      ? 'E-mail é obrigatório'
      : !isValidEmail(formData.email)
        ? 'E-mail inválido'
        : ''
    : '';
  const saveDisabled = !formData.nome.trim() || !formData.email.trim() || !isValidEmail(formData.email);

  const handleSave = async () => {
    setTouched({ nome: true, email: true, telefone: true });
    if (saveDisabled) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      // Telefone só com dígitos; vazio vai como null para limpar na edição.
      const payload: Record<string, string | boolean | null> = {
        nome: formData.nome.trim(),
        email: formData.email.trim(),
        telefone: unmask(formData.telefone) || null,
        mensalidade_isento: formData.mensalidade_isento,
      };

      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/associados', payload);
        showSuccess('Associado criado com sucesso!');
      } else if (currentItem) {
        await apiClient.put(`/api/v1/admin/associados/${currentItem.id}`, payload);
        showSuccess('Associado atualizado com sucesso!');
      }
      closeDrawer();
      loadAssociados();
    } catch (error) {
      showError(extractApiErrorMessage(error, 'Erro ao salvar associado'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/associados/${deleteTarget.id}`);
      setDeleteTarget(null);
      showSuccess('Associado excluído.');
      loadAssociados();
    } catch (error) {
      showError(extractApiErrorMessage(error, 'Erro ao excluir associado'));
    } finally {
      setDeleting(false);
    }
  };

  // ── Lista ───────────────────────────────────────────────────────────

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return associados;
    const digits = term.replace(/\D/g, '');
    return associados.filter(
      (a) =>
        a.nome.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        (digits.length > 0 && (a.telefone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [associados, search]);

  const showActions = canEdit || canDelete;

  const RowActions = ({ a }: { a: Associado }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${a.nome}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={() => openEdit(a)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(a)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = useMemo<ColumnDef<Associado>[]>(() => {
    const cols: ColumnDef<Associado>[] = [
      { accessorKey: 'nome', header: 'Nome', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { accessorKey: 'email', header: 'E-mail' },
      {
        accessorKey: 'telefone',
        header: 'Telefone',
        enableSorting: false,
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? maskTelefone(v) : '—';
        },
      },
    ];
    if (showActions) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <RowActions a={row.original} />,
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActions, canEdit, canDelete]);

  const renderCard = (a: Associado) => (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{a.nome}</span>
        <span className="truncate text-xs text-muted-foreground">{a.email}</span>
        <span className="text-xs text-muted-foreground">{a.telefone ? maskTelefone(a.telefone) : 'Sem telefone'}</span>
      </div>
      {showActions && <RowActions a={a} />}
    </div>
  );

  // ── Gates ───────────────────────────────────────────────────────────

  if (!subLoading && !planAllows) return <PlanLocked feature="Associados" minPlan="Pro" />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar associados." />;

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="associados-header">
        <PageHeader
          title="Associados"
          subtitle="Quem contribui com a casa e recebe senhas especiais"
          actions={
            <>
              <Button variant="outline" onClick={loadAssociados} disabled={loading} aria-label="Atualizar lista">
                <RefreshCw className={loading ? 'animate-spin' : undefined} />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>
              {canInsert && (
                <Button data-tour="associados-novo" onClick={openCreate}>
                  <Plus />
                  Novo associado
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="w-full sm:w-80">
        <TextField
          aria-label="Buscar associado"
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startAdornment={<Search />}
          size="small"
        />
      </div>

      <div data-tour="associados-tabela">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(a) => a.id}
          loading={loading}
          pageSize={25}
          renderCard={renderCard}
          emptyIcon={<Users className="size-10 text-ghost" aria-hidden />}
          emptyMessage={search ? 'Nenhum associado encontrado para a busca.' : 'Nenhum associado cadastrado.'}
          emptyDescription={!search && canInsert ? 'Clique em "Novo associado" para começar.' : undefined}
        />
      </div>

      <CrudDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'Novo associado' : 'Editar associado'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre um novo associado para emissão de senhas especiais.'
            : 'Altere as informações do associado selecionado.'
        }
        icon={<Users />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Criar' : 'Salvar'}
        saving={saving}
        saveDisabled={saveDisabled}
        isDirty={isDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome"
            value={formData.nome}
            onChange={(e) => handleChange('nome', e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, nome: true }))}
            required
            error={nomeError}
            autoFocus
          />
          <TextField
            label="E-mail"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            required
            error={emailError}
          />
          <MaskedInput
            mask="telefone"
            label="Telefone"
            value={formData.telefone}
            onChange={(v) => handleChange('telefone', v)}
            helperText="Opcional"
          />
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="associado-isento" className="font-medium">
                Isento de mensalidade
              </Label>
              <p className="text-xs text-muted-foreground">
                Não entra na cobrança mensal nem gera conta a receber.
              </p>
            </div>
            <Switch
              id="associado-isento"
              checked={formData.mensalidade_isento}
              onCheckedChange={(v) => handleChange('mensalidade_isento', v)}
            />
          </div>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir associado"
        message={
          <>
            Deseja realmente excluir o associado <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser
            desfeita.
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
