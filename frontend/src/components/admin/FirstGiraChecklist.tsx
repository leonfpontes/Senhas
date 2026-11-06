/**
 * Checklist de primeiros passos do dashboard, por trilha (`onboardingTrilhas.ts`).
 *
 * A trilha segue a resposta do cadastro "O que você mais precisa resolver?" (senhas, médiuns,
 * financeiro, site, estoque). Sem resposta (terreiros antigos) ou "Ainda estou conhecendo", é o
 * ciclo que gera valor no GiraHub (análise de produção de 2026-10-05): criar gira → compartilhar
 * o link de senhas → receber senhas pelo link → usar a Porta no dia da gira. Enquanto o terreiro
 * não estiver ativado, o dashboard é só este checklist (sem KPIs).
 *
 * O estado vem do backend (`onboarding` no /dashboard-summary). No localStorage, por tenant,
 * ficam só "já compartilhei", "ocultar" e a flag "primeiros passos pendentes" que a sidebar lê
 * para mostrar o item "Primeiros passos".
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Lock, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setAnalyticsTag, trackEvent } from '@/services/analytics';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ShareLinkDialog, buildWhatsAppShareUrl, type ShareKind } from '@/components/admin/ShareLinkDialog';
import {
  TRILHA_TITULOS,
  resolveTrilha,
  trilhaConcluida,
  trilhaDe,
  type OnboardingStepStatus,
  type ResolvedStep,
  type TrilhaGates,
} from '@/components/admin/onboardingTrilhas';
import { minPlanPhrase } from '@/constants/plans';

export { buildWhatsAppShareUrl };

export interface OnboardingStatus {
  has_gira: boolean;
  public_tickets: number;
  door_used: boolean;
  public_link: string | null;
  completed: boolean;
  /** Resposta do cadastro; define a trilha do tour de boas-vindas e deste checklist. */
  principal_dor?: string | null;
  /** Trilha e passos com "feito" calculados pelo backend (ausentes em respostas antigas). */
  trilha?: string | null;
  steps?: OnboardingStepStatus[] | null;
}

export interface FirstGiraChecklistProps {
  status: OnboardingStatus;
  tenantId?: string | null;
  tenantName?: string | null;
  /** Mantido por compatibilidade; as cores vêm dos tokens do terreiro. */
  primary?: string;
  canCreateGira: boolean;
  canViewPorta: boolean;
  /** Recurso do plano liberado (useSubscription().can) — trava passos de módulos fora do plano. */
  canPlan?: TrilhaGates['canPlan'];
  /** Permissão de grupo (usePermissions().can); sem ela, usa canCreateGira/canViewPorta. */
  canGroup?: TrilhaGates['canGroup'];
  /** Dashboard em tela cheia (terreiro ainda não ativado). */
  fullscreen?: boolean;
  onDismiss?: () => void;
}

/**
 * A partir de quantas senhas pelo link o terreiro conta como ativado e o checklist some,
 * mesmo sem usar a Porta (ex.: tenant pagante que só usa a emissão).
 */
export const ACTIVATED_PUBLIC_TICKETS = 20;

const ONBOARDING_CHANGED_EVENT = 'girahub:onboarding-changed';

const storageKey = (kind: 'dismissed' | 'shared' | 'pending', tenantId?: string | null) =>
  `girahub:first-gira-checklist:${kind}:${tenantId ?? 'unknown'}`;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    /* modo privado / storage bloqueado — segue só na memória */
  }
}

const ALLOW_ALL: TrilhaGates = { canPlan: () => true, canGroup: () => true };

/**
 * Terreiro ativado: trilha concluída (sem contar passos travados pelo plano) ou já com senhas
 * suficientes pelo link.
 */
export function isTenantActivated(status: OnboardingStatus, gates: Partial<TrilhaGates> = {}): boolean {
  if (status.public_tickets >= ACTIVATED_PUBLIC_TICKETS) return true;
  return trilhaConcluida(resolveTrilha(status, { ...ALLOW_ALL, ...gates }));
}

export function readChecklistDismissed(tenantId?: string | null): boolean {
  return readFlag(storageKey('dismissed', tenantId));
}

/** "Esconder os primeiros passos" (no topo do Início, J1 v2 · 07): some com a trilha. */
export function writeChecklistDismissed(tenantId?: string | null): void {
  writeFlag(storageKey('dismissed', tenantId), true);
  writeOnboardingPending(tenantId, false);
  trackEvent('onboarding_dismiss');
}

/** "Mostrar primeiros passos" no menu do usuário: volta a exibir o checklist. */
export function resetChecklistDismissed(tenantId?: string | null): void {
  writeFlag(storageKey('dismissed', tenantId), false);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
}

/** Flag lida pela sidebar ("Primeiros passos" aparece enquanto pendente). */
export function writeOnboardingPending(tenantId: string | null | undefined, pending: boolean): void {
  writeFlag(storageKey('pending', tenantId), pending);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
}

export function useOnboardingPending(tenantId?: string | null): boolean {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const read = () => setPending(readFlag(storageKey('pending', tenantId)));
    read();
    window.addEventListener(ONBOARDING_CHANGED_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [tenantId]);
  return pending;
}

interface Step {
  key: string;
  title: string;
  done: boolean;
  description: React.ReactNode;
  actions?: React.ReactNode;
}

export default function FirstGiraChecklist({
  status,
  tenantId,
  tenantName,
  canCreateGira,
  canViewPorta,
  canPlan,
  canGroup,
  fullscreen = false,
  onDismiss,
}: FirstGiraChecklistProps) {
  // localStorage só no cliente (evita mismatch de hidratação).
  const [dismissed, setDismissed] = useState(false);
  const [shared, setShared] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [, setTested] = useState(false);

  useEffect(() => {
    setDismissed(readFlag(storageKey('dismissed', tenantId)));
    setShared(readFlag(storageKey('shared', tenantId)));
    setHydrated(true);
  }, [tenantId]);

  const link = status.public_link;
  const hasPublicTickets = status.public_tickets > 0;

  const markShared = useCallback(() => {
    setShared((prev) => {
      if (!prev) writeFlag(storageKey('shared', tenantId), true);
      return true;
    });
  }, [tenantId]);

  const handleShared = (kind: ShareKind) => {
    if (kind === 'whatsapp') {
      markShared();
      trackEvent('onboarding_share_whatsapp');
    } else if (kind === 'copy') {
      markShared();
      trackEvent('onboarding_copy_link');
    } else {
      trackEvent('onboarding_test_link');
    }
  };

  const handleTestLink = () => {
    setTested(true);
    trackEvent('onboarding_test_link');
  };

  const handleConfirmShared = () => {
    markShared();
    trackEvent('onboarding_confirm_shared');
  };

  const handleDismiss = () => {
    setDismissed(true);
    writeFlag(storageKey('dismissed', tenantId), true);
    trackEvent('onboarding_dismiss');
    onDismiss?.();
  };

  const shareActions = link ? (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button asChild variant="outline" className="h-[42px]">
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={handleTestLink}>
          <ExternalLink aria-hidden /> Testar o link
        </a>
      </Button>
      <Button type="button" className="h-[42px]" onClick={() => setShareOpen(true)}>
        <Share2 aria-hidden /> Compartilhar link
      </Button>
      {!shared && (
        <Button type="button" variant="link" className="h-[42px] px-1" onClick={handleConfirmShared}>
          <Check aria-hidden /> Já compartilhei
        </Button>
      )}
    </div>
  ) : null;

  const gates: TrilhaGates = {
    canPlan: canPlan ?? (() => true),
    canGroup:
      canGroup ??
      ((feature, action) => {
        if (feature === 'giras' && action === 'insert') return canCreateGira;
        if (feature === 'porta') return canViewPorta;
        return true;
      }),
    shared,
  };
  const trilha = trilhaDe(status);
  const titulos = TRILHA_TITULOS[trilha];
  const resolved = resolveTrilha(status, gates);

  const lockedNote = (step: ResolvedStep) =>
    step.locked === 'plan' && step.plan ? (
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Disponível {minPlanPhrase(step.plan)}.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/billing">Ver planos</Link>
        </Button>
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">
        {step.key === 'gira'
          ? 'Peça a um administrador do terreiro para criar a gira.'
          : 'Peça a um administrador do terreiro para fazer este passo.'}
      </p>
    );

  const ctaFor = (step: ResolvedStep) => {
    if (step.locked) return lockedNote(step);
    if (!step.cta) return null;
    const { label, href, event } = step.cta;
    return (
      <Button asChild size="sm" variant={step.key === 'porta' ? 'outline' : 'default'}>
        <Link href={href} onClick={() => trackEvent(event ?? 'onboarding_cta', { trilha, passo: step.key })}>
          {label}
        </Link>
      </Button>
    );
  };

  const steps: Step[] = resolved.map((step) => {
    if (step.key === 'share') {
      return {
        key: step.key,
        title: step.title,
        done: step.done,
        description: (
          <>
            {step.description}
            {link && <span className="mt-1 block font-mono text-xs break-all text-foreground">{link}</span>}
          </>
        ),
        actions: shareActions,
      };
    }
    if (step.key === 'tickets') {
      return {
        key: step.key,
        title: step.title,
        done: step.done,
        description: hasPublicTickets ? `${status.public_tickets} senha(s) já recebida(s) pelo link.` : step.description,
        actions: shareActions,
      };
    }
    if (step.key === 'porta' && step.locked === 'perm') {
      // Sem acesso à Porta: só a explicação (como antes), sem pedir para outra pessoa.
      return { key: step.key, title: step.title, done: step.done, description: step.description, actions: null };
    }
    return { key: step.key, title: step.title, done: step.done, description: step.description, actions: ctaFor(step) };
  });

  const doneCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);

  const activated = status.public_tickets >= ACTIVATED_PUBLIC_TICKETS || trilhaConcluida(resolved);
  const hidden = activated || dismissed || !hydrated;

  useEffect(() => {
    if (!hydrated) return;
    writeOnboardingPending(tenantId, !activated && !dismissed);
  }, [hydrated, tenantId, activated, dismissed]);

  useEffect(() => {
    if (hidden) return;
    setAnalyticsTag('onboarding_step', String(currentIndex + 1));
  }, [hidden, currentIndex]);

  if (hidden) return null;

  // J1 v2 · 07: a peça PrimeirosPassos — título em Fraunces, "2 de 5" com a barra e cada passo
  // feito / agora / depois entre filetes; só o passo da vez traz as ações.
  return (
    <section
      data-testid="first-gira-checklist"
      data-tour="first-gira-checklist"
      data-trilha={trilha}
      aria-labelledby="primeiros-passos-titulo"
      className={cn('flex flex-col gap-3.5', fullscreen ? 'w-full max-w-3xl' : 'mb-6')}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="primeiros-passos-titulo" className="font-display text-[1.75rem] leading-tight font-normal tracking-[-0.02em] sm:text-[2rem]">
            {titulos.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{titulos.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.9375rem] font-semibold text-[color:var(--color-barro-700)]">
            {doneCount} de {steps.length}
          </span>
          {!fullscreen && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleDismiss} aria-label="Ocultar primeiros passos">
              <X aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <Progress value={(doneCount / steps.length) * 100} className="h-1.5" aria-label="Progresso dos primeiros passos" />

      <ol className="m-0 list-none border-b border-border p-0">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const estado = step.done ? 'feito' : isCurrent ? 'agora' : 'depois';
          return (
            <li
              key={step.key}
              data-testid={`checklist-step-${step.key}`}
              data-done={step.done ? 'true' : 'false'}
              aria-current={isCurrent ? 'step' : undefined}
              className="border-t border-border py-5"
            >
              <div className="flex items-center gap-4">
                {step.done ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-folha-600)]">
                    <Check className="size-4 text-white" aria-label="Concluído" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-sm',
                      isCurrent ? 'bg-primary font-bold text-primary-foreground' : 'border-[1.5px] border-border font-semibold text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      isCurrent
                        ? 'font-display text-[1.625rem] leading-tight font-medium tracking-[-0.015em] text-foreground'
                        : step.done
                          ? 'text-[1.0625rem] font-medium text-muted-foreground'
                          : 'text-[1.0625rem] font-semibold text-foreground',
                    )}
                  >
                    {step.title}
                  </p>
                  <div className="mt-1 text-sm text-muted-foreground">{step.description}</div>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-[0.8125rem] font-semibold',
                    estado === 'feito' ? 'text-[color:var(--color-folha-700)]' : estado === 'agora' ? 'text-[color:var(--color-barro-700)]' : 'text-muted-foreground',
                  )}
                >
                  {estado}
                </span>
              </div>
              {isCurrent && step.actions && <div className="mt-4 pl-12">{step.actions}</div>}
            </li>
          );
        })}
      </ol>

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={link}
        tenantName={tenantName}
        onShared={handleShared}
      />
    </section>
  );
}
