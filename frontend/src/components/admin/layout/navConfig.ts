/**
 * navConfig — a navegação do admin "por trabalho a fazer", num só lugar.
 *
 * `useAdminNav()` devolve os grupos (Hoje, Giras e senhas, Corrente, Casa, Conta) já
 * filtrados por plano (`can`) e por grupo de permissão (`canGroup`), para a Sidebar, a
 * busca de ações (⌘K) e a barra inferior do celular mostrarem exatamente os mesmos
 * destinos. Um grupo some quando nada dentro dele está liberado.
 *
 * Regra: todo item checa o plano (`can`) E o grupo da MESMA feature que a tela/endpoint usa
 * (`view(...)`) — operador vê o que o grupo libera, admin faz bypass. Nada de `!isOperator`
 * para tela que tem feature de grupo (Mensalidades e Configuração financeira ficavam escondidas
 * do operador com permissão).
 */
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownUp,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChartLine,
  CreditCard,
  DoorOpen,
  Flower2,
  Globe,
  GraduationCap,
  Headset,
  HeartHandshake,
  LayoutDashboard,
  Package,
  QrCode,
  Receipt,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { useBirthday } from '@/providers/BirthdayProvider';
import { useTenantSupportUnread } from '@/components/support/useTenantSupportUnread';
import type { PermissionFeature } from '@/constants/permissionFeatures';
import { useGiraContext } from '@/components/admin/GiraContext';
import { useOnboardingPending } from '@/components/admin/FirstGiraChecklist';

export type NavAction = 'share-link';

export interface NavLink {
  kind: 'link';
  /** Destino. Itens de ação (`action`) não navegam — o layout trata. */
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Outros prefixos de rota que também marcam o item como ativo. */
  match?: string[];
  /** Palavras extras para a busca de ações. */
  keywords?: string[];
  action?: NavAction;
}

export interface NavSection {
  kind: 'section';
  label: string;
  icon: LucideIcon;
  items: NavLink[];
}

export type NavEntry = NavLink | NavSection;

export interface NavGroupDef {
  key: string;
  label: string;
  items: NavEntry[];
}

const link = (href: string, label: string, icon: LucideIcon, extra: Partial<Omit<NavLink, 'kind' | 'href' | 'label' | 'icon'>> = {}): NavLink => ({
  kind: 'link',
  href,
  label,
  icon,
  ...extra,
});

/** Caminho sem query string. */
export function pathOf(href: string): string {
  return href.split('?')[0];
}

export function isNavLinkActive(item: NavLink, pathname: string): boolean {
  if (item.action) return false;
  const base = pathOf(item.href);
  if (pathname === base) return true;
  return (item.match ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.items.some((i) => isNavLinkActive(i, pathname));
}

/** Achata os grupos em links (para a busca de ações). */
export function flattenNav(groups: NavGroupDef[]): NavLink[] {
  const out: NavLink[] = [];
  for (const g of groups) {
    for (const entry of g.items) {
      if (entry.kind === 'link') out.push(entry);
      else out.push(...entry.items);
    }
  }
  return out;
}

export interface UseAdminNavOptions {
  /** Operador: só vê o que o grupo libera; admin faz bypass. */
  isOperator: boolean;
  tenantId?: string | null;
}

export function useAdminNav({ isOperator, tenantId }: UseAdminNavOptions): NavGroupDef[] {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const { birthdayCount } = useBirthday();
  const unreadSupport = useTenantSupportUnread(!isOperator);
  const { todayGira } = useGiraContext({ load: false });
  const onboardingPending = useOnboardingPending(tenantId);

  return useMemo(() => {
    const view = (feature: PermissionFeature) => !isOperator || canGroup(feature, 'view');

    const hoje: NavEntry[] = [link('/admin/dashboard', 'Início', LayoutDashboard, { keywords: ['dashboard', 'resumo'] })];
    if (view('porta')) hoje.push(link('/admin/porta', 'Porta', DoorOpen, { keywords: ['fila', 'chamar', 'atendimento'] }));
    if (todayGira && view('tickets')) {
      hoje.push(
        link(`/admin/tickets?gira=${encodeURIComponent(todayGira.id)}`, 'Gira de hoje', Rocket, {
          keywords: [todayGira.nome, 'senhas de hoje'],
        }),
      );
    }
    if (onboardingPending && view('giras')) {
      hoje.push(link('/admin/dashboard?passos=1', 'Primeiros passos', BookOpen, { keywords: ['checklist', 'onboarding'] }));
    }

    const girasSenhas: NavEntry[] = [];
    if (view('giras')) girasSenhas.push(link('/admin/giras', 'Giras', CalendarDays, { keywords: ['agenda', 'sessão'] }));
    if (view('tickets')) girasSenhas.push(link('/admin/tickets', 'Senhas', Ticket, { keywords: ['tickets', 'consulentes'] }));
    if (view('giras')) {
      girasSenhas.push(
        link('/admin/giras?compartilhar=1', 'Link e QR do terreiro', QrCode, {
          action: 'share-link',
          keywords: ['compartilhar', 'whatsapp', 'qr code', 'link público'],
        }),
      );
    }
    if (can('relatorio_gira') && view('relatorio_gira')) {
      girasSenhas.push(link('/admin/relatorio-gira', 'Relatório da gira', ChartColumn, { keywords: ['exportar', 'csv'] }));
    }
    if (can('analytics_basico') && view('analytics')) {
      girasSenhas.push(link('/admin/analytics', 'Analytics', ChartLine, { keywords: ['métricas', 'gráficos', 'horário de pico'] }));
    }

    const corrente: NavEntry[] = [];
    if (can('mediuns') && view('mediuns')) {
      corrente.push(link('/admin/mediuns', 'Médiuns', Flower2, { badge: birthdayCount, keywords: ['cambones', 'aniversariantes'] }));
    }
    if (can('associados') && view('associados')) corrente.push(link('/admin/associados', 'Associados', HeartHandshake));
    const planMensalidade = can('mensalidade_mediun') || can('mensalidade_associado');
    if (planMensalidade && view('financeiro')) {
      corrente.push(link('/admin/financeiro/mensalidades', 'Mensalidades', Receipt, { keywords: ['pagamentos', 'contribuição'] }));
    }

    const casa: NavEntry[] = [];
    const financeiro: NavLink[] = [];
    if (can('contas_financeiras') && view('contas_financeiras')) {
      financeiro.push(
        link('/admin/financeiro/lancamentos', 'Lançamentos', ArrowDownUp, {
          match: ['/admin/financeiro/contas-pagar', '/admin/financeiro/contas-receber'],
          keywords: ['contas a pagar', 'contas a receber', 'despesas', 'receitas'],
        }),
        link('/admin/financeiro/fluxo-de-caixa', 'Fluxo de caixa', TrendingUp, { keywords: ['caixa', 'saldo'] }),
      );
    }
    // A tela se protege por aba (categorias/contas: contas_financeiras; mensalidade: financeiro).
    if ((can('contas_financeiras') && view('contas_financeiras')) || (planMensalidade && view('financeiro'))) {
      financeiro.push(link('/admin/financeiro/config', 'Configuração financeira', Wallet, { keywords: ['financeiro'] }));
    }
    if (financeiro.length > 0) casa.push({ kind: 'section', label: 'Financeiro', icon: Wallet, items: financeiro });

    if (can('estoque_controle') && view('estoque')) {
      casa.push({
        kind: 'section',
        label: 'Estoque',
        icon: Package,
        items: [
          link('/admin/estoque/itens', 'Itens', Package, {
            match: ['/admin/estoque/grupos', '/admin/estoque/relatorio'],
            keywords: ['materiais', 'grupos de material', 'relatório de estoque'],
          }),
          link('/admin/estoque/movimentacoes', 'Movimentações', ArrowDownUp, { keywords: ['entrada', 'saída'] }),
        ],
      });
    }
    // Mesmo gate da tela (plano site_builder + grupo site — separado de Cursos desde o T-06).
    if (can('site_builder') && view('site')) {
      casa.push(link('/admin/meu-site', 'Site do terreiro', Globe, { keywords: ['meu site', 'página pública'] }));
    }
    // Mesmo gate da tela (plano site_builder + grupo cursos_presenciais).
    if (can('site_builder') && view('cursos_presenciais')) {
      casa.push(link('/admin/cursos-presenciais', 'Cursos', GraduationCap, { keywords: ['cursos presenciais', 'inscrições'] }));
    }

    const conta: NavEntry[] = [];
    if (!isOperator) {
      conta.push(
        link('/admin/billing', 'Plano e assinatura', CreditCard, { match: ['/admin/plano'], keywords: ['plano', 'assinatura', 'upgrade', 'pagamento'] }),
      );
    }
    if (view('usuarios')) conta.push(link('/admin/users', 'Pessoas e acessos', Users, { keywords: ['usuários', 'operadores', 'equipe'] }));
    if (!isOperator) {
      conta.push(
        link('/admin/permission-groups', 'Perfis de acesso', Shield, { keywords: ['grupos de permissão', 'permissões', 'rbac'] }),
      );
    }
    // A tela de Configurações é gateada pelo grupo `configuracoes` (não só admin).
    if (view('configuracoes')) {
      conta.push(link('/admin/config', 'Configurações', Settings, { keywords: ['terreiro', 'cores', 'logo', 'funcionalidades'] }));
    }
    if (can('auditoria') && view('auditoria')) {
      conta.push(link('/admin/audit-trail', 'Auditoria', ScrollText, { keywords: ['histórico', 'log', 'quem alterou'] }));
    }
    if (!isOperator) {
      conta.push(link('/admin/suporte', 'Ajuda', Headset, { badge: unreadSupport, keywords: ['suporte', 'chat', 'dúvida'] }));
    }

    const groups: NavGroupDef[] = [
      { key: 'hoje', label: 'Hoje', items: hoje },
      { key: 'giras', label: 'Giras e senhas', items: girasSenhas },
      { key: 'corrente', label: 'Corrente', items: corrente },
      { key: 'casa', label: 'Casa', items: casa },
      { key: 'conta', label: 'Conta', items: conta },
    ];
    return groups.filter((g) => g.items.length > 0);
  }, [isOperator, can, canGroup, birthdayCount, unreadSupport, todayGira, onboardingPending]);
}
