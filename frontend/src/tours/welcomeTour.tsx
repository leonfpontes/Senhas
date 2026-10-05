/**
 * Tour de boas-vindas no primeiro login, com trilha definida pela resposta
 * do cadastro "O que você mais precisa resolver?" (principal_dor).
 *
 * Diferente dos guias por tela (`adminTourSteps.ts`, abertos pelo "?"), este
 * abre sozinho uma única vez por usuário, só para admin e só em tenants que
 * responderam a pergunta (cadastros a partir de 2026-10-05) — clientes
 * antigos não são afetados.
 *
 * Os passos não apontam para o menu lateral: ele muda por plano/permissão e
 * fica escondido numa gaveta no celular, onde está a maioria dos admins.
 * Passos centralizados levam à tela certa por botão; os ancorados usam só
 * elementos do dashboard (checklist, botão "?") e caem para o centro se o
 * elemento não estiver na tela.
 */
import React, { useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import Link from 'next/link';
import { useTour, type StepType } from '@reactour/tour';
import { PRINCIPAL_DOR_OPTIONS, type PrincipalDor } from '@/constants/onboarding';
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

export const welcomeTourSeenKey = (userId: string) => `girahub:welcome-tour:seen:${userId}`;

interface Trail {
  title: string;
  body: string;
  cta?: { label: string; href: string };
  /** Feature de plano (useSubscription.can) exigida pela trilha — basta uma. */
  features?: (keyof PlanFeatures)[];
}

/** Trilhas que levam a um módulo específico. "senhas" e "outro" usam o checklist. */
const MODULE_TRAILS: Partial<Record<PrincipalDor, Trail>> = {
  mediuns: {
    title: 'Comece pelos médiuns',
    body: 'Em Médiuns você cadastra a corrente com telefone e data de nascimento. O painel avisa os aniversários da semana e você controla quem está ativo.',
    cta: { label: 'Cadastrar médiuns', href: '/admin/mediuns' },
    features: ['mediuns'],
  },
  financeiro: {
    title: 'Comece pelo financeiro',
    body: 'Em Mensalidades você define o valor e registra o pagamento de cada médium. Contas a pagar, a receber e o fluxo de caixa mostram para onde vai o dinheiro do terreiro.',
    cta: { label: 'Abrir mensalidades', href: '/admin/financeiro/mensalidades' },
    features: ['mensalidade_mediun', 'contas_financeiras'],
  },
  divulgacao: {
    title: 'Comece pelo site do terreiro',
    body: 'Em Meu Site você publica a página do terreiro com endereço, próximas giras e contato, sem precisar de programador. Em Cursos Presenciais você abre inscrições.',
    cta: { label: 'Montar meu site', href: '/admin/meu-site' },
    features: ['site_builder'],
  },
  estoque: {
    title: 'Comece pelo estoque',
    body: 'Em Estoque você cadastra os materiais por grupo (velas, ervas, bebidas) com um mínimo de cada um. O painel avisa quando algo está acabando.',
    cta: { label: 'Cadastrar itens', href: '/admin/estoque/itens' },
    features: ['estoque_controle'],
  },
};

export interface WelcomeTourContext {
  dor: PrincipalDor;
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
    <Box>
      {title && (
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>
          {title}
        </Typography>
      )}
      <Typography variant="body2" component="div" sx={{ lineHeight: 1.55 }}>
        {children}
      </Typography>
    </Box>
  );
}

function CtaButton({ label, href, ctx, variant = 'contained' }: { label: string; href: string; ctx: WelcomeTourContext; variant?: 'contained' | 'outlined' }) {
  return (
    <Button
      component={Link}
      href={href}
      variant={variant}
      size="small"
      sx={{ mt: 1.5 }}
      onClick={() => {
        trackEvent('welcome_tour_cta', { trilha: ctx.dor, href });
        ctx.close();
      }}
    >
      {label}
    </Button>
  );
}

export function buildWelcomeTourSteps(ctx: WelcomeTourContext): StepType[] {
  const option = PRINCIPAL_DOR_OPTIONS.find((o) => o.value === ctx.dor);
  const name = ctx.firstName?.trim();
  const steps: StepType[] = [];

  steps.push({
    ...CENTER_STEP,
    position: 'center',
    content: (
      <StepBody title={name ? `Bem-vindo ao GiraHub, ${name}!` : 'Bem-vindo ao GiraHub!'}>
        {ctx.dor === 'outro'
          ? 'Preparamos um guia rápido com o essencial para você começar.'
          : `Você contou que quer ${option?.phrase ?? 'organizar o terreiro'}. Preparamos um guia rápido para começar por aí.`}
      </StepBody>
    ),
  });

  const trail = MODULE_TRAILS[ctx.dor];
  if (trail) {
    const available = !trail.features || trail.features.some((f) => ctx.can(f));
    steps.push({
      ...CENTER_STEP,
      position: 'center',
      content: (
        <StepBody title={trail.title}>
          {trail.body}
          {available ? (
            trail.cta && (
              <Box>
                <CtaButton label={trail.cta.label} href={trail.cta.href} ctx={ctx} />
              </Box>
            )
          ) : (
            <>
              <Box sx={{ mt: 1 }}>Esse recurso não está no seu plano atual.</Box>
              <Box>
                <CtaButton label="Ver planos" href="/admin/plano" ctx={ctx} variant="outlined" />
              </Box>
            </>
          )}
        </StepBody>
      ),
    });
  }

  // Senhas é o núcleo do produto: toda trilha mostra o caminho da primeira gira.
  const isSenhasTrail = ctx.dor === 'senhas' || ctx.dor === 'outro';
  if (ctx.hasChecklist) {
    steps.push({
      selector: CHECKLIST_SELECTOR,
      content: (
        <StepBody title={isSenhasTrail ? 'Seu roteiro de primeiros passos' : 'E as senhas das giras?'}>
          {isSenhasTrail
            ? 'Crie a gira, mande o link de senhas no grupo de WhatsApp do terreiro e, no dia, use a Porta. Cada passo se completa sozinho.'
            : 'Quando for organizar as senhas das giras, siga estes passos: criar a gira, mandar o link no WhatsApp e usar a Porta no dia.'}
        </StepBody>
      ),
    });
  } else if (isSenhasTrail) {
    steps.push({
      ...CENTER_STEP,
      position: 'center',
      content: (
        <StepBody title="Comece pela primeira gira">
          Crie a gira, mande o link de senhas no grupo de WhatsApp do terreiro e, no dia, use a Porta.
          <Box>
            <CtaButton label="Criar gira" href="/admin/giras?nova=1" ctx={ctx} />
          </Box>
        </StepBody>
      ),
    });
  }

  if (isSenhasTrail) {
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

  steps.push(
    ctx.hasHelpButton
      ? {
          selector: HELP_BUTTON_SELECTOR,
          content: (
            <StepBody title="Dúvida? Toque aqui">
              Cada tela tem o seu próprio guia. Sempre que precisar, é só tocar neste botão.
            </StepBody>
          ),
        }
      : {
          ...CENTER_STEP,
          position: 'center',
          content: (
            <StepBody title="Pronto!">Cada tela tem o seu próprio guia no botão de ajuda do topo.</StepBody>
          ),
        },
  );

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
  userId: string | null | undefined;
  firstName?: string | null;
  can: (feature: keyof PlanFeatures) => boolean;
}

/**
 * Abre o tour de boas-vindas uma única vez por usuário (flag no
 * localStorage). Espera um instante para o checklist do dashboard montar,
 * já que o tour ancora nele quando existe.
 */
export function useWelcomeTour({ enabled, dor, userId, firstName, can }: UseWelcomeTourArgs): void {
  const { setSteps, setIsOpen, setCurrentStep } = useTour();

  useEffect(() => {
    if (!enabled || !dor || !userId) return;
    const key = welcomeTourSeenKey(userId);
    if (readFlag(key)) return;

    const timer = window.setTimeout(() => {
      writeFlag(key);
      const steps = buildWelcomeTourSteps({
        dor,
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
    // `can`/`firstName` mudam de identidade a cada render; o disparo depende
    // só de habilitação, trilha e usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dor, userId]);
}
