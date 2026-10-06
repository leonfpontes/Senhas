/**
 * Admin — Cursos presenciais: cadastro de turmas, link público de inscrição e acesso aos
 * participantes. `DataTable` com cartões no celular, ações no menu da linha, formulário em
 * `CrudDrawer`. Gate de plano = `site_builder` (o mesmo `require_plan_feature` do backend).
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import type { ColumnDef } from '@tanstack/react-table';
import { Link2, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';

import AdminLayout from './admin_layout';
import CrudDrawer from '../../components/CrudDrawer';
import { apiClient } from '../../services/api_client';
import { fetchAllPages } from '../../services/fetchAllPages';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateTimeField, MoneyInput, TextField } from '@/components/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatBRL, formatDateTimeBr, toNum } from '@/lib/dateBr';
import { IconCurso } from '@/lib/icons';
import { minPlanFor } from '@/constants/plans';

interface CursoPresencial {
  id: string;
  tenant_id: string;
  titulo: string;
  ementa?: string | null;
  data_inicio: string; // ISO
  data_fim?: string | null;
  max_participantes?: number | null;
  /** Decimal serializado como string pela API ("120.00") — sempre ler via `toNum`. */
  valor_mensalidade_padrao?: number | string | null;
  local?: string | null;
  observacoes?: string | null;
  is_active: boolean;
  gerar_mensalidade: boolean;
  tipo_formulario: string;
  chave_pix?: string | null;
}

interface CursoForm {
  titulo: string;
  ementa: string;
  data_inicio: string | null; // ISO local "YYYY-MM-DDTHH:mm"
  data_fim: string | null;
  max_participantes: string;
  valor_mensalidade_padrao: number;
  local: string;
  observacoes: string;
  is_active: boolean;
  gerar_mensalidade: boolean;
  tipo_formulario: string;
  chave_pix: string;
}

const API_PREFIX = '/api/v1/admin/cursos-presenciais';

/** ISO (UTC) → ISO local "YYYY-MM-DDTHH:mm" para o DateTimeField. */
export function isoToLocalDatetime(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (): CursoForm => ({
  titulo: '',
  ementa: '',
  data_inicio: isoToLocalDatetime(new Date().toISOString()),
  data_fim: null,
  max_participantes: '',
  valor_mensalidade_padrao: 0,
  local: '',
  observacoes: '',
  is_active: true,
  gerar_mensalidade: false,
  tipo_formulario: 'simples',
  chave_pix: '',
});

function StatusBadge({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <Badge className="border-transparent bg-success text-success-foreground">Ativo</Badge>
  ) : (
    <Badge variant="outline">Inativo</Badge>
  );
}

export default function CursosPresenciaisPage() {
  return (
    <AdminLayout title="Cursos presenciais">
      <CursosPresenciaisContent />
    </AdminLayout>
  );
}

function CursosPresenciaisContent() {
  const router = useRouter();
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const canView = canGroup('cursos_presenciais', 'view');
  const canInsert = canGroup('cursos_presenciais', 'insert');
  const canEdit = canGroup('cursos_presenciais', 'edit');
  const canDelete = canGroup('cursos_presenciais', 'delete');
  const isPlanAllowed = can('site_builder');

  const [cursos, setCursos] = useState<CursoPresencial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CursoForm>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CursoPresencial | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCursos = useCallback(async () => {
    if (!canView || !isPlanAllowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Backend corta em 50 por padrão (máx. 100/página): busca todas as páginas.
      setCursos(await fetchAllPages<CursoPresencial>(API_PREFIX, { pageSize: 100 }));
    } catch {
      showError('Erro ao carregar os cursos.');
    } finally {
      setLoading(false);
    }
  }, [canView, isPlanAllowed, showError]);

  useEffect(() => {
    if (subLoading) return;
    fetchCursos();
  }, [subLoading, fetchCursos]);

  const setField = <K extends keyof CursoForm>(key: K, value: CursoForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const openCreate = () => {
    setDrawerMode('create');
    setEditingId(null);
    setForm(emptyForm());
    setDirty(false);
    setTouched(false);
    setDrawerOpen(true);
  };

  const openEdit = (curso: CursoPresencial) => {
    setDrawerMode('edit');
    setEditingId(curso.id);
    setForm({
      titulo: curso.titulo,
      ementa: curso.ementa ?? '',
      data_inicio: isoToLocalDatetime(curso.data_inicio),
      data_fim: isoToLocalDatetime(curso.data_fim),
      max_participantes: curso.max_participantes != null ? String(curso.max_participantes) : '',
      valor_mensalidade_padrao: toNum(curso.valor_mensalidade_padrao) ?? 0,
      local: curso.local ?? '',
      observacoes: curso.observacoes ?? '',
      is_active: curso.is_active,
      gerar_mensalidade: curso.gerar_mensalidade,
      tipo_formulario: curso.tipo_formulario || 'simples',
      chave_pix: curso.chave_pix ?? '',
    });
    setDirty(false);
    setTouched(false);
    setDrawerOpen(true);
  };

  const handleCopyLink = (curso: CursoPresencial) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/public/cursos/${curso.id}/inscricao`;
    if (!navigator.clipboard) {
      showInfo(`Link: ${link}`);
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => showSuccess('Link de inscrição copiado!'),
      () => showInfo(`Link: ${link}`),
    );
  };

  const handleSave = async () => {
    setTouched(true);
    if (!form.titulo.trim() || !form.data_inicio) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    const maxPart = parseInt(form.max_participantes, 10);
    const payload = {
      titulo: form.titulo.trim(),
      ementa: form.ementa.trim() || null,
      data_inicio: new Date(form.data_inicio).toISOString(),
      data_fim: form.data_fim ? new Date(form.data_fim).toISOString() : null,
      max_participantes: Number.isFinite(maxPart) && maxPart > 0 ? maxPart : null,
      valor_mensalidade_padrao: form.valor_mensalidade_padrao > 0 ? form.valor_mensalidade_padrao : null,
      local: form.local.trim() || null,
      observacoes: form.observacoes.trim() || null,
      is_active: form.is_active,
      gerar_mensalidade: form.gerar_mensalidade,
      tipo_formulario: form.tipo_formulario || 'simples',
      chave_pix: form.chave_pix.trim() || null,
    };
    try {
      if (drawerMode === 'create') {
        await apiClient.post(API_PREFIX, payload);
        showSuccess('Curso criado.');
      } else if (editingId) {
        await apiClient.put(`${API_PREFIX}/${editingId}`, payload);
        showSuccess('Curso atualizado.');
      }
      setDrawerOpen(false);
      setDirty(false);
      fetchCursos();
    } catch {
      showError('Erro ao salvar o curso.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`${API_PREFIX}/${deleteTarget.id}`);
      showSuccess('Curso excluído.');
      fetchCursos();
    } catch {
      showError('Erro ao excluir o curso.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const goParticipantes = (curso: CursoPresencial) =>
    router.push(`/admin/cursos-presenciais/${curso.id}/participantes`);

  const RowActions = ({ curso }: { curso: CursoPresencial }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${curso.titulo}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => goParticipantes(curso)}>
          <Users />
          Participantes
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleCopyLink(curso)}>
          <Link2 />
          Copiar link de inscrição
        </DropdownMenuItem>
        {(canEdit || canDelete) && <DropdownMenuSeparator />}
        {canEdit && (
          <DropdownMenuItem onSelect={() => openEdit(curso)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(curso)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = useMemo<ColumnDef<CursoPresencial>[]>(
    () => [
      {
        accessorKey: 'titulo',
        header: 'Título',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.titulo}</span>
            {row.original.local && <span className="truncate text-xs text-muted-foreground">{row.original.local}</span>}
          </div>
        ),
      },
      {
        accessorKey: 'data_inicio',
        header: 'Início',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ getValue }) => formatDateTimeBr(getValue<string>()),
      },
      {
        accessorKey: 'data_fim',
        header: 'Fim',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ getValue }) => formatDateTimeBr(getValue<string | null>()),
      },
      {
        accessorKey: 'max_participantes',
        header: 'Vagas',
        meta: { align: 'right' },
        cell: ({ getValue }) => getValue<number | null>() ?? '—',
      },
      {
        accessorKey: 'valor_mensalidade_padrao',
        header: 'Mensalidade',
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.gerar_mensalidade ? formatBRL(toNum(row.original.valor_mensalidade_padrao)) : <span className="text-muted-foreground">Sem cobrança</span>,
      },
      {
        accessorKey: 'tipo_formulario',
        header: 'Formulário',
        cell: ({ getValue }) =>
          getValue<string>() === 'completo' ? <Badge variant="outline">Completo</Badge> : <Badge variant="secondary">Simples</Badge>,
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ getValue }) => <StatusBadge ativo={getValue<boolean>()} />,
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <RowActions curso={row.original} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete],
  );

  const renderCard = (curso: CursoPresencial) => (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{curso.titulo}</span>
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge ativo={curso.is_active} />
          {curso.tipo_formulario === 'completo' ? (
            <Badge variant="outline">Formulário completo</Badge>
          ) : (
            <Badge variant="secondary">Formulário simples</Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTimeBr(curso.data_inicio)}
          {curso.local ? ` · ${curso.local}` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {curso.max_participantes ? `${curso.max_participantes} vagas` : 'Vagas ilimitadas'}
          {curso.gerar_mensalidade ? ` · ${formatBRL(toNum(curso.valor_mensalidade_padrao))}/mês` : ''}
        </span>
        <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => goParticipantes(curso)}>
          <Users />
          Participantes
        </Button>
      </div>
      <RowActions curso={curso} />
    </div>
  );

  if (subLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!isPlanAllowed) return <PlanLocked feature="Cursos Presenciais" minPlan={minPlanFor('site_builder').label} />;
  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar cursos presenciais." />;

  const tituloErro = touched && !form.titulo.trim() ? 'Informe o título' : undefined;
  const inicioErro = touched && !form.data_inicio ? 'Informe a data de início' : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cursos presenciais"
        subtitle="Turmas, inscrições públicas e participantes"
        className="mb-0"
        actions={
          canInsert && (
            <Button onClick={openCreate}>
              <Plus />
              Novo curso
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={cursos}
        getRowId={(c) => c.id}
        loading={loading}
        pageSize={20}
        renderCard={renderCard}
        emptyIcon={<IconCurso />}
        emptyMessage="Nenhum curso cadastrado."
        emptyDescription={canInsert ? 'Crie o primeiro curso e compartilhe o link de inscrição.' : undefined}
      />

      <CrudDrawer
        title={drawerMode === 'create' ? 'Novo curso' : 'Editar curso'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre um novo curso presencial para o seu terreiro.'
            : 'Altere as informações do curso presencial selecionado.'
        }
        icon={<IconCurso />}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        saving={saving}
        isDirty={dirty}
      >
        <div className="flex flex-col gap-4">
          <TextField label="Título" required value={form.titulo} onChange={(e) => setField('titulo', e.target.value)} error={tituloErro} />
          <TextField label="Ementa" multiline rows={3} value={form.ementa} onChange={(e) => setField('ementa', e.target.value)} />
          <DateTimeField label="Início" required value={form.data_inicio} onChange={(v) => setField('data_inicio', v)} error={inicioErro} />
          <DateTimeField
            label="Término"
            value={form.data_fim}
            min={form.data_inicio?.slice(0, 10)}
            onChange={(v) => setField('data_fim', v)}
          />
          <TextField
            label="Limite de participantes"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.max_participantes}
            onChange={(e) => setField('max_participantes', e.target.value.replace(/\D/g, ''))}
            helperText="Deixe em branco para vagas ilimitadas."
          />
          <TextField label="Local" value={form.local} onChange={(e) => setField('local', e.target.value)} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="curso-tipo-form">Formulário de inscrição</Label>
            <Select value={form.tipo_formulario} onValueChange={(v) => setField('tipo_formulario', v)}>
              <SelectTrigger id="curso-tipo-form" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simples">Simples (sem endereço/saúde)</SelectItem>
                <SelectItem value="completo">Completo (com endereço, emergência e saúde)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TextField
            label="Chave PIX para inscrição/matrícula"
            value={form.chave_pix}
            onChange={(e) => setField('chave_pix', e.target.value)}
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex flex-col">
              <Label htmlFor="curso-gerar-mensalidade">Gerar cobrança mensal</Label>
              <span className="text-xs text-muted-foreground">Controle mês a mês na tela de participantes.</span>
            </div>
            <Switch
              id="curso-gerar-mensalidade"
              checked={form.gerar_mensalidade}
              onCheckedChange={(v) => setField('gerar_mensalidade', v)}
            />
          </div>
          {form.gerar_mensalidade && (
            <MoneyInput
              label="Mensalidade padrão"
              value={form.valor_mensalidade_padrao}
              onChange={(v) => setField('valor_mensalidade_padrao', v)}
            />
          )}

          <TextField label="Observações" multiline rows={3} value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} />

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="curso-ativo">Curso ativo</Label>
            <Switch id="curso-ativo" checked={form.is_active} onCheckedChange={(v) => setField('is_active', v)} />
          </div>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir curso"
        message={
          <>
            Deseja excluir o curso <strong>{deleteTarget?.titulo}</strong>?
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
