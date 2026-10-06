/**
 * Checklist "primeira gira" do dashboard.
 *
 * Guia o terreiro novo pelo ciclo que gera valor no GiraHub (análise de produção de
 * 2026-10-05): criar gira → compartilhar o link de senhas → receber senhas pelo link → usar a
 * Porta no dia da gira. Enquanto o terreiro não estiver ativado, o dashboard é só este
 * checklist (sem KPIs).
 *
 * O estado vem do backend (`onboarding` no /dashboard-summary). No localStorage, por tenant,
 * ficam só "já compartilhei", "ocultar" e a flag "primeiros passos pendentes" que a sidebar lê
 * para mostrar o item "Primeiros passos".
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CircleCheck, ExternalLink, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setAnalyticsTag, trackEvent } from '@/services/analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ShareLinkDialog, buildWhatsAppShareUrl, type ShareKind } from '@/components/admin/ShareLinkDialog';

export { buildWhatsAppShareUrl };

export interface OnboardingStatus {
  has_gira: boolean;
  public_tickets: number;
  door_used: boolean;
  public_link: string | null;
  completed: boolean;
  /** Resposta do cadastro; define a trilha do tour de boas-vindas. */
  principal_dor?: string | null;
}

export interface FirstGiraChecklistProps {
  status: OnboardingStatus;
  tenantId?: string | null;
  tenantName?: string | null;
  /** Mantido por compatibilidade; as cores vêm dos tokens do terreiro. */
  primary?: string;
  canCreateGira: boolean;
  canViewPorta: boolean;
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

/** Terreiro ativado: checklist concluído ou já com senhas suficientes pelo link. */
export function isTenantActivated(status: OnboardingStatus): boolean {
  return status.completed || status.public_tickets >= ACTIVATED_PUBLIC_TICKETS;
}

export function readChecklistDismissed(tenantId?: string | null): boolean {
  return readFlag(storageKey('dismissed', tenantId));
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
  fullscreen = false,
  onDismiss,
}: FirstGiraChecklistProps) {
  // localStorage só no cliente (evita mismatch de hidratação).
  const [dismissed, setDismissed] = useState(false);
  const [shared, setShared] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tested, setTested] = useState(false);

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
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={handleTestLink}>
          <ExternalLink aria-hidden /> Testar o link
        </a>
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setShareOpen(true)}>
        <Share2 aria-hidden /> Compartilhar link
      </Button>
      {tested && !shared && (
        <Button type="button" size="sm" variant="secondary" onClick={handleConfirmShared}>
          <Check aria-hidden /> Já compartilhei
        </Button>
      )}
    </div>
  ) : null;

  const steps: Step[] = [
    {
      key: 'gira',
      title: 'Crie sua primeira gira',
      done: status.has_gira,
      description: 'Defina a data, o horário e quantas senhas liberar. Leva menos de um minuto.',
      actions: canCreateGira ? (
        <Button asChild size="sm">
          <Link href="/admin/giras?nova=1" onClick={() => trackEvent('onboarding_cta_create_gira')}>
            Criar gira
          </Link>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Peça a um administrador do terreiro para criar a gira.</p>
      ),
    },
    {
      key: 'share',
      title: 'Compartilhe o link de senhas',
      done: shared || hasPublicTickets,
      description: (
        <>
          É por este link que os consulentes pegam a senha pelo celular. Teste no seu próprio celular e mande
          no grupo de WhatsApp do terreiro: ele vale para todas as giras, então é só compartilhar uma vez.
          {link && <span className="mt-1 block font-mono text-xs break-all text-foreground">{link}</span>}
        </>
      ),
      actions: shareActions,
    },
    {
      key: 'tickets',
      title: 'Receba as primeiras senhas',
      done: hasPublicTickets,
      description: hasPublicTickets
        ? `${status.public_tickets} senha(s) já recebida(s) pelo link.`
        : 'Assim que alguém pegar uma senha pelo link, este passo se completa sozinho. Dica: abra o link no seu celular e pegue uma senha de teste.',
      actions: shareActions,
    },
    {
      key: 'porta',
      title: 'Use a Porta no dia da gira',
      done: status.door_used,
      description: 'Na hora da gira, abra a Porta no celular para marcar quem chegou e chamar as senhas na ordem.',
      actions: canViewPorta ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/porta" onClick={() => trackEvent('onboarding_cta_porta')}>
            Abrir a Porta
          </Link>
        </Button>
      ) : null,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);

  const hidden = isTenantActivated(status) || dismissed || !hydrated;

  useEffect(() => {
    if (!hydrated) return;
    writeOnboardingPending(tenantId, !isTenantActivated(status) && !dismissed);
  }, [hydrated, tenantId, status, dismissed]);

  useEffect(() => {
    if (hidden) return;
    setAnalyticsTag('onboarding_step', String(currentIndex + 1));
  }, [hidden, currentIndex]);

  if (hidden) return null;

  return (
    <Card
      data-testid="first-gira-checklist"
      data-tour="first-gira-checklist"
      className={cn('border-primary/60 py-0', fullscreen ? 'mx-auto w-full max-w-2xl' : 'mb-6')}
    >
      <CardContent className={cn('px-4 py-4 sm:px-6 sm:py-6')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={cn('font-bold tracking-tight', fullscreen ? 'text-2xl' : 'text-lg')}>
              Primeiros passos: sua primeira gira
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Siga estes passos para os consulentes começarem a pegar senha pelo celular.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={handleDismiss} aria-label="Ocultar primeiros passos">
            <X aria-hidden />
          </Button>
        </div>

        <div className="mt-4 mb-2 flex items-center gap-3">
          <Progress value={(doneCount / steps.length) * 100} className="h-1.5 flex-1" aria-label="Progresso dos primeiros passos" />
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {doneCount} de {steps.length}
          </span>
        </div>

        <ol className="m-0 list-none p-0">
          {steps.map((step, i) => {
            const isCurrent = i === currentIndex;
            return (
              <li
                key={step.key}
                data-testid={`checklist-step-${step.key}`}
                data-done={step.done ? 'true' : 'false'}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn('flex gap-3 py-3', i > 0 && 'border-t')}
              >
                <div className="shrink-0 pt-px">
                  {step.done ? (
                    <CircleCheck className="size-6 text-success" aria-label="Concluído" />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full border-2 text-xs font-bold',
                        isCurrent ? 'border-primary text-primary' : 'border-border text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm',
                      isCurrent ? 'font-bold' : 'font-medium',
                      step.done ? 'text-muted-foreground line-through' : 'text-foreground',
                    )}
                  >
                    {step.title}
                  </p>
                  {isCurrent && (
                    <div>
                      <div className="mt-1 text-sm text-muted-foreground">{step.description}</div>
                      {step.actions && <div className="mt-3">{step.actions}</div>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={link}
        tenantName={tenantName}
        onShared={handleShared}
      />
    </Card>
  );
}
