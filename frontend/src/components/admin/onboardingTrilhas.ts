/**
 * Trilhas do checklist de primeiros passos (dashboard) — seguem a resposta do cadastro
 * "O que você mais precisa resolver?". Espelho de `TRILHA_POR_DOR`/`TRILHA_PASSOS` em
 * `backend/src/api/v1/admin/dashboard_summary.py`: o backend diz a trilha, os passos e quais já
 * foram feitos (de dados reais); aqui ficam textos, links e as travas de plano e de permissão.
 * O tour de boas-vindas (`tours/welcomeTour.tsx`) usa a mesma trilha.
 *
 * Passo travado pelo plano (ex.: mensalidade fora do Basic+ depois do mês grátis) ou pela
 * permissão do grupo não segura o checklist: mostra o motivo e conta como "fora da trilha" na
 * conclusão.
 */
import type { PrincipalDor } from '@/constants/onboarding';
import type { PermissionFeature } from '@/constants/permissionFeatures';
import type { PlanFeatures } from '@/hooks/useSubscription';

export type Trilha = 'gira' | 'senhas' | 'mediuns' | 'financeiro' | 'site' | 'estoque';
export type StepKey =
  | 'gira'
  | 'senhas'
  | 'share'
  | 'tickets'
  | 'porta'
  | 'medium'
  | 'mensalidade'
  | 'pagamento'
  | 'lancamento'
  | 'site'
  | 'publicar'
  | 'grupo'
  | 'item'
  | 'movimentacao';

type Action = 'view' | 'insert' | 'edit' | 'delete';

export const TRILHA_POR_DOR: Record<PrincipalDor, Trilha> = {
  senhas: 'senhas',
  mediuns: 'mediuns',
  financeiro: 'financeiro',
  divulgacao: 'site',
  estoque: 'estoque',
  outro: 'gira',
};

export const TRILHA_PASSOS: Record<Trilha, StepKey[]> = {
  gira: ['gira', 'share', 'tickets', 'porta'],
  senhas: ['gira', 'senhas', 'share', 'tickets'],
  mediuns: ['medium', 'mensalidade', 'gira'],
  financeiro: ['mensalidade', 'pagamento', 'lancamento', 'gira'],
  site: ['site', 'publicar', 'gira'],
  estoque: ['grupo', 'item', 'movimentacao', 'gira'],
};

export const TRILHA_TITULOS: Record<Trilha, { title: string; subtitle: string }> = {
  gira: {
    title: 'Primeiros passos: sua primeira gira',
    subtitle: 'Siga estes passos para os consulentes começarem a pegar senha pelo celular.',
  },
  senhas: {
    title: 'Primeiros passos: senhas sem fila',
    subtitle: 'Do jeito que você pediu: a gira no ar, as senhas configuradas e o link na mão dos consulentes.',
  },
  mediuns: {
    title: 'Primeiros passos: a corrente organizada',
    subtitle: 'Cadastre quem faz parte da casa e deixe a mensalidade pronta. A gira vem logo depois.',
  },
  financeiro: {
    title: 'Primeiros passos: o financeiro em dia',
    subtitle: 'Mensalidade configurada, o primeiro pagamento registrado e o caixa da casa começando a andar.',
  },
  site: {
    title: 'Primeiros passos: o terreiro na internet',
    subtitle: 'Monte a página do terreiro, publique e deixe as próximas giras aparecendo no calendário.',
  },
  estoque: {
    title: 'Primeiros passos: o estoque sob controle',
    subtitle: 'Organize velas, ervas e bebidas por grupo e acompanhe o que entra e sai.',
  },
};

export interface StepDef {
  title: string;
  description: string;
  cta?: { label: string; href: string; event?: string };
  /** Recurso do plano exigido (useSubscription().can). */
  plan?: keyof PlanFeatures;
  /** Permissão de grupo exigida para agir no passo. */
  perm?: [PermissionFeature, Action];
}

/** Passos com conteúdo/ações próprios no componente (link de senhas e Porta) ficam só com o texto. */
export const STEP_DEFS: Record<StepKey, StepDef> = {
  gira: {
    title: 'Crie sua primeira gira',
    description: 'Defina a data, o horário e quantas senhas liberar. Leva menos de um minuto.',
    cta: { label: 'Criar gira', href: '/admin/giras?nova=1', event: 'onboarding_cta_create_gira' },
    perm: ['giras', 'insert'],
  },
  senhas: {
    title: 'Configure as senhas da gira',
    description:
      'Quantas senhas liberar e de quando até quando o link fica aberto. Já vem uma sugestão pronta ao criar a gira.',
    cta: { label: 'Ver giras', href: '/admin/giras' },
    perm: ['giras', 'edit'],
  },
  share: {
    title: 'Compartilhe o link de senhas',
    description:
      'É por este link que os consulentes pegam a senha pelo celular. Teste no seu próprio celular e mande no grupo de WhatsApp do terreiro: ele vale para todas as giras, então é só compartilhar uma vez.',
    perm: ['giras', 'view'],
  },
  tickets: {
    title: 'Receba as primeiras senhas',
    description:
      'Assim que alguém pegar uma senha pelo link, este passo se completa sozinho. Dica: abra o link no seu celular e pegue uma senha de teste.',
    perm: ['giras', 'view'],
  },
  porta: {
    title: 'Use a Porta no dia da gira',
    description: 'Na hora da gira, abra a Porta no celular para marcar quem chegou e chamar as senhas na ordem.',
    cta: { label: 'Abrir a Porta', href: '/admin/porta', event: 'onboarding_cta_porta' },
    perm: ['porta', 'view'],
  },
  medium: {
    title: 'Cadastre o primeiro médium',
    description: 'Nome, contato e aniversário. O painel avisa os aniversários da semana.',
    cta: { label: 'Cadastrar médium', href: '/admin/mediuns' },
    plan: 'mediuns',
    perm: ['mediuns', 'insert'],
  },
  mensalidade: {
    title: 'Configure a mensalidade',
    description: 'O valor e o dia de vencimento da mensalidade dos médiuns. Dá para isentar quem precisar.',
    cta: { label: 'Configurar mensalidade', href: '/admin/financeiro/mensalidades' },
    plan: 'mensalidade_mediun',
    perm: ['financeiro', 'edit'],
  },
  pagamento: {
    title: 'Registre o primeiro pagamento',
    description: 'Marque quem já pagou o mês e veja na hora quem está em dia.',
    cta: { label: 'Abrir mensalidades', href: '/admin/financeiro/mensalidades' },
    plan: 'mensalidade_mediun',
    perm: ['financeiro', 'insert'],
  },
  lancamento: {
    title: 'Lance a primeira conta da casa',
    description: 'Uma conta a pagar ou a receber (luz, aluguel, doação). O fluxo de caixa monta sozinho.',
    cta: { label: 'Novo lançamento', href: '/admin/financeiro/lancamentos' },
    plan: 'contas_financeiras',
    perm: ['contas_financeiras', 'insert'],
  },
  site: {
    title: 'Monte o site do terreiro',
    description: 'Escolha o modelo, a foto de capa e o texto de apresentação. Tudo pelo celular.',
    cta: { label: 'Abrir Meu Site', href: '/admin/meu-site' },
    plan: 'site_builder',
    perm: ['cursos_presenciais', 'edit'],
  },
  publicar: {
    title: 'Publique o site',
    description: 'Um toque em "Publicar" e o endereço do terreiro já pode ir para o Instagram e o WhatsApp.',
    cta: { label: 'Publicar', href: '/admin/meu-site' },
    plan: 'site_builder',
    perm: ['cursos_presenciais', 'edit'],
  },
  grupo: {
    title: 'Crie o primeiro grupo do estoque',
    description: 'Ex.: Velas, Ervas, Bebidas. Os grupos organizam a lista de itens.',
    cta: { label: 'Criar grupo', href: '/admin/estoque/grupos' },
    plan: 'estoque_controle',
    perm: ['estoque', 'insert'],
  },
  item: {
    title: 'Cadastre o primeiro item',
    description: 'O item, a unidade e o estoque mínimo: o painel avisa quando estiver acabando.',
    cta: { label: 'Cadastrar item', href: '/admin/estoque/itens' },
    plan: 'estoque_controle',
    perm: ['estoque', 'insert'],
  },
  movimentacao: {
    title: 'Registre uma entrada ou saída',
    description: 'A compra que chegou ou o que foi usado na gira. O saldo se atualiza sozinho.',
    cta: { label: 'Registrar movimentação', href: '/admin/estoque/movimentacoes' },
    plan: 'estoque_controle',
    perm: ['estoque', 'insert'],
  },
};

export interface OnboardingStepStatus {
  key: string;
  done: boolean;
}

/** Forma mínima do `onboarding` do /dashboard-summary usada aqui. */
export interface TrilhaStatusLike {
  has_gira: boolean;
  public_tickets: number;
  door_used: boolean;
  principal_dor?: string | null;
  trilha?: string | null;
  steps?: OnboardingStepStatus[] | null;
}

export interface TrilhaGates {
  /** Recurso do plano liberado (useSubscription().can). */
  canPlan: (feature: keyof PlanFeatures) => boolean;
  /** Permissão de grupo (usePermissions().can). */
  canGroup: (feature: PermissionFeature, action: Action) => boolean;
  /** "Já compartilhei" guardado no navegador. */
  shared?: boolean;
}

export interface ResolvedStep {
  key: StepKey;
  title: string;
  description: string;
  done: boolean;
  /** Por que não dá para agir: plano (mostra o plano mínimo) ou permissão do grupo. */
  locked: 'plan' | 'perm' | null;
  plan?: keyof PlanFeatures;
  cta?: StepDef['cta'];
}

const isTrilha = (v: unknown): v is Trilha => typeof v === 'string' && v in TRILHA_PASSOS;
const isStepKey = (v: unknown): v is StepKey => typeof v === 'string' && v in STEP_DEFS;

/** Trilha do status: a do backend; sem ela (resposta antiga), deduzida da dor; padrão "gira". */
export function trilhaDe(status: Pick<TrilhaStatusLike, 'trilha' | 'principal_dor'>): Trilha {
  if (isTrilha(status.trilha)) return status.trilha;
  const dor = status.principal_dor as PrincipalDor | null | undefined;
  return (dor && TRILHA_POR_DOR[dor]) || 'gira';
}

/** Passos com "feito" (do backend; sem `steps`, calculados dos campos da trilha da gira). */
export function resolveTrilha(status: TrilhaStatusLike, gates: TrilhaGates): ResolvedStep[] {
  const trilha = trilhaDe(status);
  const fromBackend = (status.steps ?? []).filter((s) => isStepKey(s.key));
  const keys: StepKey[] = fromBackend.length ? fromBackend.map((s) => s.key as StepKey) : TRILHA_PASSOS[trilha];
  const doneByKey = new Map(fromBackend.map((s) => [s.key, s.done]));
  const fallbackDone: Partial<Record<StepKey, boolean>> = {
    gira: status.has_gira,
    tickets: status.public_tickets > 0,
    share: status.public_tickets > 0,
    porta: status.door_used,
  };

  return keys.map((key) => {
    const def = STEP_DEFS[key];
    let done = doneByKey.get(key) ?? fallbackDone[key] ?? false;
    if (key === 'share') done = done || Boolean(gates.shared) || status.public_tickets > 0;
    const planLocked = Boolean(def.plan) && !gates.canPlan(def.plan!);
    const permLocked = Boolean(def.perm) && !gates.canGroup(def.perm![0], def.perm![1]);
    return {
      key,
      title: def.title,
      description: def.description,
      done,
      locked: planLocked ? 'plan' : permLocked ? 'perm' : null,
      plan: def.plan,
      cta: def.cta,
    };
  });
}

/**
 * Trilha concluída: todo passo feito, sem contar os travados pelo plano (o terreiro não
 * consegue fazê-los — o checklist não pode ficar preso neles). Travado só por permissão
 * continua contando: outra pessoa do terreiro pode fazer.
 */
export function trilhaConcluida(steps: ResolvedStep[]): boolean {
  const relevant = steps.filter((s) => s.locked !== 'plan');
  return relevant.length > 0 && relevant.every((s) => s.done);
}

/** Primeiro passo pendente que a pessoa consegue fazer (usado pelo tour de boas-vindas). */
export function proximoPasso(steps: ResolvedStep[]): ResolvedStep | null {
  return steps.find((s) => !s.done && !s.locked) ?? null;
}
