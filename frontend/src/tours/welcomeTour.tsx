/**
 * Tour de boas-vindas no primeiro login, com trilha definida pela resposta
 * do cadastro "O que você mais precisa resolver?" (principal_dor).
 *
 * Diferente dos guias por tela (`adminTourSteps.ts`, abertos pelo "?"), este
 * abre sozinho uma única vez por usuário, só para admin e só em tenants que
 * responderam a pergunta (cadastros a partir de 2026-10-05) — clientes
 * antigos não são afetados.
 *
 * A trilha é a mesma do checklist de primeiros passos (`components/admin/onboardingTrilhas.ts`):
 * - "gira"/"senhas" (e "Ainda estou conhecendo"): boas-vindas → roteiro (checklist) → Porta →
 *   ajuda → "Criar gira";
 * - módulos (médiuns, financeiro, site, estoque): boas-vindas → roteiro com os passos da trilha →
 *   ajuda → botão do primeiro passo pendente do checklist (ex.: "Cadastrar médium"). A primeira
 *   gira continua no roteiro. Se o módulo estiver fora do plano, o tour cai na trilha da gira e
 *   o módulo aparece como "depois, quando quiser", com o plano necessário.
 *
 * Os passos não apontam para o menu lateral: ele muda por plano/permissão e
 * fica escondido numa gaveta no celular, onde está a maioria dos admins.
 * Os ancorados usam só elementos do dashboard (checklist, botão "?") e caem
 * para o centro se o elemento não estiver na tela.
 */
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useTour, type StepType } from '@reactour/tour';
import { Button } from '@/components/ui/button';
import { PRINCIPAL_DOR_OPTIONS, type PrincipalDor } from '@/constants/onboarding';
import { minPlanFor } from '@/constants/plans';
import { trackEvent } from '@/services/analytics';
import type { PlanFeatures } from '@/hooks/useSubscription';

export const CHECKLIST_SELECTOR = '[data-tour="first-gira-checklist"]';
export const HELP_BUTTON_SELECTOR = '[data-tour="topbar-help"]';
/**
 * Passos centralizados apontam para um seletor sem elemento: o reactour então
 * escurece a tela inteira e não rola a página (com `body` ele "destacava" a
 * página toda, sem escurecer, e rolava até o meio dela).
 */
export const CENTER_SELECTOR = '[data-tour="welcome-tour-center"]';
// Sem margem: com o padrão, o "buraco" do destaque (tamanho zero, sem elemento)
// aparecia como um quadradinho claro no canto superior esquerdo.
const CENTER_STEP = { selector: CENTER_SELECTOR, padding: { mask: 0 } } as const;

export const CREATE_GIRA_HREF = '/admin/giras?nova=1';

export const welcomeTourSeenKey = (userId: string) => `girahub:welcome-tour:seen:${userId}`;

interface ModuleHint {
  /** Onde fica, em texto (sem link: o tour não sai da gira). */
  text: string;
  /** Feature de plano (useSubscription.can) exigida — basta uma. */
  features?: (keyof PlanFeatures)[];
}

/** O módulo da dor, sugerido para depois da primeira gira. "senhas" e "outro" não têm. */
export const MODULE_HINTS: Partial<Record<PrincipalDor, ModuleHint>> = {
  mediuns: {
    text: 'cadastre a corrente em Médiuns: o painel avisa os aniversários da semana.',
    features: ['mediuns'],
  },
  financeiro: {
    // Mensalidade dos médiuns a partir do Basic; o caixa completo (contas_financeiras) é Premium.
    text: 'em Mensalidades você registra o pagamento de cada médium e vê quem está em dia.',
    features: ['mensalidade_mediun', 'contas_financeiras'],
  },
  divulgacao: {
    text: 'em Meu Site você publica a página do terreiro com as próximas giras.',
    features: ['site_builder'],
  },
  estoque: {
    text: 'em Estoque você cadastra velas, ervas e bebidas e é avisado quando algo está acabando.',
    features: ['estoque_controle'],
  },
};

/** Próximo passo do checklist (o primeiro pendente que a pessoa consegue fazer). */
export interface WelcomeNextStep {
  key: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
}

export interface WelcomeTourContext {
  dor: PrincipalDor;
  /** Trilha do checklist (mesma do backend). Ausente = trilha da gira. */
  trilha?: string;
  /** Títulos dos passos do checklist, na ordem. */
  checklistTitles?: string[];
  nextStep?: WelcomeNextStep | null;
  firstName?: string | null;
  /** Feature de plano disponível (useSubscription().can). */
  can: (feature: keyof PlanFeatures) => boolean;
  /** Fecha o tour (usado pelos botões que navegam). */
  close: () => void;
  hasChecklist: boolean;
  hasHelpButton: boolean;
}

function StepBody({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div data-slot="tour-step" className="text-sm leading-relaxed">
      {title && <p className="mb-1.5 text-base font-bold">{title}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CreateGiraButton({ ctx }: { ctx: WelcomeTourContext }) {
  return (
    <Button asChild size="sm" className="mt-1 no-underline">
      <Link
        href={CREATE_GIRA_HREF}
        onClick={() => {
          trackEvent('welcome_tour_cta', { trilha: ctx.dor, href: CREATE_GIRA_HREF });
          ctx.close();
        }}
      >
        Criar gira
      </Link>
    </Button>
  );
}

function moduleHintText(ctx: WelcomeTourContext): string | null {
  const hint = MODULE_HINTS[ctx.dor];
  if (!hint) return null;
  const available = !hint.features || hint.features.some((f) => ctx.can(f));
  if (available) return `Depois, quando quiser: ${hint.text}`;
  const plan = hint.features?.length ? minPlanFor(hint.features[0]) : null;
  const where = plan ? `${plan.key === 'premium' ? 'só no' : 'a partir do'} plano ${plan.label}` : '';
  return `Depois, quando quiser: ${hint.text}${plan ? ` (disponível ${where})` : ''}`;
}

const TRILHAS_DA_GIRA = new Set(['gira', 'senhas']);

/** Trilha de módulo com um próximo passo do próprio módulo (não travado pelo plano). */
function moduleFirst(ctx: WelcomeTourContext): WelcomeNextStep | null {
  if (!ctx.trilha || TRILHAS_DA_GIRA.has(ctx.trilha)) return null;
  const next = ctx.nextStep;
  return next && next.key !== 'gira' && next.cta ? next : null;
}

export function buildWelcomeTourSteps(ctx: WelcomeTourContext): StepType[] {
  const option = PRINCIPAL_DOR_OPTIONS.find((o) => o.value === ctx.dor);
  const name = ctx.firstName?.trim();
  const steps: StepType[] = [];
  const modulo = moduleFirst(ctx);

  steps.push({
    ...CENTER_STEP,
    position: 'center',
    content: (
      <StepBody title={name ? `Bem-vindo ao GiraHub, ${name}!` : 'Bem-vindo ao GiraHub!'}>
        {ctx.dor === 'outro'
          ? 'Preparamos um guia rápido com o essencial: sua primeira gira com senhas pelo WhatsApp.'
          : modulo
            ? `Você contou que quer ${option?.phrase ?? 'organizar o terreiro'}. Montamos um roteiro curto para isso, começando por: ${modulo.title.toLowerCase()}.`
            : `Você contou que quer ${option?.phrase ?? 'organizar o terreiro'}. Começamos pela primeira gira, que é onde tudo se junta.`}
      </StepBody>
    ),
  });

  if (ctx.hasChecklist) {
    steps.push({
      selector: CHECKLIST_SELECTOR,
      content: (
        <StepBody title="Seu roteiro de primeiros passos">
          {modulo && ctx.checklistTitles?.length
            ? `${ctx.checklistTitles.join(' → ')}. Cada passo se completa sozinho.`
            : 'Crie a gira, mande o link de senhas no grupo de WhatsApp do terreiro e, no dia, use a Porta. Cada passo se completa sozinho.'}
        </StepBody>
      ),
    });
  }

  if (!modulo) {
    steps.push({
      ...CENTER_STEP,
      position: 'center',
      content: (
        <StepBody title="No dia da gira, use a Porta">
          Abra a Porta no celular: ela mostra quem já pegou senha, faz o check-in na entrada e chama as senhas na ordem.
        </StepBody>
      ),
    });
  }

  if (ctx.hasHelpButton) {
    steps.push({
      selector: HELP_BUTTON_SELECTOR,
      content: (
        <StepBody title="Dúvida? Toque aqui">
          Cada tela tem o seu próprio guia. Sempre que precisar, é só tocar neste botão.
        </StepBody>
      ),
    });
  }

  // Trilha de módulo: o último passo é o primeiro pendente do checklist.
  if (modulo?.cta) {
    const { label, href } = modulo.cta;
    steps.push({
      ...CENTER_STEP,
      position: 'center',
      content: (
        <StepBody title={`Agora: ${modulo.title.toLowerCase()}`}>
          <p>{modulo.description}</p>
          <p className="text-muted-foreground">A primeira gira também está no roteiro, para quando você quiser.</p>
          <Button asChild size="sm" className="mt-1 no-underline">
            <Link
              href={href}
              onClick={() => {
                trackEvent('welcome_tour_cta', { trilha: ctx.dor, href });
                ctx.close();
              }}
            >
              {label}
            </Link>
          </Button>
        </StepBody>
      ),
    });
    return steps;
  }

  // Último passo das trilhas da gira (e de módulo fora do plano): criar a gira.
  const hint = moduleHintText(ctx);
  steps.push({
    ...CENTER_STEP,
    position: 'center',
    content: (
      <StepBody title="Agora, sua primeira gira">
        <p>Leva uns 3 minutos: data, horário e quantas senhas. O link para o WhatsApp sai pronto.</p>
        {hint && <p className="text-muted-foreground">{hint}</p>}
        <CreateGiraButton ctx={ctx} />
      </StepBody>
    ),
  });

  return steps;
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* storage bloqueado — o tour pode reaparecer; aceitável */
  }
}

export interface UseWelcomeTourArgs {
  /** Dados prontos e usuário elegível (admin, tenant com principal_dor). */
  enabled: boolean;
  dor: PrincipalDor | null | undefined;
  trilha?: string;
  checklistTitles?: string[];
  nextStep?: WelcomeNextStep | null;
  userId: string | null | undefined;
  firstName?: string | null;
  can: (feature: keyof PlanFeatures) => boolean;
}

/**
 * Abre o tour de boas-vindas uma única vez por usuário (flag no
 * localStorage). Espera um instante para o checklist do dashboard montar,
 * já que o tour ancora nele quando existe.
 */
export function useWelcomeTour({
  enabled,
  dor,
  userId,
  firstName,
  can,
  trilha,
  checklistTitles,
  nextStep,
}: UseWelcomeTourArgs): void {
  const { setSteps, setIsOpen, setCurrentStep } = useTour();

  useEffect(() => {
    if (!enabled || !dor || !userId) return;
    const key = welcomeTourSeenKey(userId);
    if (readFlag(key)) return;

    const timer = window.setTimeout(() => {
      writeFlag(key);
      const steps = buildWelcomeTourSteps({
        dor,
        trilha,
        checklistTitles,
        nextStep,
        firstName,
        can,
        close: () => setIsOpen(false),
        hasChecklist: !!document.querySelector(CHECKLIST_SELECTOR),
        hasHelpButton: !!document.querySelector(HELP_BUTTON_SELECTOR),
      });
      setSteps?.(steps);
      setCurrentStep(0);
      setIsOpen(true);
      trackEvent('welcome_tour_open', { trilha: dor });
    }, 600);

    return () => window.clearTimeout(timer);
    // `can`/`firstName`/`nextStep` mudam de identidade a cada render; o disparo depende
    // só de habilitação, trilha e usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dor, userId]);
}
