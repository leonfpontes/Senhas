/**
 * Admin Estoque — Grupos de Material (CRUD)
 *
 * Tela piloto da migração MUI → shadcn/ui (M-01, fase 0): layout em Tailwind + primitivas
 * shadcn (Card, Table, Button, Badge, Skeleton, AlertDialog), convivendo com o CrudDrawer
 * do MUI. Cores do terreiro chegam pelos tokens (`bg-primary text-primary-foreground`).
 */
'use client';

import React, { useEffect, useState } from 'react';
import { TextField } from '@/components/fields';
import { PermissionDenied } from '@/components/gates';
import { Boxes, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import AdminLayout from '../admin_layout';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSnackbar } from '../../../contexts/SnackbarContext';
import UpgradePrompt from '../../../components/UpgradePrompt';
import { apiClient } from '../../../services/api_client';
import CrudDrawer from '../../../components/CrudDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { minPlanFor } from '@/constants/plans';

interface Grupo {
  id: string;
  nome: string;
  descricao: string | null;
}

const EMPTY_FORM = { nome: '', descricao: '' };

/** Cabeçalho de tabela no mesmo desenho do MuiTableHead do adminTheme. */
const TABLE_HEAD_CLASS = 'text-[0.72rem] font-bold uppercase tracking-[0.06em] text-muted-foreground';

export default function AdminEstoqueGruposPage() {
  return (
    <AdminLayout title="Grupos de Material">
      <AdminEstoqueGruposContent />
    </AdminLayout>
  );
}

function TableSkeleton() {
  return (
    <Card data-testid="estoque-grupos-loading" className="py-2">
      <CardContent className="flex flex-col gap-3 px-4 py-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function AdminEstoqueGruposContent() {
  const { can, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('estoque', 'view');
  const canInsert = canGroup('estoque', 'insert');
  const canEdit = canGroup('estoque', 'edit');
  const canDelete = canGroup('estoque', 'delete');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Grupo | null>(null);
  const [formData, setFormData] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [deleteTarget, setDeleteTarget] = useState<Grupo | null>(null);

  // loadGrupos isn't memoized — including it would refetch every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGrupos(); }, [canView]);

  const loadGrupos = async () => {
    if (!canView) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await apiClient.get('/api/v1/admin/estoque/grupos');
      setGrupos(res.data);
    } catch {
      showError('Erro ao carregar grupos');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setTouched({});
    setCurrentItem(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (item: Grupo) => {
    setCurrentItem(item);
    setFormData({ nome: item.nome, descricao: item.descricao || '' });
    setTouched({});
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
  };

  const handleSave = async () => {
    setTouched({ nome: true });
    if (!formData.nome.trim()) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;

    setSaving(true);
    try {
      const payload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao.trim() || null,
      };
      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/estoque/grupos', payload);
        showSuccess('Grupo criado com sucesso!');
      } else {
        await apiClient.put(`/api/v1/admin/estoque/grupos/${currentItem!.id}`, payload);
        showSuccess('Grupo atualizado!');
      }
      closeDrawer();
      loadGrupos();
    } catch {
      showError('Erro ao salvar grupo');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !canDelete) return;
    try {
      await apiClient.delete(`/api/v1/admin/estoque/grupos/${deleteTarget.id}`);
      showSuccess('Grupo excluído.');
      loadGrupos();
    } catch {
      showError('Erro ao excluir grupo');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (subLoading) return <div className="mt-16"><TableSkeleton /></div>;
  if (!can('estoque_controle')) return <UpgradePrompt feature="controle de estoque" minPlan={minPlanFor('estoque_controle').label} />;
  if (!canView) {
    return (
      <PermissionDenied
        className="mt-4"
        message="Você não tem permissão para visualizar grupos de material. Contate o administrador do sistema."
      />
    );
  }

  const showActions = canEdit || canDelete;

  return (
    <div>
      <div data-tour="estoque-grupos-header" className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Boxes className="size-6 shrink-0 text-brand" aria-hidden />
          <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">Grupos de Material</h1>
          <Badge variant="outline" className="shrink-0">
            {grupos.length} grupo{grupos.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={loadGrupos} title="Atualizar" aria-label="Atualizar">
            <RefreshCw />
          </Button>
          {canInsert && (
            <Button data-tour="estoque-grupos-novo" onClick={openCreate}>
              <Plus />
              Novo Grupo
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : grupos.length === 0 ? (
        <Card data-testid="estoque-grupos-empty" className="items-center py-8 text-center">
          <CardContent className="flex flex-col items-center gap-2">
            <Boxes className="size-12 text-ghost" aria-hidden />
            <p className="m-0 text-muted-foreground">Nenhum grupo cadastrado. Crie o primeiro!</p>
          </CardContent>
        </Card>
      ) : (
        <Card data-tour="estoque-grupos-tabela" className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TABLE_HEAD_CLASS} px-4`}>Nome</TableHead>
                <TableHead className={`${TABLE_HEAD_CLASS} hidden sm:table-cell`}>Descrição</TableHead>
                {showActions && <TableHead className={`${TABLE_HEAD_CLASS} px-4 text-right`}>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.id} className="hover:bg-accent">
                  <TableCell className="px-4 py-3 font-medium">{g.nome}</TableCell>
                  <TableCell className="hidden py-3 whitespace-normal text-muted-foreground sm:table-cell">
                    {g.descricao || '—'}
                  </TableCell>
                  {showActions && (
                    <TableCell className="px-4 py-2 text-right">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(g)}
                          title="Editar"
                          aria-label={`Editar ${g.nome}`}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(g)}
                          title="Excluir"
                          aria-label={`Excluir ${g.nome}`}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Drawer — MUI, de propósito: prova a convivência das duas bibliotecas */}
      <CrudDrawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Novo Grupo' : 'Editar Grupo'}
        onClose={closeDrawer}
        onSave={handleSave}
        saving={saving}
      >
        <TextField
          label="Nome do grupo"
          required
          fullWidth
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
          onBlur={() => setTouched({ ...touched, nome: true })}
          error={touched.nome && !formData.nome.trim()}
          helperText={touched.nome && !formData.nome.trim() ? 'Nome obrigatório' : ''}
          className="mb-4"
        />
        <TextField
          label="Descrição"
          fullWidth
          multiline
          rows={3}
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
        />
      </CrudDrawer>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o grupo <strong className="text-foreground">{deleteTarget?.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
