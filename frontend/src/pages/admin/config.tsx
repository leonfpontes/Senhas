/**
 * /admin/config — configurações do terreiro: identidade visual, funcionalidades e atendimento.
 * Barra "Salvar" fixa no rodapé quando há alteração; 6 paletas prontas além do hex; recurso
 * fora do plano abre um Dialog com link para /admin/billing?plan=<mínimo>.
 * Nome do terreiro é só leitura: `PUT /tenant/config` não aceita `name`.
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CircleAlert, CloudUpload, DoorOpen, Lock, Palette, Plus, Save, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react';
import AdminLayout from './admin_layout';
import { PageHeader } from '@/components/admin';
import { PermissionDenied, ReadOnlyNotice } from '@/components/gates';
import { TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';
import { useSubscription, type PlanFeatures } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { minPlanFor, type PlanFeatureKey } from '@/constants/plans';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TenantConfig {
  tenant_nome?: string | null;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  custom_settings?: Record<string, unknown> | null;
  reply_to_email?: string | null;
  email_signature?: string | null;
  endereco?: string | null;
  enable_analytics: boolean;
  enable_walk_in: boolean;
  validate_associado_on_emit: boolean;
  sponsor_priority_mode?: string;
  enable_estoque_log?: boolean;
  enable_mensalidade_associado?: boolean;
  enable_waitlist?: boolean;
  enable_time_slot_scheduling?: boolean;
}

interface TimeSlotTemplateItem {
  id: string;
  horario: string; // "HH:MM:SS"
  capacidade_maxima: number;
  ordem: number;
}

type BoolField =
  | 'enable_analytics'
  | 'enable_walk_in'
  | 'validate_associado_on_emit'
  | 'enable_estoque_log'
  | 'enable_mensalidade_associado'
  | 'enable_waitlist'
  | 'enable_time_slot_scheduling';

// ─── Constantes ───────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const isValidHex = (v: string) => HEX_COLOR_RE.test(v.trim());

const FEATURE_ITEMS: { field: BoolField; title: string; description: string; gate?: keyof PlanFeatures }[] = [
  {
    field: 'enable_walk_in',
    title: 'Senha na hora, na porta',
    description: 'Quem chegou sem senha recebe uma na Porta, sem passar pelo link.',
  },
  {
    field: 'enable_waitlist',
    title: 'Fila de espera',
    description: 'Quando a gira lota, novos pedidos entram na espera e sobem sozinhos se alguém cancelar.',
    gate: 'fila_espera',
  },
  {
    field: 'enable_time_slot_scheduling',
    title: 'Senha com horário marcado',
    description: 'O consulente escolhe um horário ao pegar a senha, e a porta não acumula gente. Os horários padrão ficam logo abaixo.',
    gate: 'agendamento_por_horario',
  },
  {
    field: 'validate_associado_on_emit',
    title: 'Só associado pega senha',
    description: 'Exige que a pessoa seja associada do terreiro para tirar senha pelo link.',
    gate: 'associados',
  },
  {
    field: 'enable_mensalidade_associado',
    title: 'Mensalidade dos associados',
    description: 'Liga a cobrança mensal dos associados no financeiro.',
    gate: 'mensalidade_associado',
  },
  {
    field: 'enable_estoque_log',
    title: 'Histórico do estoque',
    description: 'Guarda cada entrada e saída de material.',
    gate: 'estoque_controle',
  },
  {
    field: 'enable_analytics',
    title: 'Relatórios de atendimento',
    description: 'Gráficos de senhas por período e horários de pico.',
    gate: 'analytics_basico',
  },
];

const PRIORITY_OPTIONS = [
  { value: 'first', title: 'Associados primeiro', description: 'Associados são chamados antes dos demais, independente da chegada.' },
  { value: 'interleave', title: 'Intercalar na fila', description: 'Um associado é chamado a cada atendimento da fila geral.' },
];

interface Palette {
  name: string;
  primary: string;
  secondary: string;
  font: string;
}

/** Paletas prontas: cores com contraste bom com a fonte indicada. */
const PALETTES: Palette[] = [
  { name: 'Índigo', primary: '#4F46E5', secondary: '#EC4899', font: '#FFFFFF' },
  { name: 'Mata', primary: '#15803D', secondary: '#84CC16', font: '#FFFFFF' },
  { name: 'Mar', primary: '#0E7490', secondary: '#38BDF8', font: '#FFFFFF' },
  { name: 'Terra', primary: '#9A3412', secondary: '#F59E0B', font: '#FFFFFF' },
  { name: 'Vinho', primary: '#9F1239', secondary: '#F472B6', font: '#FFFFFF' },
  { name: 'Noite', primary: '#1E1B4B', secondary: '#A78BFA', font: '#FFFFFF' },
];

const BRANDING_IMPACT = ['Menu e topo do painel', 'Página pública de senha', 'Site do terreiro', 'E-mails de confirmação'];

const getFontColor = (config: TenantConfig | null): string => {
  const raw =
    config?.custom_settings && typeof config.custom_settings === 'object'
      ? (config.custom_settings as Record<string, unknown>).font_color
      : undefined;
  return typeof raw === 'string' ? raw : '#FFFFFF';
};

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function ColorField({
  label,
  help,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            'relative size-9 shrink-0 overflow-hidden rounded-md border',
            error ? 'border-destructive' : 'border-input',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          )}
          style={{ backgroundColor: isValidHex(value) ? value : undefined }}
        >
          <span className="sr-only">Escolher {label.toLowerCase()} no seletor</span>
          <input
            type="color"
            value={isValidHex(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            disabled={disabled}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            tabIndex={-1}
          />
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={7}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-help`}
          className="bg-input-bg font-mono text-sm"
        />
      </div>
      <p id={`${id}-help`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error || help}
      </p>
    </div>
  );
}

function FeatureToggle({
  title,
  description,
  minPlanLabel,
  checked,
  locked,
  disabled,
  onChange,
  onLockedClick,
}: {
  title: string;
  description: string;
  minPlanLabel?: string;
  checked: boolean;
  locked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  onLockedClick: () => void;
}) {
  const id = React.useId();
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          {locked && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
          <Label htmlFor={id} className={cn('cursor-pointer text-sm font-semibold', locked && 'text-muted-foreground')}>
            {title}
          </Label>
          {minPlanLabel && <Badge variant={locked ? 'outline' : 'default'}>{minPlanLabel}</Badge>}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked && !locked} disabled={locked || disabled} onCheckedChange={onChange} aria-label={title} />
    </>
  );

  if (locked) {
    return (
      <button
        type="button"
        onClick={onLockedClick}
        className="flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left opacity-80 outline-none transition hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={`${title} — disponível a partir do plano ${minPlanLabel}. Ver plano`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border bg-card p-4 transition', checked && 'border-primary bg-primary/5')}>
      {content}
    </div>
  );
}

function TimeSlotTemplateEditor({ canEdit }: { canEdit: boolean }) {
  const { showSuccess, showError } = useSnackbar();
  const [slots, setSlots] = useState<{ horario: string; capacidade_maxima: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<TimeSlotTemplateItem[]>('/api/v1/admin/config/time-slot-templates');
        if (cancelled) return;
        setSlots(res.data.map((t) => ({ horario: t.horario.slice(0, 5), capacidade_maxima: String(t.capacidade_maxima) })));
      } catch {
        // sem horários ainda
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (index: number, field: 'horario' | 'capacidade_maxima', value: string) =>
    setSlots((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const addRow = () => setSlots((prev) => [...prev, { horario: '', capacidade_maxima: '' }]);
  const removeRow = (index: number) => setSlots((prev) => prev.filter((_, i) => i !== index));

  const valid =
    slots.every((s) => s.horario && Number(s.capacidade_maxima) >= 1) && new Set(slots.map((s) => s.horario)).size === slots.length;

  const handleSave = async () => {
    if (!valid || !canEdit) return;
    setSaving(true);
    try {
      const res = await apiClient.put<TimeSlotTemplateItem[]>('/api/v1/admin/config/time-slot-templates', {
        slots: slots.map((s) => ({ horario: s.horario, capacidade_maxima: Number(s.capacidade_maxima) })),
      });
      setSlots(res.data.map((t) => ({ horario: t.horario.slice(0, 5), capacidade_maxima: String(t.capacidade_maxima) })));
      showSuccess('Horários padrão salvos.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível salvar os horários.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-24 w-full" />;

  return (
    <Card className="mt-4">
      <CardContent className="p-5">
        <SectionTitle
          title="Horários padrão"
          description="Entram automaticamente quando você liga o horário marcado numa gira nova — dá para ajustar em cada gira."
        />
        <div className="flex flex-col gap-3">
          {slots.map((slot, index) => (
            <div key={index} className="flex items-end gap-2">
              <TextField
                label="Horário"
                type="time"
                value={slot.horario}
                onChange={(e) => updateRow(index, 'horario', e.target.value)}
                disabled={!canEdit}
                size="small"
              />
              <TextField
                label="Vagas"
                type="number"
                min={1}
                inputMode="numeric"
                value={slot.capacidade_maxima}
                onChange={(e) => updateRow(index, 'capacidade_maxima', e.target.value)}
                disabled={!canEdit}
                size="small"
              />
              {canEdit && (
                <Button type="button" variant="ghost" size="icon-sm" className="mb-0.5 text-destructive" onClick={() => removeRow(index)} aria-label={`Remover horário ${slot.horario || index + 1}`}>
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {slots.length === 0 && <p className="text-sm text-muted-foreground">Nenhum horário padrão ainda.</p>}
          {!valid && slots.length > 0 && (
            <p className="text-xs text-destructive">Preencha todos os horários com pelo menos 1 vaga e sem horário repetido.</p>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus aria-hidden /> Adicionar horário
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving || !valid}>
                {saving ? 'Salvando…' : 'Salvar horários padrão'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  return (
    <AdminLayout title="Configurações" maxWidth="xl">
      {/* Sem TooltipProvider global (o layout ainda é MUI): o Radix exige um provider. */}
      <TooltipProvider delayDuration={200}>
        <AdminConfigContent />
      </TooltipProvider>
    </AdminLayout>
  );
}

function AdminConfigContent() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const canView = canGroup('configuracoes', 'view');
  const canEdit = canGroup('configuracoes', 'edit');

  const [savedConfig, setSavedConfig] = useState<TenantConfig | null>(null);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<{ title: string; gate: PlanFeatureKey } | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const isDirty = useMemo(() => {
    if (!config || !savedConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  const previewPrimary = config?.primary_color || '#4F46E5';
  const previewSecondary = config?.secondary_color || '#EC4899';
  const previewFontColor = getFontColor(config);
  const previewLogo = config?.logo_url?.trim() || '';
  const canTheme = can('tema_personalizado');

  const validationErrors = useMemo(
    () => ({
      primary_color: isValidHex(config?.primary_color ?? '') ? '' : 'Use o formato #RRGGBB',
      secondary_color: isValidHex(config?.secondary_color ?? '') ? '' : 'Use o formato #RRGGBB',
      font_color: isValidHex(previewFontColor) ? '' : 'Use o formato #RRGGBB',
    }),
    [config, previewFontColor],
  );
  const hasErrors = Object.values(validationErrors).some(Boolean);

  const loadConfig = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await apiClient.get<TenantConfig>('/api/v1/admin/tenant/config');
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
    } catch {
      showError('Não foi possível carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }, [canView, showError]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleChange = <K extends keyof TenantConfig>(field: K, value: TenantConfig[K]) =>
    setConfig((prev) => (prev ? { ...prev, [field]: value } : null));

  const setFontColor = (v: string) =>
    handleChange('custom_settings', {
      ...(config?.custom_settings && typeof config.custom_settings === 'object' ? config.custom_settings : {}),
      font_color: v,
    });

  const applyPalette = (p: Palette) => {
    if (!config || !canTheme || !canEdit) return;
    setConfig({
      ...config,
      primary_color: p.primary,
      secondary_color: p.secondary,
      custom_settings: {
        ...(config.custom_settings && typeof config.custom_settings === 'object' ? config.custom_settings : {}),
        font_color: p.font,
      },
    });
  };

  const handleDiscard = () => {
    setConfig(savedConfig);
    setLogoPreviewFailed(false);
  };

  const handleSave = async () => {
    if (!config || hasErrors || !canEdit) return;
    try {
      setSaving(true);
      const res = await apiClient.put<TenantConfig>('/api/v1/admin/tenant/config', {
        primary_color: config.primary_color.trim().toUpperCase(),
        secondary_color: config.secondary_color.trim().toUpperCase(),
        custom_settings: {
          ...(config.custom_settings && typeof config.custom_settings === 'object' ? config.custom_settings : {}),
          font_color: previewFontColor.trim().toUpperCase(),
        },
        enable_analytics: config.enable_analytics,
        enable_walk_in: config.enable_walk_in,
        validate_associado_on_emit: config.validate_associado_on_emit,
        enable_estoque_log: config.enable_estoque_log,
        enable_mensalidade_associado: config.enable_mensalidade_associado,
        enable_waitlist: config.enable_waitlist,
        enable_time_slot_scheduling: config.enable_time_slot_scheduling,
        sponsor_priority_mode: config.sponsor_priority_mode || 'first',
        endereco: config.endereco || '',
      });
      setSavedConfig(res.data);
      setConfig(res.data);
      dispatchTenantBrandingUpdated();
      showSuccess('Configurações salvas.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível salvar as configurações.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!canEdit) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showError('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('A imagem deve ter no máximo 2 MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<TenantConfig>('/api/v1/admin/tenant/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      showSuccess('Logo atualizado.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível enviar o logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadLogo(file);
    if (e.target) e.target.value = '';
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadLogo(file);
  };

  const handleLogoDelete = async () => {
    if (!canEdit) return;
    setUploadingLogo(true);
    try {
      const res = await apiClient.delete<TenantConfig>('/api/v1/admin/tenant/logo');
      setSavedConfig(res.data);
      setConfig(res.data);
      setLogoPreviewFailed(false);
      dispatchTenantBrandingUpdated();
      showSuccess('Logo removido.');
    } catch (e) {
      showError(extractApiErrorMessage(e, 'Não foi possível remover o logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!canView) return <PermissionDenied />;

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando configurações">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!config) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar as configurações do terreiro.</AlertDescription>
      </Alert>
    );
  }

  const showSaveBar = isDirty && canEdit;
  const lockedPlan = lockedFeature ? minPlanFor(lockedFeature.gate) : null;

  return (
    <div className={cn('flex flex-col gap-5', showSaveBar && 'pb-24')}>
      <div data-tour="config-header">
        <PageHeader title="Configurações" subtitle="Identidade visual, funcionalidades e regras de atendimento do terreiro." />
      </div>

      {!canEdit && <ReadOnlyNotice />}

      <Tabs defaultValue="identidade" data-tour="config-tabs">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="identidade">
            <Palette aria-hidden /> <span className="hidden sm:inline">Identidade</span>
            <span className="sm:hidden">Visual</span>
          </TabsTrigger>
          <TabsTrigger value="funcionalidades">
            <SlidersHorizontal aria-hidden /> Funções
          </TabsTrigger>
          <TabsTrigger value="atendimento" disabled={!can('associados')}>
            <DoorOpen aria-hidden /> Atendimento
          </TabsTrigger>
        </TabsList>

        {/* ══ Identidade visual ══ */}
        <TabsContent value="identidade" className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <Card data-tour="config-logo">
              <CardContent className="p-5">
                <SectionTitle title="Nome e logo do terreiro" description="Aparecem no painel e nas páginas públicas." />
                <TextField
                  label="Nome do terreiro"
                  value={config.tenant_nome ?? ''}
                  readOnly
                  helperText="Para mudar o nome, fale com o suporte pelo botão Ajuda."
                  className="mb-4"
                />

                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoInput} className="hidden" />

                {previewLogo && !logoPreviewFailed ? (
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewLogo}
                      alt="Logo do terreiro"
                      onError={() => setLogoPreviewFailed(true)}
                      className="size-20 rounded-lg border bg-accent object-cover"
                    />
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                          <CloudUpload aria-hidden /> {uploadingLogo ? 'Enviando…' : 'Trocar'}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleLogoDelete} disabled={uploadingLogo}>
                          <Trash2 aria-hidden /> Remover
                        </Button>
                      </div>
                    )}
                  </div>
                ) : canEdit ? (
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleLogoDrop}
                    onClick={() => logoInputRef.current?.click()}
                    className={cn(
                      'flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed p-6 text-center outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      dragging ? 'border-primary bg-accent' : 'border-input hover:border-primary/60',
                    )}
                  >
                    <CloudUpload className="size-8 text-muted-foreground" aria-hidden />
                    <span className="text-sm text-muted-foreground">{uploadingLogo ? 'Enviando…' : 'Clique ou arraste para enviar o logo'}</span>
                    <span className="text-xs text-ghost">JPG, PNG ou WEBP · até 2 MB · 200×200 px</span>
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem logo cadastrado.</p>
                )}
              </CardContent>
            </Card>

            <Card data-tour="config-cores">
              <CardContent className="p-5">
                <SectionTitle title="Cores" description="Valem no painel e na página de senha depois de salvar." />

                {!canTheme && (
                  <Alert variant="info" className="mb-4">
                    <Lock aria-hidden />
                    <AlertDescription className="block">
                      Cores e logo personalizados estão disponíveis a partir do plano {minPlanFor('tema_personalizado').label}.{' '}
                      <Link href="/admin/billing?plan=pro" className="font-semibold underline underline-offset-4">
                        Ver planos
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}

                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Paletas prontas</p>
                <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="Paletas prontas">
                  {PALETTES.map((p) => {
                    const active =
                      config.primary_color.toUpperCase() === p.primary && config.secondary_color.toUpperCase() === p.secondary;
                    return (
                      <Tooltip key={p.name}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => applyPalette(p)}
                            disabled={!canTheme || !canEdit}
                            aria-pressed={active}
                            aria-label={`Paleta ${p.name}`}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-lg border p-2 outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                              active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-accent',
                            )}
                          >
                            <span className="flex h-8 w-full overflow-hidden rounded-md" aria-hidden>
                              <span className="flex-1" style={{ backgroundColor: p.primary }} />
                              <span className="flex-1" style={{ backgroundColor: p.secondary }} />
                            </span>
                            <span className="text-[11px] font-medium">{p.name}</span>
                            {active && <Check className="size-3 text-primary" aria-hidden />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{`${p.name}: ${p.primary} + ${p.secondary}`}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Ou escolha cada cor</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField
                    label="Cor principal"
                    help="Botões, destaques e menu."
                    value={config.primary_color}
                    onChange={(v) => handleChange('primary_color', v)}
                    error={validationErrors.primary_color}
                    disabled={!canTheme || !canEdit}
                  />
                  <ColorField
                    label="Cor de apoio"
                    help="Gradientes e detalhes."
                    value={config.secondary_color}
                    onChange={(v) => handleChange('secondary_color', v)}
                    error={validationErrors.secondary_color}
                    disabled={!canTheme || !canEdit}
                  />
                  <ColorField
                    label="Cor do texto no topo"
                    help="Texto sobre a cor principal."
                    value={previewFontColor}
                    onChange={setFontColor}
                    error={validationErrors.font_color}
                    disabled={!canTheme || !canEdit}
                  />
                </div>

                <div className="my-5 h-px bg-border" />

                <SectionTitle title="Endereço" description="Vai nos e-mails de confirmação e no botão “Como chegar”." />
                <TextField
                  label="Endereço"
                  value={config.endereco || ''}
                  onChange={(e) => handleChange('endereco', e.target.value)}
                  placeholder="Rua Exemplo, 123 — Bairro — Cidade/UF"
                  multiline
                  rows={2}
                  disabled={!canEdit}
                />
              </CardContent>
            </Card>
          </div>

          {/* Prévia */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-24" data-tour="config-preview">
            <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg, ${previewPrimary} 0%, ${previewSecondary} 100%)` }}>
              <p className="text-[0.7rem] uppercase tracking-[0.1em]" style={{ color: previewFontColor, opacity: 0.75 }}>
                Prévia
              </p>
              <div className="mt-2 flex items-center gap-3">
                {previewLogo && !logoPreviewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewLogo} alt="" onError={() => setLogoPreviewFailed(true)} className="size-12 rounded-lg border border-white/30 bg-white/15 object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-lg border border-white/30 bg-white/20 text-xl font-bold" style={{ color: previewFontColor }}>
                    {(config.tenant_nome ?? 'T').charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="font-bold leading-tight" style={{ color: previewFontColor }}>
                    {config.tenant_nome || 'Meu terreiro'}
                  </p>
                  <p className="text-xs" style={{ color: previewFontColor, opacity: 0.8 }}>
                    Assim fica o topo do painel
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-md bg-white/90 px-3 py-1.5 text-xs font-bold" style={{ color: previewPrimary }}>
                  Pegar senha
                </span>
                <span className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: previewSecondary, color: previewFontColor }}>
                  Como chegar
                </span>
              </div>
            </div>
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">O que muda ao salvar</p>
                <ul className="flex flex-col gap-1">
                  {BRANDING_IMPACT.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-success" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ Funcionalidades ══ */}
        <TabsContent value="funcionalidades" className="mt-4" data-tour="config-funcionalidades">
          <p className="mb-4 text-sm text-muted-foreground">
            Cada chave liga um recurso do terreiro. Os marcados com cadeado entram em planos maiores — toque para ver qual.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {FEATURE_ITEMS.map((item) => {
              const locked = Boolean(item.gate && !can(item.gate));
              const minPlan = item.gate ? minPlanFor(item.gate) : null;
              return (
                <FeatureToggle
                  key={item.field}
                  title={item.title}
                  description={item.description}
                  minPlanLabel={minPlan && minPlan.price > 0 ? minPlan.label : undefined}
                  checked={Boolean(config[item.field])}
                  locked={locked}
                  disabled={!canEdit}
                  onChange={(v) => handleChange(item.field, v)}
                  onLockedClick={() => item.gate && setLockedFeature({ title: item.title, gate: item.gate })}
                />
              );
            })}
          </div>

          {config.enable_time_slot_scheduling && can('agendamento_por_horario') && (
            <div className="max-w-2xl">
              <TimeSlotTemplateEditor canEdit={canEdit} />
            </div>
          )}
        </TabsContent>

        {/* ══ Atendimento ══ */}
        <TabsContent value="atendimento" className="mt-4" data-tour="config-atendimento">
          <Card className="max-w-2xl">
            <CardContent className="p-5">
              <SectionTitle title="Prioridade dos associados" description="Define a posição dos associados na fila da Porta." />
              <RadioGroup
                value={config.sponsor_priority_mode || 'first'}
                onValueChange={(v) => handleChange('sponsor_priority_mode', v)}
                disabled={!canEdit}
                className="gap-3"
              >
                {PRIORITY_OPTIONS.map((opt) => {
                  const selected = (config.sponsor_priority_mode || 'first') === opt.value;
                  const id = `prio-${opt.value}`;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition',
                        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                        !canEdit && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <RadioGroupItem id={id} value={opt.value} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-semibold">{opt.title}</span>
                        <span className="block text-xs text-muted-foreground">{opt.description}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Barra fixa de salvar */}
      {showSaveBar && (
        <div
          role="region"
          aria-label="Alterações não salvas"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:left-[280px]"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-warning" aria-hidden /> Alterações não salvas
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleDiscard} disabled={saving}>
                <Undo2 aria-hidden /> Descartar
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving || hasErrors}>
                <Save aria-hidden /> {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recurso fora do plano */}
      <Dialog open={!!lockedFeature} onOpenChange={(o) => !o && setLockedFeature(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5 text-muted-foreground" aria-hidden /> {lockedFeature?.title}
            </DialogTitle>
            <DialogDescription>
              Este recurso entra a partir do plano <strong>{lockedPlan?.label}</strong>. Você pode comparar os planos e trocar
              quando quiser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLockedFeature(null)}>
              Agora não
            </Button>
            {lockedPlan && (
              <Button asChild>
                <Link href={`/admin/billing?plan=${lockedPlan.key}`}>Ver plano {lockedPlan.label}</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
