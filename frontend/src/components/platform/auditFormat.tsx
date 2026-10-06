/**
 * Formatação do feed de auditoria consolidada (plataforma): rótulos de ação/recurso/campo,
 * diff de atualização e detalhes legíveis. Compartilhado pela tela de Auditoria e pela aba
 * Auditoria do Tenant 360.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { ToneBadge, type Tone } from './PlanBadge';
import { planLabel } from './planMeta';

export interface FeedEntry {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_slug: string;
  user_id: string | null;
  user_email: string | null;
  user_username: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  read: 'Leitura',
  update: 'Atualização',
  delete: 'Exclusão',
  login: 'Login',
  logout: 'Logout',
  token_refresh: 'Renovação de token',
  TENANT_DELETED: 'Terreiro excluído',
};

export const ACTION_OPTIONS = ['create', 'update', 'delete', 'login', 'logout', 'token_refresh'] as const;

export const ACTION_TONES: Record<string, Tone> = {
  create: 'success',
  read: 'muted',
  update: 'warning',
  delete: 'destructive',
  login: 'info',
  logout: 'info',
  token_refresh: 'muted',
  TENANT_DELETED: 'destructive',
};

export const RESOURCE_LABELS: Record<string, string> = {
  User: 'Usuário',
  Ticket: 'Senha',
  Gira: 'Gira',
  TenantConfig: 'Configuração',
  GiraSenhaConfig: 'Config. de senha',
  Subscription: 'Assinatura',
  subscription: 'Assinatura',
  EstoqueGrupo: 'Grupo de material',
  EstoqueItem: 'Item de estoque',
  EstoqueMovimentacao: 'Movimentação de estoque',
  Tenant: 'Terreiro',
  Associado: 'Associado',
  Medium: 'Médium',
  Consulente: 'Consulente',
  MensalidadeConfig: 'Config. de mensalidade',
  MensalidadePagamento: 'Pagamento de mensalidade',
  CursoPresencial: 'Curso presencial',
  Site: 'Site',
};

export const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  email: 'E-mail',
  full_name: 'Nome completo',
  username: 'Usuário',
  phone: 'Telefone',
  impersonated_by: 'Impersonado por',
  is_bonus: 'Bônus',
  plan: 'Plano',
  mediun_id: 'Médium',
  associado_id: 'Associado',
  gira_id: 'Gira',
  data_inicio: 'Data de início',
  data_fim: 'Data de fim',
  endereco: 'Endereço',
  primary_color: 'Cor primária',
  secondary_color: 'Cor secundária',
  font_color: 'Cor da fonte',
  max_giras_per_month: 'Máx. giras/mês',
  max_tickets_per_gira: 'Máx. senhas/gira',
  enable_walk_in: 'Walk-in habilitado',
  enable_sponsors: 'Patrocinadores habilitados',
  validate_associado_on_emit: 'Validar associado na emissão',
  walk_in_limit: 'Limite walk-in',
  slug: 'Slug',
  role: 'Papel',
  status: 'Status',
  tipo: 'Tipo',
  numero: 'Número',
  success: 'Sucesso',
  ip_address: 'Endereço IP',
  valor_mensal: 'Valor mensal',
  dia_vencimento: 'Dia de vencimento',
  mensalidade_isento: 'Isento de mensalidade',
  release_end_at: 'Fim do release',
  release_start_at: 'Início do release',
  release_at: 'Data do release',
  max_tickets: 'Máx. senhas',
  gira_type: 'Tipo de gira',
  is_open: 'Aberta',
  is_visible: 'Visível',
  is_active: 'Ativo',
  walk_in_enabled: 'Walk-in habilitado',
  description: 'Descrição',
};

export const HIDDEN_FIELDS = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at',
  'password_hash', 'profile_photo_data', 'profile_photo_url',
  'profile_photo_content_type', 'user_agent', 'path', 'method',
  'custom_settings', 'logo_data', 'logo_content_type', 'logo_url',
  'comprovante_data', 'comprovante_content_type',
]);

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (Array.isArray(val)) return `${val.length} item(ns)`;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('plan' in obj && typeof obj.plan === 'string') {
      return `Plano: ${planLabel(obj.plan)}${obj.is_bonus ? ' + bônus' : ''}`;
    }
    return JSON.stringify(val);
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString('pt-BR');
  }
  if (UUID_RE.test(s)) return `${s.slice(0, 8)}…`;
  return s;
}

export function diffObjects(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      changes.push({ field: key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

export function isFailedLogin(entry: Pick<FeedEntry, 'action' | 'details'>): boolean {
  return entry.action === 'login' && entry.details?.success === false;
}

export function ActionBadge({ action }: { action: string }) {
  return <ToneBadge tone={ACTION_TONES[action] ?? 'muted'}>{actionLabel(action)}</ToneBadge>;
}

/** Detalhes do evento em texto legível (login, bulk, diff de update, delete, create). */
export function FormatDetails({ action, details, className }: { action: string; details?: Record<string, unknown> | null; className?: string }) {
  if (!details) return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;

  if (action === 'login' || action === 'logout') {
    const success = details.success !== false;
    const ip = details.ip_address as string | undefined;
    return (
      <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
        <ToneBadge tone={success ? 'success' : 'destructive'}>{success ? 'sucesso' : 'FALHA'}</ToneBadge>
        {ip && <span className="text-xs text-muted-foreground">IP: {ip}</span>}
      </span>
    );
  }

  const operationType = details.operation_type as string | undefined;
  if (operationType) {
    const opLabels: Record<string, string> = { bulk_mark_used: 'Marcar como usado', bulk_cancel: 'Cancelar em massa' };
    return (
      <span className={cn('text-sm', className)}>
        <strong>{opLabels[operationType] || operationType}</strong> — {String(details.count ?? 0)} registro(s)
      </span>
    );
  }

  const prev = (details.previous_state || details.previous_values) as Record<string, unknown> | undefined;
  const next = (details.new_state || details.new_values) as Record<string, unknown> | undefined;
  if (prev && next) {
    const changes = diffObjects(prev, next);
    if (!changes.length) return <span className={cn('text-sm text-muted-foreground', className)}>Sem alterações visíveis</span>;
    return (
      <ul className={cn('m-0 flex list-none flex-col gap-0.5 p-0', className)}>
        {changes.map(({ field, from, to }) => (
          <li key={field} className="flex flex-wrap items-baseline gap-1 text-xs">
            <span className="font-bold text-foreground">{fieldLabel(field)}:</span>
            <span className="text-destructive line-through break-words">{formatValue(from)}</span>
            <span aria-hidden>→</span>
            <span className="sr-only">para</span>
            <span className="font-bold text-success break-words">{formatValue(to)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (action === 'delete' && details.previous_state) {
    const state = details.previous_state as Record<string, unknown>;
    const label = (state.nome || state.email || state.numero) as string | undefined;
    return <span className={cn('text-sm text-destructive', className)}>Removido{label ? `: ${label}` : ''}</span>;
  }

  if (action === 'create') {
    const meaningful = Object.entries(details).filter(([k]) => !HIDDEN_FIELDS.has(k));
    if (!meaningful.length) return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
    return (
      <ul className={cn('m-0 flex list-none flex-col gap-0.5 p-0 text-xs', className)}>
        {meaningful.slice(0, 4).map(([key, val]) => (
          <li key={key}>
            <strong>{fieldLabel(key)}:</strong> {formatValue(val)}
          </li>
        ))}
      </ul>
    );
  }

  const raw = JSON.stringify(details);
  return (
    <span className={cn('text-xs break-words text-muted-foreground', className)}>
      {raw.length <= 100 ? raw : `${raw.slice(0, 100)}…`}
    </span>
  );
}
