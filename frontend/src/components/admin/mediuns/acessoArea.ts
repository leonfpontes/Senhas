/**
 * Acesso do médium à Área do Médium (AM-03) — tipos e regras usadas pela tela Médiuns.
 *
 * O backend devolve `acesso_area` em `GET /api/v1/admin/mediuns`; as ações (convidar,
 * reenviar, cancelar/tirar acesso, convidar em lote) só aparecem com `can('area_medium')`
 * e `canGroup('mediuns', 'edit')` — durante o piloto, sem PlanLocked.
 */
import { BR_TIME_ZONE } from '@/lib/dateBr';

export type AcessoAreaStatus = 'sem_acesso' | 'convite_enviado' | 'ativo';

export interface AcessoArea {
  status: AcessoAreaStatus;
  desde?: string | null;
  convite_enviado_em?: string | null;
  convite_expira_em?: string | null;
}

/** O pedaço do médium que as ações de acesso usam. */
export interface MediumAcesso {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  is_active: boolean;
  acesso_area?: AcessoArea | null;
}

/** Resposta de `POST /api/v1/admin/mediuns/{id}/convite`. */
export interface ConviteCriado {
  link: string;
  mensagem_whatsapp: string;
  whatsapp_url: string;
  email_mascarado: string;
  expira_em: string;
  acesso_area: AcessoArea;
}

export const ACESSO_LABEL: Record<AcessoAreaStatus, string> = {
  sem_acesso: 'Sem acesso',
  convite_enviado: 'Convite enviado',
  ativo: 'Ativo',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function emailValido(email?: string | null): boolean {
  return !!email && EMAIL_RE.test(email.trim());
}

/** Mesma máscara do backend (`medium_convite.mascarar_email`): o dirigente confere sem expor o e-mail. */
export function mascararEmail(email: string): string {
  const [local, dominio = ''] = email.trim().toLowerCase().split('@');
  const visivel = local.length > 3 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visivel}${'•'.repeat(Math.max(local.length - visivel.length, 3))}@${dominio}`;
}

export function statusDe(m: MediumAcesso): AcessoAreaStatus {
  return m.acesso_area?.status ?? 'sem_acesso';
}

/** Entra no "Convidar todos com e-mail": ativo, com e-mail e sem acesso nem convite em aberto. */
export function convidavelEmLote(m: MediumAcesso): boolean {
  return m.is_active && emailValido(m.email) && statusDe(m) === 'sem_acesso';
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? '';
}

/** ISO data-hora → "dd/mm/aaaa" no fuso de Brasília. */
export function dataBr(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: BR_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function detalheErro(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') {
    return (detail as { message: string }).message;
  }
  return fallback;
}
