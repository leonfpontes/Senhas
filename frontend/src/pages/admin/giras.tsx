/**
 * Giras — agenda do terreiro em cartões (GiraCard), criação em 3 passos e configuração de senhas.
 *
 * - Cada gira vira um GiraCard com o estado em palavras do terreiro e um botão primário por
 *   estado (Compartilhar link / Abrir Porta / Liberar agora / Configurar senhas).
 * - "Nova gira" abre um CrudDrawer com Stepper: A gira → Senhas (padrões de
 *   `giraSenhaDefaults`) → Recados. Ao criar, as senhas já são salvas e o link é oferecido.
 * - "Configurar senhas" (gira existente) mantém o drawer completo, com o avançado
 *   (acompanhantes, fila de espera, horários, associados) em Accordion.
 * - Um único ShareLinkDialog (link, QR, WhatsApp, copiar) para todo compartilhamento: no cartão
 *   e no drawer da gira vai o link DA GIRA (`public_link`, /public/gira/{id}); "Link e QR" no
 *   topo é o link único do terreiro (resolve a próxima gira com senhas abertas).
 * - Sem `giras:edit` a criação pula o passo "Senhas" (PUT /senhas exige edit) e avisa.
 * - "Local" opcional na gira; em branco vale o endereço do terreiro (`/giras/settings`).
 * - `?nova=1` abre a criação; `?compartilhar=1` abre o link do terreiro.
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import {
  Clock,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  Star,
  Ticket,
  Trash2,
  Users,
} from 'lucide-react';
import AdminLayout from './admin_layout';
import { PageHeader, ConfirmDialog } from '@/components/admin';
import GirasEmptyState from '@/components/admin/GirasEmptyState';
import { GiraCard, giraPhase, type GiraCardData } from '@/components/admin/GiraCard';
import { ChamadaDaGiraButton, giraTemChamada } from '@/components/admin/presenca/ChamadaDaGiraButton';
import { ShareLinkDialog } from '@/components/admin/ShareLinkDialog';
import { PermissionDenied } from '@/components/gates';
import { Stepper } from '@/components/Stepper';
import CrudDrawer from '@/components/CrudDrawer';
import { DateTimeField, TextField } from '@/components/fields';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  formatWindowDuration,
  isShortWindow,
  releaseWindowHours,
  suggestMaxTickets,
  suggestReleaseWindow,
} from '@/utils/giraSenhaDefaults';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useGiraContext } from '@/components/admin/GiraContext';
import { useProfile } from '@/hooks/useProfile';
import { minPlanFor, type PlanFeatureKey } from '@/constants/plans';
import { OrientacoesCorrenteField } from '@/components/admin/giras/OrientacoesCorrenteField';

interface Gira extends GiraCardData {
  descricao?: string;
  data_fim?: string;
  local?: string;
  recados?: string;
  orientacoes_corrente?: string | null;
  allow_acompanhantes?: boolean;
  max_acompanhantes?: number | null;
}

interface SenhaConfig {
  max_tickets: number;
  release_start_at: string;
  release_end_at: string;
  allow_acompanhantes?: boolean;
  max_acompanhantes?: number | null;
  current_count: number;
  public_link: string;
  sponsor_max_tickets?: number | null;
  sponsor_release_start_at?: string | null;
  sponsor_release_end_at?: string | null;
  sponsor_current_count?: number;
  sponsor_public_link?: string;
  waitlist_confirmation_hours?: number | null;
}

interface TimeSlotRow {
  id?: string;
  horario: string; // "HH:MM"
  capacidade_maxima: string;
  total_emitido?: number;
  vagas_disponiveis?: number;
}

interface UnifiedLinks {
  public_link: string;
  sponsor_public_link: string;
}

const timeToInputValue = (horario: string): string => horario.slice(0, 5);
const emptySlotRow = (): TimeSlotRow => ({ horario: '', capacidade_maxima: '' });

const EMPTY_FORM = {
  nome: '',
  descricao: '',
  data_inicio: '',
  recados: '',
  local: '',
  orientacoes_corrente: '',
};
const EMPTY_SENHA_FORM = {
  max_tickets: '',
  release_start_at: '',
  release_end_at: '',
  allow_acompanhantes: false,
  max_acompanhantes: '',
  sponsor_max_tickets: '',
  sponsor_release_start_at: '',
  sponsor_release_end_at: '',
  waitlist_confirmation_hours: '',
};
type SenhaForm = typeof EMPTY_SENHA_FORM;

const CREATE_STEPS = [{ label: 'A gira' }, { label: 'Senhas' }, { label: 'Recados', optional: true }];
// Sem `giras:edit` não dá para salvar as senhas (PUT /senhas exige edit): a criação pula o passo.
const CREATE_STEPS_SEM_SENHAS = [{ label: 'A gira' }, { label: 'Recados', optional: true }];

/** Status que não ocupam vaga da gira (não contam em "X de Y senhas"). */
const NAO_OCUPA_VAGA = new Set(['cancelled', 'waitlisted', 'waitlist_expired']);

/** UTC ISO da API → "YYYY-MM-DDTHH:mm" local (inverso de `new Date(local).toISOString()`). */
const isoToLocalDatetimeInput = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toUtcIso = (localStr: string) => (localStr ? new Date(localStr).toISOString() : localStr);

function configToForm(config: Partial<SenhaConfig>): SenhaForm {
  return {
    max_tickets: config.max_tickets ? String(config.max_tickets) : '',
    release_start_at: isoToLocalDatetimeInput(config.release_start_at),
    release_end_at: isoToLocalDatetimeInput(config.release_end_at),
    allow_acompanhantes: !!config.allow_acompanhantes,
    max_acompanhantes: config.max_acompanhantes ? String(config.max_acompanhantes) : '',
    sponsor_max_tickets: config.sponsor_max_tickets ? String(config.sponsor_max_tickets) : '',
    sponsor_release_start_at: isoToLocalDatetimeInput(config.sponsor_release_start_at),
    sponsor_release_end_at: isoToLocalDatetimeInput(config.sponsor_release_end_at),
    waitlist_confirmation_hours: config.waitlist_confirmation_hours ? String(config.waitlist_confirmation_hours) : '',
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'CanceledError' || error.name === 'AbortError');
}

function GiraUsageBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const atLimit = used >= max;
  return (
    <Card className={cn('gap-2 px-4 py-3', atLimit && 'border-warning')}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">Giras criadas este mês</span>
        <span className={cn('font-bold tabular-nums', atLimit && 'text-warning-strong')}>
          {used} de {max}
        </span>
      </div>
      <Progress value={pct} className="h-2" aria-label="Giras criadas este mês" />
      {atLimit && (
        <p className="text-xs text-muted-foreground">
          Limite do plano atingido.{' '}
          <Link href="/admin/billing" className="font-semibold text-brand underline-offset-4 hover:underline">
            Ver planos
          </Link>{' '}
          para criar mais giras.
        </p>
      )}
    </Card>
  );
}

function PlanLockedInline({ text, feature }: { text: string; feature: PlanFeatureKey }) {
  const plan = minPlanFor(feature);
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-muted-foreground">
          Disponível {plan.key === 'premium' ? `só no plano ${plan.label}` : `a partir do plano ${plan.label}`}
        </p>
        <p className="text-xs text-muted-foreground">{text}</p>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href={`/admin/billing?plan=${plan.key}`}>Ver planos</Link>
        </Button>
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  checked,
  onCheckedChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="leading-snug">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function ShortWindowWarning({
  start,
  end,
  giraStart,
  onUseSuggestion,
}: {
  start: string;
  end: string;
  giraStart: string | null;
  onUseSuggestion: (s: { start: string; end: string }) => void;
}) {
  if (!isShortWindow(start, end)) return null;
  const hours = releaseWindowHours(start, end) ?? 0;
  const suggested = giraStart ? suggestReleaseWindow(giraStart) : null;
  return (
    <Alert variant="warning" data-testid="short-window-warning">
      <Clock aria-hidden />
      <AlertDescription>
        <p>
          A liberação dura só {formatWindowDuration(hours)}. Quem vir o link fora desse horário não consegue pegar
          senha. Os terreiros que mais usam o GiraHub deixam a emissão aberta por horas ou dias.
        </p>
        {suggested && (
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onUseSuggestion(suggested)}>
            Usar sugestão
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default function AdminGirasPage() {
  return (
    <AdminLayout title="Giras">
      <AdminGirasContent />
    </AdminLayout>
  );
}

function AdminGirasContent() {
  const { subscription, can, loading: subLoading, canCreateGira: canCreateGiraFn, refresh: refreshSubscription } =
    useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('giras', 'view');
  const canInsert = canGroup('giras', 'insert');
  const canEdit = canGroup('giras', 'edit');
  const canDelete = canGroup('giras', 'delete');
  const canViewPorta = canGroup('porta', 'view');
  const canViewTickets = canGroup('tickets', 'view');
  // Orientações para a corrente (AM-07): só com a Área do Médium; sem ela o valor nem vai.
  const comAreaMedium = can('area_medium');
  const router = useRouter();
  const giraCtx = useGiraContext({ load: false });
  const { profile } = useProfile();

  const [giras, setGiras] = useState<Gira[]>([]);
  const [loading, setLoading] = useState(true);
  // Distingue "falhou ao carregar" de "não há giras" (senão o empty state mentiria).
  const [loadError, setLoadError] = useState(false);
  const [unifiedLinks, setUnifiedLinks] = useState<UnifiedLinks | null>(null);
  const [counts, setCounts] = useState<Record<string, { issued?: number; waiting?: number }>>({});
  const [showPast, setShowPast] = useState<boolean | null>(null);

  const canCreateGira = canCreateGiraFn();
  const createBlockedReason =
    !canCreateGira && !subLoading
      ? subscription?.max_giras_per_month != null && subscription.max_giras_per_month >= 0
        ? `Limite de ${subscription.max_giras_per_month} gira(s) por mês atingido. Veja os planos para criar mais.`
        : 'Sem assinatura ativa. Faça upgrade do plano.'
      : '';

  // Criação (stepper)
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createSenha, setCreateSenha] = useState<SenhaForm>(EMPTY_SENHA_FORM);
  const [createTouched, setCreateTouched] = useState<Record<string, boolean>>({});
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edição
  const [editOpen, setEditOpen] = useState(false);
  const [currentGira, setCurrentGira] = useState<Gira | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState<Gira | null>(null);

  // Configuração de senhas
  const [senhaDrawerOpen, setSenhaDrawerOpen] = useState(false);
  const [senhaTarget, setSenhaTarget] = useState<Gira | null>(null);
  const [senhaSuggestion, setSenhaSuggestion] = useState<
    { fromCreate: boolean; maxTickets: number; hasHistory: boolean; hasWindow: boolean } | null
  >(null);
  const [senhaForm, setSenhaForm] = useState<SenhaForm>(EMPTY_SENHA_FORM);
  const [senhaConfig, setSenhaConfig] = useState<SenhaConfig | null>(null);
  const [senhaInitial, setSenhaInitial] = useState<SenhaForm>(EMPTY_SENHA_FORM);
  const [senhaSaving, setSenhaSaving] = useState(false);
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaTouched, setSenhaTouched] = useState<Record<string, boolean>>({});

  // Liberar agora
  const [releaseTarget, setReleaseTarget] = useState<Gira | null>(null);

  // Compartilhar — sem `shareGira` é o link único do terreiro; com ela, o link da própria gira.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState<string | undefined>(undefined);
  const [shareGira, setShareGira] = useState<{ nome: string; link: string; sponsorLink: string } | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Endereço do terreiro (padrão quando a gira não tem local próprio).
  const [tenantEndereco, setTenantEndereco] = useState<string | null>(null);

  // Horários de atendimento
  const [timeSlotSchedulingEnabled, setTimeSlotSchedulingEnabled] = useState(false);
  const [useTimeSlots, setUseTimeSlots] = useState(false);
  const [useTimeSlotsInitial, setUseTimeSlotsInitial] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [timeSlotsInitial, setTimeSlotsInitial] = useState<TimeSlotRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    loadGiras(controller.signal);
    loadUnifiedLinks(controller.signal);
    loadGiraSettings(controller.signal);
    return () => controller.abort();
    // As funções de carga não são memoizadas — incluí-las refaria a busca a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // `/giras/settings` (GIRAS:view): horários ligados + endereço do terreiro. Antes vinha de
  // `/tenant/config` (CONFIGURACOES:view) e quem só tinha GIRAS ficava sem os horários.
  const loadGiraSettings = async (signal?: AbortSignal) => {
    if (!canView) return;
    try {
      const response = await apiClient.get('/api/v1/admin/giras/settings', { signal });
      setTimeSlotSchedulingEnabled(!!response?.data?.enable_time_slot_scheduling);
      setTenantEndereco(typeof response?.data?.endereco === 'string' ? response.data.endereco : null);
    } catch (error) {
      if (isAbort(error)) return;
      setTimeSlotSchedulingEnabled(false);
    }
  };

  const loadGiras = async (signal?: AbortSignal) => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(false);
      const response = await apiClient.get('/api/v1/admin/giras', { signal });
      const data = response?.data;
      setGiras(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      if (isAbort(error)) return;
      console.error('Error loading giras:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadUnifiedLinks = async (signal?: AbortSignal) => {
    if (!canView) return;
    try {
      const response = await apiClient.get('/api/v1/admin/giras/unified-links', { signal });
      if (response?.data && typeof response.data.public_link === 'string') setUnifiedLinks(response.data);
    } catch (error) {
      if (isAbort(error)) return;
      console.error('Error loading unified links:', error);
    }
  };

  // Contagem "12 de 50 senhas · 3 na fila" para as giras do momento (no máximo 4 chamadas).
  useEffect(() => {
    if (!canView || giras.length === 0) return;
    let cancelled = false;
    const now = new Date();
    const live = giras
      .filter((g) => {
        const phase = giraPhase(g, now);
        return phase === 'hoje' || phase === 'aberta';
      })
      .slice(0, 4);
    live.forEach(async (g) => {
      try {
        if (giraPhase(g, now) === 'hoje' && canViewPorta) {
          const res = await apiClient.get(`/api/v1/admin/giras/${g.id}/door/queue`);
          const items: { status: string }[] = Array.isArray(res?.data?.items) ? res.data.items : [];
          if (cancelled || !Array.isArray(res?.data?.items)) return;
          setCounts((prev) => ({
            ...prev,
            [g.id]: {
              // Fila de espera não ocupa vaga — só as senhas emitidas de verdade.
              issued: items.filter((t) => !NAO_OCUPA_VAGA.has(t.status)).length,
              waiting: items.filter((t) => t.status === 'emitted').length,
            },
          }));
        } else {
          const res = await apiClient.get(`/api/v1/admin/giras/${g.id}/senhas`);
          const current = res?.data?.current_count;
          if (cancelled || typeof current !== 'number') return;
          setCounts((prev) => ({ ...prev, [g.id]: { issued: current } }));
        }
      } catch {
        /* contagem é informativa — o cartão funciona sem ela */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [giras, canView, canViewPorta]);

  // ?nova=1 abre a criação (botão "Criar gira" do checklist / barra inferior); espera a
  // assinatura carregar para respeitar o limite do plano e remove o parâmetro.
  useEffect(() => {
    if (!router.isReady || router.query.nova !== '1' || subLoading) return;
    if (canInsert && canCreateGira) openCreate();
    const { nova: _nova, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.nova, subLoading, canInsert, canCreateGira]);

  // ?compartilhar=1 (item "Link e QR do terreiro" sem JS do layout) abre o link do terreiro.
  useEffect(() => {
    if (!router.isReady || router.query.compartilhar !== '1') return;
    openShare();
    const { compartilhar: _c, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.compartilhar]);

  /** Link único do terreiro (resolve a próxima gira a cada visita). */
  const openShare = (title?: string) => {
    setShareGira(null);
    setShareLoading(false);
    setShareTitle(title);
    setShareOpen(true);
  };

  /**
   * Link da PRÓPRIA gira (`public_link` de /giras/{id}/senhas). O link do terreiro sempre abre a
   * gira com emissão aberta mais antiga — compartilhar pelo cartão de outra gira mandava o
   * consulente para a gira errada.
   */
  const openGiraShare = async (gira: Gira, config?: SenhaConfig | null) => {
    setShareTitle(`Link de senhas — ${gira.nome}`);
    setShareOpen(true);
    const fill = (c: SenhaConfig) =>
      setShareGira({ nome: gira.nome, link: c.public_link, sponsorLink: c.sponsor_public_link || '' });
    if (config?.public_link) {
      fill(config);
      setShareLoading(false);
      return;
    }
    setShareGira(null);
    setShareLoading(true);
    try {
      const response = await apiClient.get(`/api/v1/admin/giras/${gira.id}/senhas`);
      if (response?.data?.public_link) fill(response.data as SenhaConfig);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Não foi possível carregar o link da gira.'));
      setShareOpen(false);
    } finally {
      setShareLoading(false);
    }
  };

  // ── Criação ──────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateForm(EMPTY_FORM);
    setCreateSenha(EMPTY_SENHA_FORM);
    setCreateTouched({});
    setSuggestedFor(null);
    setCreateStep(0);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateStep(0);
  };

  const setCreateField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    setCreateTouched((prev) => ({ ...prev, [field]: true }));
  };

  const setCreateSenhaField = (field: keyof SenhaForm, value: string | boolean) => {
    setCreateSenha((prev) => ({ ...prev, [field]: value }));
    setCreateTouched((prev) => ({ ...prev, [field]: true }));
  };

  const createNomeError = createTouched.nome && !createForm.nome.trim() ? 'Dê um nome para a gira' : '';
  const createDataError = createTouched.data_inicio && !createForm.data_inicio ? 'Informe o dia e a hora da gira' : '';
  const createMaxError =
    createTouched.max_tickets && (!createSenha.max_tickets || Number(createSenha.max_tickets) < 1)
      ? 'Mínimo 1 senha'
      : '';
  const createWindowError =
    createTouched.release_end_at && createSenha.release_start_at && createSenha.release_end_at &&
    releaseWindowHours(createSenha.release_start_at, createSenha.release_end_at) === null
      ? 'O fim precisa ser depois do início'
      : '';
  const step0Valid = !!createForm.nome.trim() && !!createForm.data_inicio;
  const step1Valid =
    !!createSenha.max_tickets &&
    Number(createSenha.max_tickets) >= 1 &&
    !!createSenha.release_start_at &&
    !!createSenha.release_end_at &&
    releaseWindowHours(createSenha.release_start_at, createSenha.release_end_at) !== null &&
    (!createSenha.allow_acompanhantes || Number(createSenha.max_acompanhantes) >= 1);

  const createDirty =
    Object.values(createForm).some((v) => v !== '') || JSON.stringify(createSenha) !== JSON.stringify(EMPTY_SENHA_FORM);

  const goToSenhas = () => {
    setCreateTouched((p) => ({ ...p, nome: true, data_inicio: true }));
    if (!step0Valid) return;
    if (!canEdit) {
      // Sem permissão de editar giras as senhas não podem ser salvas: vai direto aos recados.
      setCreateStep(2);
      return;
    }
    // Preenche a sugestão na primeira vez (ou quando a data da gira mudou).
    if (suggestedFor !== createForm.data_inicio) {
      const window = suggestReleaseWindow(new Date(createForm.data_inicio).toISOString());
      setCreateSenha((prev) => ({
        ...prev,
        max_tickets: prev.max_tickets || String(suggestMaxTickets(giras)),
        release_start_at: window?.start ?? prev.release_start_at,
        release_end_at: window?.end ?? prev.release_end_at,
      }));
      setSuggestedFor(createForm.data_inicio);
    }
    setCreateStep(1);
  };

  const handleCreateSave = async () => {
    if (createStep === 0) {
      goToSenhas();
      return;
    }
    if (createStep === 1) {
      setCreateTouched((p) => ({ ...p, max_tickets: true, release_start_at: true, release_end_at: true }));
      if (step1Valid) setCreateStep(2);
      return;
    }
    if (!canInsert || !step0Valid || (canEdit && !step1Valid)) return;
    setSaving(true);
    try {
      const payload = {
        nome: createForm.nome,
        descricao: createForm.descricao,
        recados: createForm.recados,
        local: createForm.local.trim() || null,
        data_inicio: toUtcIso(createForm.data_inicio),
        ...(comAreaMedium ? { orientacoes_corrente: createForm.orientacoes_corrente.trim() || null } : {}),
      };
      const response = await apiClient.post('/api/v1/admin/giras', payload);
      const created: Gira | null = response?.data?.id ? (response.data as Gira) : null;
      closeCreate();
      refreshSubscription();
      if (created && canEdit) {
        try {
          await apiClient.put(`/api/v1/admin/giras/${created.id}/senhas`, {
            max_tickets: Number(createSenha.max_tickets),
            release_start_at: toUtcIso(createSenha.release_start_at),
            release_end_at: toUtcIso(createSenha.release_end_at),
            allow_acompanhantes: createSenha.allow_acompanhantes,
            max_acompanhantes:
              createSenha.allow_acompanhantes && createSenha.max_acompanhantes ? Number(createSenha.max_acompanhantes) : null,
          });
          toast.success('Gira criada e senhas configuradas!');
          await loadUnifiedLinks();
          openShare('Gira criada! Compartilhe o link de senhas');
        } catch (error) {
          toast.error(extractApiErrorMessage(error, 'A gira foi criada, mas as senhas não foram salvas.'));
          openSenhaDrawer(created, { fromCreate: true });
        }
      } else {
        toast.success(
          canEdit
            ? 'Gira criada!'
            : 'Gira criada! As senhas ainda não estão liberadas — peça a quem pode editar giras para configurá-las.',
        );
      }
      loadGiras();
      void giraCtx.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao criar a gira'));
    } finally {
      setSaving(false);
    }
  };

  // ── Edição ───────────────────────────────────────────────────────────────────
  const openEdit = (gira: Gira) => {
    setCurrentGira(gira);
    setFormData({
      nome: gira.nome,
      descricao: gira.descricao || '',
      data_inicio: isoToLocalDatetimeInput(gira.data_inicio),
      recados: gira.recados || '',
      local: gira.local || '',
      orientacoes_corrente: gira.orientacoes_corrente || '',
    });
    setTouched({});
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setCurrentGira(null);
    setFormData(EMPTY_FORM);
    setTouched({});
  };

  const handleChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const editDirty =
    currentGira != null &&
    (formData.nome !== currentGira.nome ||
      formData.descricao !== (currentGira.descricao || '') ||
      formData.recados !== (currentGira.recados || '') ||
      formData.local !== (currentGira.local || '') ||
      formData.orientacoes_corrente !== (currentGira.orientacoes_corrente || '') ||
      formData.data_inicio !== isoToLocalDatetimeInput(currentGira.data_inicio));
  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const dataError = touched.data_inicio && !formData.data_inicio ? 'Informe o dia e a hora da gira' : '';
  const editSaveDisabled = !formData.nome.trim() || !formData.data_inicio;

  const handleEditSave = async () => {
    setTouched({ nome: true, data_inicio: true });
    if (editSaveDisabled || !canEdit || !currentGira) return;
    setSaving(true);
    try {
      const { orientacoes_corrente, ...campos } = formData;
      await apiClient.put(`/api/v1/admin/giras/${currentGira.id}`, {
        ...campos,
        local: formData.local.trim() || null,
        data_inicio: toUtcIso(formData.data_inicio),
        ...(comAreaMedium ? { orientacoes_corrente: orientacoes_corrente.trim() || null } : {}),
      });
      closeEdit();
      toast.success('Gira atualizada!');
      loadGiras();
      void giraCtx.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao salvar a gira'));
    } finally {
      setSaving(false);
    }
  };

  // ── Exclusão ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    try {
      await apiClient.delete(`/api/v1/admin/giras/${deleteTarget.id}`);
      setDeleteTarget(null);
      toast.success('Gira excluída.');
      loadGiras();
      refreshSubscription();
      void giraCtx.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao excluir a gira'));
    }
  };

  // ── Configuração de senhas ───────────────────────────────────────────────────
  const openSenhaDrawer = async (gira: Gira, opts: { fromCreate?: boolean } = {}) => {
    setSenhaTarget(gira);
    setSenhaSuggestion(null);
    setSenhaForm(EMPTY_SENHA_FORM);
    setSenhaInitial(EMPTY_SENHA_FORM);
    setSenhaTouched({});
    setSenhaConfig(null);
    setSenhaDrawerOpen(true);
    setSenhaLoading(true);
    let loadedConfig: SenhaConfig | null = null;
    let loadedForm = EMPTY_SENHA_FORM;
    try {
      const response = await apiClient.get(`/api/v1/admin/giras/${gira.id}/senhas`);
      const config: SenhaConfig = response.data;
      loadedConfig = config;
      setSenhaConfig(config);
      loadedForm = configToForm(config);
      setSenhaForm(loadedForm);
      setSenhaInitial(loadedForm);
    } catch {
      // Ainda sem configuração — o formulário fica vazio.
    } finally {
      setSenhaLoading(false);
    }

    // Gira sem senhas (max_tickets 0): preenche a sugestão. O "inicial" continua vazio, então
    // salvar fica habilitado e fechar pede confirmação.
    if (!loadedConfig || !loadedConfig.max_tickets) {
      const suggestedWindow = suggestReleaseWindow(gira.data_inicio);
      const maxTickets = suggestMaxTickets(giras, gira.id);
      setSenhaForm({
        ...loadedForm,
        max_tickets: String(maxTickets),
        release_start_at: suggestedWindow?.start ?? '',
        release_end_at: suggestedWindow?.end ?? '',
      });
      setSenhaSuggestion({
        fromCreate: !!opts.fromCreate,
        maxTickets,
        hasHistory: giras.some((g) => g.id !== gira.id && (g.max_tickets ?? 0) > 0),
        hasWindow: !!suggestedWindow,
      });
    }

    if (timeSlotSchedulingEnabled) {
      try {
        const response = await apiClient.get(`/api/v1/admin/giras/${gira.id}/time-slots`);
        const loadedSlots: TimeSlotRow[] = (response.data.slots || []).map(
          (s: { id: string; horario: string; capacidade_maxima: number; total_emitido: number; vagas_disponiveis: number }) => ({
            id: s.id,
            horario: timeToInputValue(s.horario),
            capacidade_maxima: String(s.capacidade_maxima),
            total_emitido: s.total_emitido,
            vagas_disponiveis: s.vagas_disponiveis,
          }),
        );
        setUseTimeSlots(!!response.data.use_time_slots);
        setUseTimeSlotsInitial(!!response.data.use_time_slots);
        setTimeSlots(loadedSlots);
        setTimeSlotsInitial(loadedSlots);
      } catch {
        setUseTimeSlots(false);
        setUseTimeSlotsInitial(false);
        setTimeSlots([]);
        setTimeSlotsInitial([]);
      }
    }
  };

  const closeSenhaDrawer = () => {
    setSenhaDrawerOpen(false);
    setSenhaTarget(null);
    setSenhaSuggestion(null);
    setSenhaConfig(null);
    setSenhaForm(EMPTY_SENHA_FORM);
    setSenhaTouched({});
    setUseTimeSlots(false);
    setUseTimeSlotsInitial(false);
    setTimeSlots([]);
    setTimeSlotsInitial([]);
  };

  const handleToggleUseTimeSlots = async (checked: boolean) => {
    setUseTimeSlots(checked);
    if (checked && timeSlots.length === 0) {
      try {
        const response = await apiClient.get('/api/v1/admin/config/time-slot-templates');
        const templateSlots: TimeSlotRow[] = (response.data || []).map(
          (t: { horario: string; capacidade_maxima: number }) => ({
            horario: timeToInputValue(t.horario),
            capacidade_maxima: String(t.capacidade_maxima),
          }),
        );
        setTimeSlots(templateSlots.length > 0 ? templateSlots : [emptySlotRow()]);
      } catch {
        setTimeSlots([emptySlotRow()]);
      }
    }
  };

  const updateSlotRow = (index: number, field: 'horario' | 'capacidade_maxima', value: string) => {
    setTimeSlots((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const addSlotRow = () => setTimeSlots((prev) => [...prev, emptySlotRow()]);
  const removeSlotRow = (index: number) => setTimeSlots((prev) => prev.filter((_, i) => i !== index));

  const timeSlotsValid =
    !useTimeSlots ||
    (timeSlots.length > 0 &&
      timeSlots.every((s) => s.horario && Number(s.capacidade_maxima) >= 1) &&
      new Set(timeSlots.map((s) => s.horario)).size === timeSlots.length);

  // Vagas por horário e quantidade de senhas são limites independentes: só avisamos quando
  // não batem (o backend aceita os dois, para não quebrar giras existentes).
  const slotCapacitySum = useTimeSlots
    ? timeSlots.reduce((acc, s) => acc + (Number(s.capacidade_maxima) > 0 ? Number(s.capacidade_maxima) : 0), 0)
    : 0;
  const senhaMaxTickets = Number(senhaForm.max_tickets) || 0;

  const timeSlotsDirty =
    useTimeSlots !== useTimeSlotsInitial ||
    JSON.stringify(timeSlots.map((s) => ({ horario: s.horario, capacidade_maxima: s.capacidade_maxima }))) !==
      JSON.stringify(timeSlotsInitial.map((s) => ({ horario: s.horario, capacidade_maxima: s.capacidade_maxima })));

  const handleSenhaChange = (field: keyof SenhaForm, value: string) => {
    setSenhaForm((prev) => ({ ...prev, [field]: value }));
    setSenhaTouched((prev) => ({ ...prev, [field]: true }));
  };

  const senhaMaxError =
    senhaTouched.max_tickets && (!senhaForm.max_tickets || Number(senhaForm.max_tickets) < 1) ? 'Mínimo 1 senha' : '';
  const senhaStartError = senhaTouched.release_start_at && !senhaForm.release_start_at ? 'Início é obrigatório' : '';
  const senhaEndError = senhaTouched.release_end_at && !senhaForm.release_end_at ? 'Fim é obrigatório' : '';
  const maxAcompanhantesError =
    senhaForm.allow_acompanhantes &&
    senhaTouched.max_acompanhantes &&
    (!senhaForm.max_acompanhantes || Number(senhaForm.max_acompanhantes) < 1)
      ? 'Informe o máximo de acompanhantes (mínimo 1)'
      : '';
  const senhaSaveDisabled =
    !senhaForm.max_tickets ||
    Number(senhaForm.max_tickets) < 1 ||
    !senhaForm.release_start_at ||
    !senhaForm.release_end_at ||
    (senhaForm.allow_acompanhantes && (!senhaForm.max_acompanhantes || Number(senhaForm.max_acompanhantes) < 1)) ||
    !timeSlotsValid;

  const senhaDirty = JSON.stringify(senhaForm) !== JSON.stringify(senhaInitial) || timeSlotsDirty;

  const handleSenhaSave = async () => {
    setSenhaTouched({ max_tickets: true, release_start_at: true, release_end_at: true });
    if (senhaSaveDisabled || !senhaTarget || !canEdit) return;
    setSenhaSaving(true);
    try {
      const payload: Record<string, unknown> = {
        max_tickets: Number(senhaForm.max_tickets),
        release_start_at: toUtcIso(senhaForm.release_start_at),
        release_end_at: toUtcIso(senhaForm.release_end_at),
        allow_acompanhantes: senhaForm.allow_acompanhantes,
        max_acompanhantes:
          senhaForm.allow_acompanhantes && senhaForm.max_acompanhantes ? Number(senhaForm.max_acompanhantes) : null,
      };
      if (senhaForm.sponsor_max_tickets && Number(senhaForm.sponsor_max_tickets) > 0) {
        payload.sponsor_max_tickets = Number(senhaForm.sponsor_max_tickets);
        payload.sponsor_release_start_at = senhaForm.sponsor_release_start_at
          ? toUtcIso(senhaForm.sponsor_release_start_at)
          : payload.release_start_at;
        payload.sponsor_release_end_at = senhaForm.sponsor_release_end_at
          ? toUtcIso(senhaForm.sponsor_release_end_at)
          : payload.release_end_at;
      }
      if (can('fila_espera') && senhaForm.waitlist_confirmation_hours) {
        payload.waitlist_confirmation_hours = Number(senhaForm.waitlist_confirmation_hours);
      }
      const response = await apiClient.put(`/api/v1/admin/giras/${senhaTarget.id}/senhas`, payload);
      setSenhaConfig(response.data);
      // Sincroniza o "inicial" para o aviso de alteração não salva não aparecer depois de salvar.
      setSenhaInitial({ ...senhaForm });
      setSenhaSuggestion(null);

      if (timeSlotSchedulingEnabled) {
        const slotsResponse = await apiClient.put(`/api/v1/admin/giras/${senhaTarget.id}/time-slots`, {
          use_time_slots: useTimeSlots,
          slots: useTimeSlots
            ? timeSlots.map((s) => ({ horario: s.horario, capacidade_maxima: Number(s.capacidade_maxima) }))
            : [],
        });
        const savedSlots: TimeSlotRow[] = (slotsResponse.data.slots || []).map(
          (s: { id: string; horario: string; capacidade_maxima: number; total_emitido: number; vagas_disponiveis: number }) => ({
            id: s.id,
            horario: timeToInputValue(s.horario),
            capacidade_maxima: String(s.capacidade_maxima),
            total_emitido: s.total_emitido,
            vagas_disponiveis: s.vagas_disponiveis,
          }),
        );
        setUseTimeSlots(!!slotsResponse.data.use_time_slots);
        setUseTimeSlotsInitial(!!slotsResponse.data.use_time_slots);
        setTimeSlots(savedSlots);
        setTimeSlotsInitial(savedSlots);
      }

      toast.success('Configuração de senhas salva!');
      loadGiras();
      void giraCtx.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao salvar configuração'));
    } finally {
      setSenhaSaving(false);
    }
  };

  const handleReleaseNow = async () => {
    const target = releaseTarget;
    setReleaseTarget(null);
    if (!target || !canEdit) return;
    setSenhaSaving(true);
    try {
      const response = await apiClient.post(`/api/v1/admin/giras/${target.id}/release-now`);
      if (senhaTarget?.id === target.id) {
        setSenhaConfig(response.data);
        // Só a janela de liberação mudou: aplica esses campos e preserva o resto do formulário
        // (edições ainda não salvas e o prazo da fila de espera).
        const released = configToForm(response.data);
        const releaseFields = {
          release_start_at: released.release_start_at,
          release_end_at: released.release_end_at,
          sponsor_release_start_at: released.sponsor_release_start_at,
          sponsor_release_end_at: released.sponsor_release_end_at,
        };
        setSenhaForm((prev) => ({ ...prev, ...releaseFields }));
        setSenhaInitial((prev) => ({ ...prev, ...releaseFields }));
      }
      toast.success('Senhas liberadas agora!');
      loadGiras();
      void giraCtx.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Erro ao liberar senhas'));
    } finally {
      setSenhaSaving(false);
    }
  };

  // ── Lista ────────────────────────────────────────────────────────────────────
  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const up: Gira[] = [];
    const old: Gira[] = [];
    for (const g of giras) {
      const phase = giraPhase(g, now);
      if (phase === 'encerrada' || phase === 'inativa') old.push(g);
      else up.push(g);
    }
    up.sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
    old.sort((a, b) => new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime());
    return { upcoming: up, past: old };
  }, [giras]);

  if (!canView) return <PermissionDenied />;

  // Sem giras futuras, as anteriores já aparecem abertas.
  const pastVisible = showPast ?? upcoming.length === 0;

  const cardPermissions = { canEdit, canDelete, canViewPorta, canViewTickets };
  const renderCard = (gira: Gira) => (
    <GiraCard
      key={gira.id}
      gira={gira}
      issued={counts[gira.id]?.issued}
      waiting={counts[gira.id]?.waiting}
      permissions={cardPermissions}
      onShare={(g) => void openGiraShare(g as Gira)}
      fallbackLocal={tenantEndereco}
      onConfigure={(g) => openSenhaDrawer(g as Gira)}
      onRelease={(g) => setReleaseTarget(g as Gira)}
      onEdit={(g) => openEdit(g as Gira)}
      onDelete={(g) => setDeleteTarget(g as Gira)}
      extraAction={giraTemChamada(gira) ? <ChamadaDaGiraButton giraId={gira.id} /> : undefined}
    />
  );

  const createGiraStartIso = createForm.data_inicio ? new Date(createForm.data_inicio).toISOString() : null;
  // Vazio = endereço do terreiro (Configurações), usado no e-mail da senha e no cartão da gira.
  const localHelperText = tenantEndereco
    ? `Opcional. Em branco, vale o endereço do terreiro (${tenantEndereco}). Aparece no e-mail da senha.`
    : 'Opcional. Aparece no e-mail da senha, com o botão “Como chegar”.';

  return (
    <div className="pb-6">
      <div data-tour="giras-header">
        <PageHeader
          title="Giras"
          subtitle="A agenda do terreiro e as senhas de cada gira."
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => loadGiras()} disabled={loading}>
                <RefreshCw aria-hidden className={cn(loading && 'animate-spin')} /> Atualizar
              </Button>
              {unifiedLinks && (
                <Button type="button" variant="outline" size="sm" onClick={() => openShare()}>
                  <QrCode aria-hidden /> Link e QR
                </Button>
              )}
              {canInsert && (
                <Button
                  type="button"
                  size="sm"
                  data-tour="giras-nova"
                  onClick={openCreate}
                  disabled={!canCreateGira}
                  title={createBlockedReason || undefined}
                >
                  <Plus aria-hidden /> Nova gira
                </Button>
              )}
            </>
          }
        />
      </div>

      {canInsert && createBlockedReason && giras.length > 0 && (
        <p className="-mt-3 mb-4 text-sm text-muted-foreground">{createBlockedReason}</p>
      )}

      {subscription && subscription.max_giras_per_month >= 0 && (
        <div data-tour="giras-usage" className="mb-4">
          <GiraUsageBar used={subscription.current_giras_this_month} max={subscription.max_giras_per_month} />
        </div>
      )}

      <section data-tour="giras-tabela" aria-label="Giras do terreiro">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível carregar as giras.</AlertTitle>
            <AlertDescription>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => loadGiras()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : giras.length === 0 ? (
          <Card className="py-0">
            <GirasEmptyState
              canInsert={canInsert}
              canCreateGira={canCreateGira}
              blockedReason={createBlockedReason}
              onCreate={openCreate}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {upcoming.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">{upcoming.map(renderCard)}</div>
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma gira marcada daqui para frente.
              </p>
            )}
            {past.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-muted-foreground">Giras anteriores ({past.length})</h2>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowPast(!pastVisible)} aria-expanded={pastVisible}>
                    {pastVisible ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </div>
                {pastVisible && <div className="grid gap-3 md:grid-cols-2">{past.map(renderCard)}</div>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Nova gira — 3 passos */}
      <CrudDrawer
        open={createOpen}
        onClose={closeCreate}
        title="Nova gira"
        subtitle="Em três passos a gira fica pronta para os consulentes pegarem senha."
        icon={<Plus />}
        onSave={handleCreateSave}
        saveLabel={createStep < 2 ? 'Continuar' : 'Criar gira'}
        saving={saving}
        isDirty={createDirty}
      >
        {canEdit ? (
          <Stepper steps={CREATE_STEPS} active={createStep} onStepClick={(i) => i < createStep && setCreateStep(i)} className="mb-2" />
        ) : (
          // Sem o passo "Senhas": índices visuais 0 (A gira) e 1 (Recados = passo interno 2).
          <Stepper
            steps={CREATE_STEPS_SEM_SENHAS}
            active={createStep === 0 ? 0 : 1}
            onStepClick={(i) => i === 0 && setCreateStep(0)}
            className="mb-2"
          />
        )}

        {createStep === 0 && (
          <div className="flex flex-col gap-4">
            <TextField
              label="Nome da gira"
              placeholder="Ex.: Gira de Caboclos"
              value={createForm.nome}
              onChange={(e) => setCreateField('nome', e.target.value)}
              onBlur={() => setCreateTouched((p) => ({ ...p, nome: true }))}
              required
              error={createNomeError}
              autoFocus
            />
            <DateTimeField
              label="Dia e hora da gira"
              value={createForm.data_inicio}
              onChange={(v) => setCreateField('data_inicio', v ?? '')}
              required
              error={createDataError}
            />
            <TextField
              label="Local (se diferente do endereço do terreiro)"
              value={createForm.local}
              onChange={(e) => setCreateField('local', e.target.value)}
              placeholder={tenantEndereco ?? 'Ex.: Cachoeira do Parque, entrada 2'}
              helperText={localHelperText}
            />
          </div>
        )}

        {createStep === 1 && (
          <div className="flex flex-col gap-4">
            <Alert variant="info" data-testid="create-senha-suggestion">
              <Ticket aria-hidden />
              <AlertDescription>
                Preenchemos uma sugestão: senhas liberadas a partir de agora até o início da gira, para quem vir o link
                no grupo pegar na hora. Ajuste se precisar.
              </AlertDescription>
            </Alert>
            <TextField
              label="Quantas senhas"
              type="number"
              min={1}
              value={createSenha.max_tickets}
              onChange={(e) => setCreateSenhaField('max_tickets', e.target.value)}
              required
              error={createMaxError}
              helperText="Total de senhas disponíveis no link para esta gira."
            />
            <DateTimeField
              label="Senhas abrem em"
              value={createSenha.release_start_at}
              onChange={(v) => setCreateSenhaField('release_start_at', v ?? '')}
              required
            />
            <DateTimeField
              label="Senhas fecham em"
              value={createSenha.release_end_at}
              onChange={(v) => setCreateSenhaField('release_end_at', v ?? '')}
              required
              error={createWindowError}
            />
            <ShortWindowWarning
              start={createSenha.release_start_at}
              end={createSenha.release_end_at}
              giraStart={createGiraStartIso}
              onUseSuggestion={(s) =>
                setCreateSenha((prev) => ({ ...prev, release_start_at: s.start, release_end_at: s.end }))
              }
            />
            <Accordion type="single" collapsible>
              <AccordionItem value="avancado">
                <AccordionTrigger>Mais opções</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  <SwitchRow
                    id="create-acompanhantes"
                    checked={createSenha.allow_acompanhantes}
                    onCheckedChange={(checked) =>
                      setCreateSenha((prev) => ({
                        ...prev,
                        allow_acompanhantes: checked,
                        max_acompanhantes: checked && !prev.max_acompanhantes ? '1' : prev.max_acompanhantes,
                      }))
                    }
                    label="Consulente pode levar acompanhantes"
                    description="Cada acompanhante recebe uma senha própria, que conta na quantidade da gira."
                  />
                  {createSenha.allow_acompanhantes && (
                    <TextField
                      label="Máximo de acompanhantes por senha"
                      type="number"
                      min={1}
                      max={20}
                      value={createSenha.max_acompanhantes}
                      onChange={(e) => setCreateSenhaField('max_acompanhantes', e.target.value)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Senhas de associados, horários de atendimento e fila de espera ficam em “Configurar senhas”, no menu
                    da gira.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {createStep === 2 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="create-review">
              <p className="font-semibold">{createForm.nome}</p>
              <p className="text-muted-foreground">
                {createForm.data_inicio &&
                  new Date(createForm.data_inicio).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
              {canEdit ? (
                <p className="mt-1">
                  {createSenha.max_tickets} senhas · abrem{' '}
                  {createSenha.release_start_at &&
                    new Date(createSenha.release_start_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              ) : null}
            </div>
            {!canEdit && (
              <Alert variant="info" data-testid="create-sem-senhas">
                <Ticket aria-hidden />
                <AlertDescription>
                  A gira será criada <strong>sem senhas liberadas</strong>: configurar as senhas precisa da permissão de
                  editar giras. Depois de criar, peça a quem tem essa permissão para abrir “Configurar senhas” na gira.
                </AlertDescription>
              </Alert>
            )}
            <TextField
              label="Descrição"
              multiline
              rows={2}
              value={createForm.descricao}
              onChange={(e) => setCreateField('descricao', e.target.value)}
            />
            <TextField
              label="Recados"
              multiline
              rows={3}
              value={createForm.recados}
              onChange={(e) => setCreateField('recados', e.target.value)}
              helperText="Opcional. Vai no e-mail da senha — investimento, itens de doação, avisos."
            />
            <OrientacoesCorrenteField
              value={createForm.orientacoes_corrente}
              onChange={(v) => setCreateField('orientacoes_corrente', v)}
            />
          </div>
        )}

        {createStep > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setCreateStep((s) => (!canEdit && s === 2 ? 0 : s - 1))}
          >
            Voltar
          </Button>
        )}
      </CrudDrawer>

      {/* Editar gira */}
      <CrudDrawer
        open={editOpen}
        onClose={closeEdit}
        title="Editar gira"
        subtitle="Altere as informações da gira."
        icon={<Ticket />}
        onSave={handleEditSave}
        saveLabel="Salvar"
        saving={saving}
        saveDisabled={editSaveDisabled}
        isDirty={editDirty}
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nome"
            value={formData.nome}
            onChange={(e) => handleChange('nome', e.target.value)}
            onBlur={() => setTouched((p) => ({ ...p, nome: true }))}
            required
            error={nomeError}
          />
          <DateTimeField
            label="Dia e hora da gira"
            value={formData.data_inicio}
            onChange={(v) => handleChange('data_inicio', v ?? '')}
            required
            error={dataError}
          />
          <TextField
            label="Local (se diferente do endereço do terreiro)"
            value={formData.local}
            onChange={(e) => handleChange('local', e.target.value)}
            placeholder={tenantEndereco ?? 'Ex.: Cachoeira do Parque, entrada 2'}
            helperText={localHelperText}
          />
          <TextField
            label="Descrição"
            multiline
            rows={2}
            value={formData.descricao}
            onChange={(e) => handleChange('descricao', e.target.value)}
          />
          <TextField
            label="Recados"
            multiline
            rows={3}
            value={formData.recados}
            onChange={(e) => handleChange('recados', e.target.value)}
            helperText="Opcional. Vai no e-mail da senha — investimento, itens de doação, avisos."
          />
          <OrientacoesCorrenteField
            value={formData.orientacoes_corrente}
            onChange={(v) => handleChange('orientacoes_corrente', v)}
          />
        </div>
      </CrudDrawer>

      {/* Configurar senhas */}
      <CrudDrawer
        open={senhaDrawerOpen}
        onClose={closeSenhaDrawer}
        title="Configurar senhas"
        subtitle={senhaTarget ? `Quantidade e horário das senhas de “${senhaTarget.nome}”.` : ''}
        icon={<Ticket />}
        onSave={handleSenhaSave}
        saveLabel="Salvar"
        saving={senhaSaving}
        saveDisabled={senhaSaveDisabled}
        isDirty={senhaDirty}
      >
        {senhaLoading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Carregando configuração">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {senhaSuggestion && (
              <Alert variant={senhaSuggestion.fromCreate ? 'success' : 'info'} data-testid="senha-suggestion">
                <Ticket aria-hidden />
                <AlertDescription>
                  {senhaSuggestion.fromCreate && (
                    <strong className="block">Gira criada! Falta liberar as senhas.</strong>
                  )}
                  {senhaSuggestion.fromCreate && 'As senhas só aparecem no link do terreiro depois que você salvar. '}
                  Preenchemos uma sugestão: {senhaSuggestion.maxTickets} senhas
                  {senhaSuggestion.hasHistory ? ' (a média das suas giras)' : ''}
                  {senhaSuggestion.hasWindow
                    ? ', liberadas a partir de agora até o início da gira, para quem vir o link no grupo pegar na hora.'
                    : '. A gira já começou, então defina a janela de liberação.'}{' '}
                  Ajuste se precisar.
                </AlertDescription>
              </Alert>
            )}
            <TextField
              label="Quantas senhas"
              type="number"
              min={1}
              value={senhaForm.max_tickets}
              onChange={(e) => handleSenhaChange('max_tickets', e.target.value)}
              onBlur={() => setSenhaTouched((p) => ({ ...p, max_tickets: true }))}
              required
              error={senhaMaxError}
              helperText="Total de senhas disponíveis no link para esta gira."
            />
            <DateTimeField
              label="Senhas abrem em"
              value={senhaForm.release_start_at}
              onChange={(v) => handleSenhaChange('release_start_at', v ?? '')}
              required
              error={senhaStartError}
            />
            <DateTimeField
              label="Senhas fecham em"
              value={senhaForm.release_end_at}
              onChange={(v) => handleSenhaChange('release_end_at', v ?? '')}
              required
              error={senhaEndError}
            />
            <ShortWindowWarning
              start={senhaForm.release_start_at}
              end={senhaForm.release_end_at}
              giraStart={senhaTarget?.data_inicio ?? null}
              onUseSuggestion={(s) =>
                setSenhaForm((prev) => ({ ...prev, release_start_at: s.start, release_end_at: s.end }))
              }
            />

            {senhaConfig && senhaConfig.max_tickets > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground">
                  {senhaConfig.current_count} de {senhaConfig.max_tickets} senhas emitidas
                </p>
                <Progress
                  value={Math.min(100, (senhaConfig.current_count / senhaConfig.max_tickets) * 100)}
                  className="h-2"
                  aria-label="Senhas emitidas"
                />
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {senhaConfig?.public_link && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => senhaTarget && void openGiraShare(senhaTarget, senhaConfig)}>
                  <QrCode aria-hidden /> Compartilhar link
                </Button>
              )}
              {senhaTarget && canEdit && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => setReleaseTarget(senhaTarget)}>
                  <Rocket aria-hidden /> Liberar agora
                </Button>
              )}
            </div>

            <Accordion type="multiple" className="rounded-lg border px-3">
              <AccordionItem value="acompanhantes">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Users className="size-4" aria-hidden /> Acompanhantes
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  <SwitchRow
                    id="senha-acompanhantes"
                    checked={senhaForm.allow_acompanhantes}
                    onCheckedChange={(checked) => {
                      setSenhaForm((prev) => ({
                        ...prev,
                        allow_acompanhantes: checked,
                        max_acompanhantes: checked && !prev.max_acompanhantes ? '1' : prev.max_acompanhantes,
                      }));
                      setSenhaTouched((prev) => ({ ...prev, allow_acompanhantes: true }));
                    }}
                    label="Consulente pode levar acompanhantes"
                    description="Ao pegar a senha, o consulente escolhe quantos acompanhantes leva (até o limite) e informa o nome de cada um. Cada acompanhante recebe uma senha própria, que conta na quantidade da gira."
                  />
                  {senhaForm.allow_acompanhantes && (
                    <TextField
                      label="Máximo de acompanhantes por senha"
                      type="number"
                      min={1}
                      max={20}
                      value={senhaForm.max_acompanhantes}
                      onChange={(e) => handleSenhaChange('max_acompanhantes', e.target.value)}
                      onBlur={() => setSenhaTouched((p) => ({ ...p, max_acompanhantes: true }))}
                      required
                      error={maxAcompanhantesError}
                      helperText="De 1 a 20."
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              {can('fila_espera') && (
                <AccordionItem value="fila">
                  <AccordionTrigger>Fila de espera</AccordionTrigger>
                  <AccordionContent>
                    <TextField
                      label="Prazo para confirmar a vaga (horas)"
                      type="number"
                      min={1}
                      value={senhaForm.waitlist_confirmation_hours}
                      onChange={(e) => handleSenhaChange('waitlist_confirmation_hours', e.target.value)}
                      helperText="Quando abre uma vaga, quem está na fila tem esse prazo para confirmar antes de passar para o próximo. Padrão: 24h."
                    />
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="horarios">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Clock className="size-4" aria-hidden /> Horários de atendimento
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  {!subLoading && !can('agendamento_por_horario') ? (
                    <PlanLockedInline feature="agendamento_por_horario" text="Deixe o consulente escolher um horário de atendimento ao pegar a senha." />
                  ) : !timeSlotSchedulingEnabled ? (
                    <p className="text-xs text-muted-foreground">
                      Ative em{' '}
                      <Link href="/admin/config" className="font-semibold text-brand underline-offset-4 hover:underline">
                        Configurações → Funcionalidades
                      </Link>{' '}
                      para usar horários de atendimento.
                    </p>
                  ) : (
                    <>
                      <SwitchRow
                        id="senha-horarios"
                        checked={useTimeSlots}
                        onCheckedChange={handleToggleUseTimeSlots}
                        label="Consulente escolhe um horário ao pegar a senha"
                        description="Cada horário (ex.: 20h, 20h30, 21h) tem as próprias vagas, para não juntar gente na porta. A quantidade de senhas da gira continua valendo como limite geral."
                      />
                      {useTimeSlots && (
                        <div className="flex flex-col gap-2">
                          {timeSlots.map((slot, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <TextField
                                label="Horário"
                                type="time"
                                size="small"
                                value={slot.horario}
                                onChange={(e) => updateSlotRow(index, 'horario', e.target.value)}
                                className="flex-1"
                              />
                              <TextField
                                label="Vagas"
                                type="number"
                                size="small"
                                min={1}
                                value={slot.capacidade_maxima}
                                onChange={(e) => updateSlotRow(index, 'capacidade_maxima', e.target.value)}
                                className="flex-1"
                                helperText={
                                  slot.vagas_disponiveis !== undefined ? `${slot.vagas_disponiveis} disponíveis` : undefined
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="mt-6"
                                aria-label={`Remover horário ${slot.horario || index + 1}`}
                                onClick={() => removeSlotRow(index)}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" size="sm" variant="outline" className="self-start" onClick={addSlotRow}>
                            <Plus aria-hidden /> Adicionar horário
                          </Button>
                          {!timeSlotsValid && timeSlots.length > 0 && (
                            <p className="text-xs text-destructive">
                              Preencha todos os horários com vagas ≥ 1 e sem horários repetidos.
                            </p>
                          )}
                          {slotCapacitySum > 0 && (
                            <p className="text-xs text-muted-foreground" data-testid="soma-vagas-horarios">
                              Soma das vagas dos horários: <strong className="tabular-nums">{slotCapacitySum}</strong>
                              {senhaMaxTickets > 0 ? ` · senhas da gira: ${senhaMaxTickets}` : ''}
                            </p>
                          )}
                          {slotCapacitySum > 0 && senhaMaxTickets > 0 && slotCapacitySum !== senhaMaxTickets && (
                            <Alert variant="warning" data-testid="aviso-vagas-horarios">
                              <AlertDescription>
                                {slotCapacitySum > senhaMaxTickets
                                  ? `Os horários somam ${slotCapacitySum} vagas, mas a gira tem ${senhaMaxTickets} senhas: quando as senhas acabarem, sobram vagas nos horários que ninguém consegue usar.`
                                  : `Os horários somam só ${slotCapacitySum} vagas para ${senhaMaxTickets} senhas: quando os horários lotarem, ninguém mais consegue pegar senha, mesmo sobrando.`}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="associados">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Star className="size-4 text-warning" aria-hidden /> Senhas de associados
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  {!subLoading && !can('associados') ? (
                    <PlanLockedInline feature="associados" text="Configure senhas separadas para os associados do terreiro." />
                  ) : (
                    <>
                      <TextField
                        label="Quantas senhas de associado"
                        type="number"
                        min={0}
                        value={senhaForm.sponsor_max_tickets}
                        onChange={(e) => handleSenhaChange('sponsor_max_tickets', e.target.value)}
                        helperText="Deixe 0 ou vazio para não ter senhas de associado."
                      />
                      {senhaForm.sponsor_max_tickets && Number(senhaForm.sponsor_max_tickets) > 0 && (
                        <>
                          <DateTimeField
                            label="Senhas de associado abrem em"
                            value={senhaForm.sponsor_release_start_at}
                            onChange={(v) => handleSenhaChange('sponsor_release_start_at', v ?? '')}
                            helperText="Se vazio, usa o mesmo horário das senhas comuns."
                          />
                          <DateTimeField
                            label="Senhas de associado fecham em"
                            value={senhaForm.sponsor_release_end_at}
                            onChange={(v) => handleSenhaChange('sponsor_release_end_at', v ?? '')}
                            helperText="Se vazio, usa o mesmo horário das senhas comuns."
                          />
                          {senhaConfig && senhaConfig.sponsor_max_tickets && senhaConfig.sponsor_max_tickets > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-sm text-muted-foreground">
                                {senhaConfig.sponsor_current_count || 0} de {senhaConfig.sponsor_max_tickets} senhas de
                                associado emitidas
                              </p>
                              <Progress
                                value={Math.min(
                                  100,
                                  ((senhaConfig.sponsor_current_count || 0) / senhaConfig.sponsor_max_tickets) * 100,
                                )}
                                className="h-2"
                                aria-label="Senhas de associado emitidas"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </CrudDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir gira"
        message={`Tem certeza que deseja excluir a gira “${deleteTarget?.nome ?? ''}”?`}
        confirmText="Excluir"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!releaseTarget}
        title="Liberar senhas agora?"
        message={`As senhas de “${releaseTarget?.nome ?? ''}” abrem imediatamente no link do terreiro.`}
        confirmText="Liberar agora"
        cancelText="Cancelar"
        onConfirm={handleReleaseNow}
        onCancel={() => setReleaseTarget(null)}
      />

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={shareGira ? shareGira.link : unifiedLinks?.public_link}
        sponsorLink={
          can('associados') ? (shareGira ? shareGira.sponsorLink || null : unifiedLinks?.sponsor_public_link) : null
        }
        tenantName={profile?.tenant_name}
        title={shareTitle}
        giraName={shareGira?.nome}
        loading={shareLoading}
        description={
          shareGira
            ? 'Por este link os consulentes pegam a senha desta gira pelo celular.'
            : 'Por este link os consulentes pegam a senha pelo celular.'
        }
      />
    </div>
  );
}
