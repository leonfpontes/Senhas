/**
 * SubscriptionDrawer — assinatura de um terreiro (plano e bônus) num CrudDrawer.
 *
 * Mesmas chamadas da tela antiga de tenants:
 *   GET   /api/v1/platform/subscriptions/{tenant_id}
 *   PATCH /api/v1/platform/subscriptions/{tenant_id}/bonus      { is_bonus, plan? }
 *   PUT   /api/v1/platform/subscriptions/{tenant_id}/upgrade    { plan }
 *   POST  /api/v1/platform/subscriptions/{tenant_id}/suspend | /reactivate
 */
import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PLAN_META, PLAN_ORDER, type PlanKey } from './planMeta';
import { PlanBadge, SubscriptionStatusBadge, ToneBadge } from './PlanBadge';
import { fmtDate, fmtMoney } from './format';

export interface SubscriptionDetail {
  id?: string;
  tenant_id?: string;
  plan: string;
  status: string;
  max_users: number;
  max_giras_per_month: number;
  current_users: number;
  monthly_price: number;
  is_trial: boolean;
  trial_ends_at?: string | null;
  is_bonus?: boolean;
}

export interface SubscriptionDrawerTenant {
  id: string;
  name: string;
  plan: string | null;
  is_bonus: boolean | null;
}

interface SubscriptionDrawerProps {
  open: boolean;
  tenant: SubscriptionDrawerTenant | null;
  /** Abre já com "Bonificado" selecionado (atalho "Dar bônus a X"). */
  presetBonus?: boolean;
  onClose: () => void;
  /** Chamado depois de salvar/suspender/reativar com sucesso. */
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
}

const BONUS_PLANS: PlanKey[] = ['basic', 'pro', 'premium'];

function limitLabel(n: number): string {
  return n < 0 || n >= 99999 ? '∞' : String(n);
}

export function SubscriptionDrawer({ open, tenant, presetBonus = false, onClose, onSaved, onError }: SubscriptionDrawerProps) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBonus, setIsBonus] = useState(false);
  const [plan, setPlan] = useState<string>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<'suspend' | 'reactivate' | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const originalBonus = tenant?.is_bonus ?? false;
  const originalPlan = tenant?.plan ?? 'basic';

  useEffect(() => {
    if (!open || !tenant) return;
    const startBonus = presetBonus || originalBonus;
    setIsBonus(startBonus);
    setPlan(startBonus && (!tenant.plan || tenant.plan === 'free') ? 'pro' : (tenant.plan ?? 'basic'));
    setError(null);
    setDetail(null);
    setLoading(true);
    let cancelled = false;
    apiClient
      .get<SubscriptionDetail>(`/api/v1/platform/subscriptions/${tenant.id}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch(() => {
        /* o drawer funciona com os dados parciais do tenant */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenant, presetBonus, originalBonus]);

  const isDirty = isBonus !== originalBonus || plan !== originalPlan;

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    setError(null);
    try {
      if (isBonus) {
        await apiClient.patch(`/api/v1/platform/subscriptions/${tenant.id}/bonus`, { is_bonus: true, plan });
      } else if (originalBonus) {
        await apiClient.patch(`/api/v1/platform/subscriptions/${tenant.id}/bonus`, { is_bonus: false });
      } else if (plan !== originalPlan) {
        await apiClient.put(`/api/v1/platform/subscriptions/${tenant.id}/upgrade`, { plan });
      }
      onSaved?.(`Assinatura de "${tenant.name}" atualizada.`);
      onClose();
    } catch (err) {
      const msg = extractApiErrorMessage(err, 'Erro ao salvar assinatura');
      setError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async () => {
    if (!tenant || !confirmStatus) return;
    setStatusBusy(true);
    try {
      await apiClient.post(`/api/v1/platform/subscriptions/${tenant.id}/${confirmStatus}`);
      onSaved?.(confirmStatus === 'suspend' ? `Assinatura de "${tenant.name}" suspensa.` : `Assinatura de "${tenant.name}" reativada.`);
      setConfirmStatus(null);
      onClose();
    } catch (err) {
      const msg = extractApiErrorMessage(err, 'Erro ao alterar o status da assinatura');
      setError(msg);
      onError?.(msg);
      setConfirmStatus(null);
    } finally {
      setStatusBusy(false);
    }
  };

  const planOptions = isBonus ? BONUS_PLANS : PLAN_ORDER;

  return (
    <>
      <CrudDrawer
        open={open}
        onClose={onClose}
        title="Assinatura"
        subtitle={tenant?.name ?? ''}
        icon={<CreditCard />}
        onSave={handleSave}
        saveLabel="Salvar"
        saving={saving}
        saveDisabled={!isDirty}
        isDirty={isDirty}
        error={error}
      >
        {loading ? (
          <div className="flex justify-center py-4" role="status" aria-label="Carregando assinatura">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : detail ? (
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <PlanBadge plan={detail.plan} bonus={detail.is_bonus} />
              <SubscriptionStatusBadge status={detail.status} />
              {detail.is_trial && (
                <ToneBadge tone="warning" title={detail.trial_ends_at ? `Termina em ${fmtDate(detail.trial_ends_at)}` : undefined}>
                  Trial
                </ToneBadge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Usuários: {detail.current_users} / {limitLabel(detail.max_users)} · Giras/mês: {limitLabel(detail.max_giras_per_month)}
              {detail.monthly_price > 0 && ` · ${fmtMoney(detail.monthly_price)}/mês`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.status === 'active' ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmStatus('suspend')}>
                  Suspender assinatura
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmStatus('reactivate')}>
                  Reativar assinatura
                </Button>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="sub-access">Tipo de acesso</Label>
          <Select
            value={isBonus ? 'bonus' : 'normal'}
            onValueChange={(v) => {
              const bonus = v === 'bonus';
              setIsBonus(bonus);
              if (bonus && (!plan || plan === 'free')) setPlan('pro');
            }}
          >
            <SelectTrigger id="sub-access" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal (pago via Stripe)</SelectItem>
              <SelectItem value="bonus">Bonificado (gratuito)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="sub-plan">Plano</Label>
          <Select value={plan} onValueChange={setPlan} disabled={!isBonus && tenant?.is_bonus === false}>
            <SelectTrigger id="sub-plan" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planOptions.map((key) => {
                const meta = PLAN_META[key];
                const users = meta.limits.users === null ? 'usuários ilimitados' : `até ${meta.limits.users} usuário${meta.limits.users === 1 ? '' : 's'}`;
                return (
                  <SelectItem key={key} value={key}>
                    {meta.label} — {users}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!isBonus && tenant?.is_bonus === false && (
            <p className="text-xs text-muted-foreground">Plano pago muda pelo Stripe; aqui só com bônus.</p>
          )}
        </div>

        {!isBonus && originalBonus && (
          <Alert variant="warning">
            <AlertDescription>
              Ao remover o bônus, o terreiro volta ao plano Free até fazer uma nova assinatura pelo Stripe.
            </AlertDescription>
          </Alert>
        )}
      </CrudDrawer>

      <ConfirmDialog
        open={confirmStatus !== null}
        title={confirmStatus === 'suspend' ? 'Suspender assinatura' : 'Reativar assinatura'}
        message={
          confirmStatus === 'suspend' ? (
            <>O terreiro <strong>{tenant?.name}</strong> perde o acesso aos recursos do plano até ser reativado.</>
          ) : (
            <>A assinatura de <strong>{tenant?.name}</strong> volta a ficar ativa.</>
          )
        }
        destructive={confirmStatus === 'suspend'}
        confirmText={confirmStatus === 'suspend' ? 'Suspender' : 'Reativar'}
        loading={statusBusy}
        onConfirm={handleStatus}
        onCancel={() => setConfirmStatus(null)}
      />
    </>
  );
}

export default SubscriptionDrawer;
