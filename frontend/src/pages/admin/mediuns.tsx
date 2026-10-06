/**
 * Admin Médiuns e Cambones — lista (DataTable, cartões no celular) + Sheet de cadastro
 * com busca de CEP via ViaCEP. Fora do plano a lista continua visível só para consulta.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Cake,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import { usePermissions } from '../../hooks/usePermissions';
import { useSnackbar } from '../../contexts/SnackbarContext';
import { apiClient } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { DateField, MaskedInput, TextField, unmask } from '@/components/fields';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { maskTelefone } from '@/components/shared/MaskedInput';
import { todayBr } from '@/lib/dateBr';

// ── Types ─────────────────────────────────────────────────────────────

interface Medium {
  id: string;
  nome: string;
  is_atendimento: boolean;
  is_active: boolean;
  data_entrada?: string | null;
  data_saida?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
  created_at: string;
}

interface FormData {
  nome: string;
  is_atendimento: boolean;
  is_active: boolean;
  data_entrada: string;
  data_saida: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  observacoes: string;
}

const EMPTY_FORM: FormData = {
  nome: '',
  is_atendimento: false,
  is_active: true,
  data_entrada: '',
  data_saida: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  observacoes: '',
};

// ── Tempo de casa ────────────────────────────────────────────────────

/** Tempo entre data_entrada e (data_saida ou hoje) como "X anos e Y meses". */
export function formatTempoCasa(dataEntrada?: string | null, dataSaida?: string | null, isActive = true): string {
  if (!dataEntrada) return '—';
  const start = new Date(`${dataEntrada}T00:00:00`);
  const end = !isActive && dataSaida ? new Date(`${dataSaida}T00:00:00`) : new Date();
  if (end < start) return '—';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years === 0 && months === 0) return 'Menos de 1 mês';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ano${years > 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} ${months > 1 ? 'meses' : 'mês'}`);
  return parts.join(' e ');
}

/** Tempo de casa em ms — quanto maior, mais antigo. Sem data_entrada vai para o fim. */
function tempoCasaSortKey(m: Medium): number {
  if (!m.data_entrada) return -Infinity;
  const start = new Date(`${m.data_entrada}T00:00:00`).getTime();
  const end = !m.is_active && m.data_saida ? new Date(`${m.data_saida}T00:00:00`).getTime() : Date.now();
  return end - start;
}

function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ── Barra de cota ────────────────────────────────────────────────────

function MediunsUsageBar({ used, max, showUpgradeLink }: { used: number; max: number; showUpgradeLink: boolean }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const atLimit = used >= max;
  return (
    <div
      className={`rounded-lg border bg-card p-4 ${atLimit ? 'border-warning' : ''}`}
      role="group"
      aria-label="Cota de médiuns do plano"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">Médiuns cadastrados</span>
        <span className={`text-sm font-bold ${atLimit ? 'text-warning' : 'text-foreground'}`}>
          {used} / {max}
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={`${used} de ${max} médiuns`}
        className={atLimit || pct >= 80 ? '[&>[data-slot=progress-indicator]]:bg-warning' : undefined}
      />
      {atLimit && (
        <p className="mt-2 text-xs text-warning">
          Limite de médiuns do plano atingido.
          {showUpgradeLink && (
            <>
              {' '}
              <Link href="/admin/billing" className="font-semibold underline underline-offset-2">
                Faça upgrade
              </Link>{' '}
              para cadastrar mais.
            </>
          )}
        </p>
      )}
    </div>
  );
}

// ── Page wrapper ───────────────────────────────────────────────────────

export default function AdminMediunsPage() {
  return (
    <AdminLayout title="Médiuns e Cambones">
      <MediunsContent />
    </AdminLayout>
  );
}

// ── Content ────────────────────────────────────────────────────────────

function MediunsContent() {
  const { can, loading: subLoading, subscription, canCreateMedium: canCreateMediumFn } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('mediuns', 'view');
  // Fora do plano (gratuito, ou fim do trial) os médiuns já cadastrados continuam visíveis
  // só para consulta. Criar, editar e excluir exigem plano.
  const planAllows = can('mediuns');
  const readOnlyByPlan = !subLoading && !planAllows;
  const canInsert = planAllows && canGroup('mediuns', 'insert');
  const canEdit = planAllows && canGroup('mediuns', 'edit');
  const canDelete = planAllows && canGroup('mediuns', 'delete');

  const [mediuns, setMediuns] = useState<Medium[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Aniversariantes: id → dias até o aniversário
  const [birthdayMap, setBirthdayMap] = useState<Map<string, number>>(new Map());
  const [filterAniversariantes, setFilterAniversariantes] = useState(false);

  // Sheet
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Medium | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // CEP
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const numeroRef = useRef<HTMLInputElement>(null);

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState<Medium | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (includeInactive) params.append('include_inactive', 'true');
      const res = await apiClient.get<Medium[]>(`/api/v1/admin/mediuns?${params}`);
      setMediuns(res.data);
    } catch {
      showError('Erro ao carregar médiuns');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeInactive, canView, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (subLoading || !can('mediuns')) return;
    apiClient
      .get<{ id: string; dias_ate_aniversario: number }[]>('/api/v1/admin/mediuns/aniversariantes?dias=7')
      .then((res) => {
        const entries = Array.isArray(res.data) ? res.data : [];
        setBirthdayMap(new Map(entries.map((e) => [e.id, e.dias_ate_aniversario])));
      })
      .catch(() => {
        /* não crítico */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subLoading]);

  // ── CEP (ViaCEP) ─────────────────────────────────────────────────────

  const lookupCep = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepError(digits.length > 0 ? 'CEP deve ter 8 dígitos' : '');
      return;
    }
    setCepError('');
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await resp.json();
      if (json.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        cep: maskCep(digits),
        logradouro: json.logradouro || '',
        bairro: json.bairro || '',
        cidade: json.localidade || '',
      }));
      setTimeout(() => numeroRef.current?.focus(), 50);
    } catch {
      setCepError('Erro ao consultar CEP. Verifique sua conexão.');
    } finally {
      setCepLoading(false);
    }
  };

  // ── Sheet helpers ───────────────────────────────────────────────────

  const toForm = (m: Medium): FormData => ({
    nome: m.nome,
    is_atendimento: m.is_atendimento,
    is_active: m.is_active,
    data_entrada: m.data_entrada ?? '',
    data_saida: m.data_saida ?? '',
    telefone: m.telefone ? maskTelefone(m.telefone) : '',
    email: m.email ?? '',
    data_nascimento: m.data_nascimento ?? '',
    cep: m.cep ? maskCep(m.cep) : '',
    logradouro: m.logradouro ?? '',
    numero: m.numero ?? '',
    bairro: m.bairro ?? '',
    cidade: m.cidade ?? '',
    observacoes: m.observacoes ?? '',
  });

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setOriginalData(EMPTY_FORM);
    setCurrentItem(null);
    setTouched({});
    setCepError('');
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (m: Medium) => {
    const f = toForm(m);
    setFormData(f);
    setOriginalData(f);
    setCurrentItem(m);
    setTouched({});
    setCepError('');
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
    setFormData(EMPTY_FORM);
    setTouched({});
    setCepError('');
  };

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => {
      // Ao inativar, sugere a data de saída de hoje; ao reativar, limpa a data de saída.
      if (field === 'is_active') {
        if (value === false && !prev.data_saida) return { ...prev, is_active: false, data_saida: todayBr() };
        if (value === true && prev.data_saida) return { ...prev, is_active: true, data_saida: '' };
      }
      return { ...prev, [field]: value };
    });
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? Object.entries(formData).some(([k, v]) => v !== EMPTY_FORM[k as keyof FormData])
      : JSON.stringify(formData) !== JSON.stringify(originalData);

  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const saveDisabled = !formData.nome.trim();

  const handleSave = async () => {
    setTouched((p) => ({ ...p, nome: true }));
    if (saveDisabled) return;
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: formData.nome.trim(),
        is_atendimento: formData.is_atendimento,
        data_entrada: formData.data_entrada || null,
        telefone: unmask(formData.telefone) || null,
        email: formData.email.trim() || null,
        data_nascimento: formData.data_nascimento || null,
        cep: formData.cep.replace(/\D/g, '') || null,
        logradouro: formData.logradouro.trim() || null,
        numero: formData.numero.trim() || null,
        bairro: formData.bairro.trim() || null,
        cidade: formData.cidade.trim() || null,
        observacoes: formData.observacoes.trim() || null,
      };

      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/mediuns', payload);
        showSuccess('Médium criado com sucesso!');
      } else if (currentItem) {
        await apiClient.patch(`/api/v1/admin/mediuns/${currentItem.id}`, {
          ...payload,
          is_active: formData.is_active,
          data_saida: formData.data_saida || null,
        });
        showSuccess('Médium atualizado com sucesso!');
      }
      closeDrawer();
      load();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'Erro ao salvar médium');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/admin/mediuns/${deleteTarget.id}`);
      setDeleteTarget(null);
      showSuccess('Médium removido com sucesso!');
      load();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'Erro ao remover médium');
    } finally {
      setDeleting(false);
    }
  };

  // ── Linhas ──────────────────────────────────────────────────────────

  const rows = useMemo(
    () => mediuns.filter((m) => !filterAniversariantes || birthdayMap.has(m.id)),
    [mediuns, filterAniversariantes, birthdayMap],
  );

  const birthdayLabel = (id: string): string | null => {
    const dias = birthdayMap.get(id);
    if (dias === undefined) return null;
    if (dias === 0) return 'Hoje';
    if (dias === 1) return 'Amanhã';
    return `Em ${dias} dias`;
  };

  const showActions = canEdit || canDelete;

  const RowActions = ({ m }: { m: Medium }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${m.nome}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={() => openEdit(m)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(m)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = useMemo<ColumnDef<Medium>[]>(() => {
    const cols: ColumnDef<Medium>[] = [
      {
        accessorKey: 'nome',
        header: 'Nome',
        cell: ({ row }) => {
          const m = row.original;
          const bday = birthdayLabel(m.id);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="flex flex-wrap items-center gap-1.5 font-medium">
                <span className="truncate">{m.nome}</span>
                {bday && (
                  <Badge variant={birthdayMap.get(m.id) === 0 ? 'destructive' : 'outline'} className="gap-1">
                    <Cake aria-hidden /> {bday}
                  </Badge>
                )}
              </span>
              {m.email && <span className="truncate text-xs text-muted-foreground">{m.email}</span>}
            </div>
          );
        },
      },
      {
        accessorKey: 'telefone',
        header: 'Telefone',
        enableSorting: false,
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? maskTelefone(v) : '—';
        },
      },
      { accessorKey: 'cidade', header: 'Cidade', cell: ({ getValue }) => getValue<string | null>() || '—' },
      {
        accessorKey: 'is_atendimento',
        header: 'Função',
        cell: ({ getValue }) =>
          getValue<boolean>() ? <Badge>Médium</Badge> : <Badge variant="secondary">Cambone</Badge>,
      },
      {
        id: 'tempo_casa',
        header: 'Tempo de casa',
        accessorFn: (m) => tempoCasaSortKey(m),
        cell: ({ row }) => formatTempoCasa(row.original.data_entrada, row.original.data_saida, row.original.is_active),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <Badge className="border-transparent bg-success text-success-foreground">Ativo</Badge>
          ) : (
            <Badge variant="outline">Inativo</Badge>
          ),
      },
    ];
    if (showActions) {
      cols.push({
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <RowActions m={row.original} />,
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthdayMap, showActions, canEdit, canDelete]);

  const renderCard = (m: Medium) => {
    const bday = birthdayLabel(m.id);
    return (
      <div className="flex items-start gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="truncate">{m.nome}</span>
            {bday && (
              <Badge variant={birthdayMap.get(m.id) === 0 ? 'destructive' : 'outline'} className="gap-1">
                <Cake aria-hidden /> {bday}
              </Badge>
            )}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {m.is_atendimento ? <Badge>Médium</Badge> : <Badge variant="secondary">Cambone</Badge>}
            {m.is_active ? (
              <Badge className="border-transparent bg-success text-success-foreground">Ativo</Badge>
            ) : (
              <Badge variant="outline">Inativo</Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {m.telefone ? maskTelefone(m.telefone) : 'Sem telefone'}
            {m.cidade ? ` · ${m.cidade}` : ''}
            {m.data_entrada ? ` · ${formatTempoCasa(m.data_entrada, m.data_saida, m.is_active)} de casa` : ''}
          </span>
        </div>
        {showActions && <RowActions m={m} />}
      </div>
    );
  };

  // ── Gates ───────────────────────────────────────────────────────────

  if (!canView) return <PermissionDenied message="Você não tem permissão para visualizar médiuns e cambones." />;

  const hasAnyMedium =
    mediuns.length > 0 || (subscription?.current_mediuns ?? 0) > 0 || !!debouncedSearch || includeInactive;
  if (readOnlyByPlan && !loading && !hasAnyMedium) {
    return <PlanLocked feature="Médiuns e Cambones" minPlan="Basic" />;
  }

  // Usa a contagem do servidor para não liberar criação com a lista filtrada pela busca.
  const canCreate = canCreateMediumFn(subscription?.current_mediuns ?? mediuns.length);
  const maxMediuns = subscription?.max_mediuns ?? 0;
  const showUsage = !!subscription && maxMediuns > 0 && maxMediuns < 999999;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="mediuns-header">
        <PageHeader
          title="Médiuns e Cambones"
          subtitle="Corrente da casa: quem atende e quem auxilia"
          actions={
            <>
              <Button variant="outline" onClick={load} disabled={loading} aria-label="Atualizar lista">
                <RefreshCw className={loading ? 'animate-spin' : undefined} />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>
              {canInsert && (
                <Button
                  data-tour="mediuns-novo"
                  onClick={openCreate}
                  disabled={!canCreate}
                  title={!canCreate ? `Limite de ${maxMediuns} médiuns do plano atingido` : undefined}
                >
                  <Plus />
                  Novo
                </Button>
              )}
            </>
          }
        />
      </div>

      {readOnlyByPlan && (
        <Alert variant="info" data-testid="mediuns-somente-leitura">
          <AlertDescription>
            Seus médiuns e cambones continuam aqui para consulta. Para cadastrar, editar ou excluir,{' '}
            <Link href="/admin/billing" className="font-semibold underline underline-offset-2">
              assine um plano
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {showUsage && (
        <div data-tour="mediuns-usage">
          <MediunsUsageBar
            used={subscription?.current_mediuns ?? 0}
            max={maxMediuns}
            showUpgradeLink={!readOnlyByPlan}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div data-tour="mediuns-busca" className="w-full sm:w-80">
          <TextField
            aria-label="Buscar por nome"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startAdornment={<Search />}
            size="small"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="mediuns-inativos" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="mediuns-inativos" className="text-sm font-normal">
              Incluir inativos
            </Label>
          </div>
          {birthdayMap.size > 0 && (
            <Button
              type="button"
              variant={filterAniversariantes ? 'default' : 'outline'}
              size="sm"
              aria-pressed={filterAniversariantes}
              onClick={() => setFilterAniversariantes((p) => !p)}
            >
              <Cake />
              {birthdayMap.size} aniversariante{birthdayMap.size > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>

      <div data-tour="mediuns-tabela">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(m) => m.id}
          loading={loading}
          pageSize={25}
          renderCard={renderCard}
          emptyIcon={<Sparkles className="size-10 text-ghost" aria-hidden />}
          emptyMessage={
            debouncedSearch || filterAniversariantes
              ? 'Nenhum médium encontrado para o filtro.'
              : 'Nenhum médium cadastrado.'
          }
          emptyDescription={!debouncedSearch && canInsert ? 'Clique em "Novo" para cadastrar o primeiro.' : undefined}
        />
      </div>

      <CrudDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'Novo médium ou cambone' : 'Editar médium ou cambone'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre um novo integrante da corrente.'
            : 'Altere as informações do integrante selecionado.'
        }
        icon={<Sparkles />}
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

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Função na corrente</legend>
            <RadioGroup
              value={formData.is_atendimento ? 'medium' : 'cambone'}
              onValueChange={(v) => handleChange('is_atendimento', v === 'medium')}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="funcao-medium"
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id="funcao-medium" value="medium" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Médium</span>
                  <span className="text-xs font-normal text-muted-foreground">Atende na gira</span>
                </span>
              </Label>
              <Label
                htmlFor="funcao-cambone"
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id="funcao-cambone" value="cambone" className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Cambone</span>
                  <span className="text-xs font-normal text-muted-foreground">Auxilia, sem atendimento</span>
                </span>
              </Label>
            </RadioGroup>
          </fieldset>

          {drawerMode === 'edit' && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="medium-ativo" className="font-medium">
                Ativo na casa
              </Label>
              <Switch
                id="medium-ativo"
                checked={formData.is_active}
                onCheckedChange={(v) => handleChange('is_active', v)}
              />
            </div>
          )}

          <Accordion type="multiple" defaultValue={['vinculo', 'contato']} className="w-full">
            <AccordionItem value="vinculo">
              <AccordionTrigger>Vínculo com a casa</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                <DateField
                  label="Data de entrada na casa"
                  value={formData.data_entrada || null}
                  onChange={(iso) => handleChange('data_entrada', iso ?? '')}
                  helperText="Opcional — usada para calcular o tempo de casa"
                />
                {drawerMode === 'edit' && !formData.is_active && (
                  <DateField
                    label="Data de saída da casa"
                    value={formData.data_saida || null}
                    onChange={(iso) => handleChange('data_saida', iso ?? '')}
                    helperText="Preenchida automaticamente ao inativar — pode ser ajustada"
                  />
                )}
                {formData.data_entrada && (
                  <p className="text-sm text-muted-foreground">
                    Tempo de casa:{' '}
                    <strong className="text-foreground">
                      {formatTempoCasa(formData.data_entrada, formData.data_saida, formData.is_active)}
                    </strong>
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="contato">
              <AccordionTrigger>Contato</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                <MaskedInput
                  mask="telefone"
                  label="Telefone"
                  value={formData.telefone}
                  onChange={(v) => handleChange('telefone', v)}
                  placeholder="(DDD) 99999-9999"
                  helperText="Opcional"
                />
                <TextField
                  label="E-mail"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  helperText="Opcional"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pessoais">
              <AccordionTrigger>Dados pessoais</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                <DateField
                  label="Data de nascimento"
                  value={formData.data_nascimento || null}
                  onChange={(iso) => handleChange('data_nascimento', iso ?? '')}
                  helperText="Opcional — usada para o aviso de aniversariantes"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="endereco">
              <AccordionTrigger>Endereço</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                <TextField
                  label="CEP"
                  value={formData.cep}
                  onChange={(e) => {
                    handleChange('cep', maskCep(e.target.value));
                    setCepError('');
                  }}
                  onBlur={() => {
                    if (formData.cep) lookupCep(formData.cep);
                  }}
                  inputMode="numeric"
                  placeholder="00000-000"
                  error={cepError}
                  helperText="Digite o CEP para preencher o endereço automaticamente"
                  endAdornment={
                    cepLoading ? (
                      <Loader2 className="animate-spin" aria-label="Consultando CEP" />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Buscar CEP"
                        onClick={() => lookupCep(formData.cep)}
                      >
                        <Search />
                      </Button>
                    )
                  }
                />
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <TextField
                    label="Logradouro"
                    value={formData.logradouro}
                    onChange={(e) => handleChange('logradouro', e.target.value)}
                  />
                  <TextField
                    label="Número"
                    value={formData.numero}
                    onChange={(e) => handleChange('numero', e.target.value)}
                    inputRef={numeroRef}
                    maxLength={20}
                  />
                </div>
                <TextField
                  label="Bairro"
                  value={formData.bairro}
                  onChange={(e) => handleChange('bairro', e.target.value)}
                />
                <TextField
                  label="Cidade"
                  value={formData.cidade}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="observacoes">
              <AccordionTrigger>Observações</AccordionTrigger>
              <AccordionContent>
                <TextField
                  label="Observações"
                  value={formData.observacoes}
                  onChange={(e) => handleChange('observacoes', e.target.value)}
                  multiline
                  rows={3}
                  helperText="Informações adicionais sobre o integrante"
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CrudDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir médium"
        message={
          <>
            Deseja realmente excluir <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
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
