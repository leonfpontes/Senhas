/**
 * AdminSidebar
 *
 * Full sidebar with brand header, navigation groups, and plan badge.
 * All brand-color usage (gradients on selected items, header) comes from
 * useTenant() — never from the structural AdminTheme tokens.
 */
import React, { useEffect, useState } from 'react';
import Box        from '@mui/material/Box';
import Chip       from '@mui/material/Chip';
import Divider    from '@mui/material/Divider';
import Drawer     from '@mui/material/Drawer';
import List       from '@mui/material/List';
import Skeleton   from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import DashboardIcon       from '@mui/icons-material/Dashboard';
import EventIcon           from '@mui/icons-material/Event';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import TicketIcon          from '@mui/icons-material/ConfirmationNumber';
import PeopleIcon          from '@mui/icons-material/People';
import SettingsIcon        from '@mui/icons-material/Settings';
import AnalyticsIcon       from '@mui/icons-material/Assessment';
import HistoryIcon         from '@mui/icons-material/History';
import MeetingRoomIcon     from '@mui/icons-material/MeetingRoom';
import FolderOpenIcon      from '@mui/icons-material/FolderOpen';
import Diversity3Icon      from '@mui/icons-material/Diversity3';
import CardMembershipIcon  from '@mui/icons-material/CardMembership';
import CreditCardIcon      from '@mui/icons-material/CreditCard';
import Inventory2Icon      from '@mui/icons-material/Inventory2';
import CategoryIcon        from '@mui/icons-material/Category';
import SwapVertIcon        from '@mui/icons-material/SwapVert';
import BarChartIcon        from '@mui/icons-material/BarChart';
import SummarizeIcon       from '@mui/icons-material/Summarize';
import LockOutlinedIcon    from '@mui/icons-material/LockOutlined';
import LanguageIcon        from '@mui/icons-material/Language';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon        from '@mui/icons-material/Payments';
import { useRouter }        from 'next/router';
import { useSubscription }  from '@/hooks/useSubscription';
import { usePermissions }   from '@/hooks/usePermissions';
import { useBirthday }      from '@/providers/BirthdayProvider';
import { PermissionFeature } from '@/constants/permissionFeatures';
import { BrandHeader }      from './BrandHeader';
import { NavItem }          from './NavItem';
import { NavGroup, NavGroupItem } from './NavGroup';

export const DRAWER_WIDTH = 280;

interface AdminSidebarProps {
  mobileOpen: boolean;
  onClose:    () => void;
  isOperator: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  mobileOpen,
  onClose,
  isOperator,
}) => {
  const router   = useRouter();
  const pathname = router.pathname;

  const { can, planLabel, subscription, loading: subscriptionLoading } = useSubscription();
  const { birthdayCount } = useBirthday();
  const { can: canGroup }  = usePermissions();

  const hasGroupView = (feature: PermissionFeature): boolean =>
    !isOperator || canGroup(feature, 'view');

  // ─── Nav item arrays ───────────────────────────────────────────────────────

  const topItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, href: '/admin/dashboard' },
    ...(hasGroupView('tickets')
      ? [{ text: 'Tickets', icon: <TicketIcon />, href: '/admin/tickets' }] : []),
    ...(can('site_builder') && hasGroupView('cursos_presenciais')
      ? [{ text: 'Meu Site', icon: <LanguageIcon />, href: '/admin/meu-site' }] : []),
  ];

  const cadastrosItems: NavGroupItem[] = [
    ...(hasGroupView('giras')
      ? [{ text: 'Giras', icon: <EventIcon />, href: '/admin/giras' }] : []),
    ...(can('mediuns') && hasGroupView('mediuns')
      ? [{ text: 'Médiuns', icon: <SelfImprovementIcon />, href: '/admin/mediuns', badge: birthdayCount }] : []),
    ...(hasGroupView('usuarios')
      ? [{ text: 'Usuários', icon: <PeopleIcon />, href: '/admin/users' }] : []),
    ...(!isOperator
      ? [{ text: 'Grupos de Permissão', icon: <LockOutlinedIcon />, href: '/admin/permission-groups' }] : []),
    ...(can('associados') && hasGroupView('associados')
      ? [{ text: 'Associados', icon: <Diversity3Icon />, href: '/admin/associados' }] : []),
    ...(hasGroupView('cursos_presenciais')
      ? [{ text: 'Cursos Presenciais', icon: <CardMembershipIcon />, href: '/admin/cursos-presenciais' }] : []),
  ];

  const estoqueItems: NavGroupItem[] =
    can('estoque_controle') && hasGroupView('estoque')
      ? [
          { text: 'Grupos de Material', icon: <CategoryIcon />,  href: '/admin/estoque/grupos' },
          { text: 'Itens',              icon: <Inventory2Icon />, href: '/admin/estoque/itens' },
          { text: 'Movimentações',      icon: <SwapVertIcon />,   href: '/admin/estoque/movimentacoes' },
          { text: 'Relatório',          icon: <BarChartIcon />,   href: '/admin/estoque/relatorio' },
        ]
      : [];

  const financeiroItems: NavGroupItem[] =
    !isOperator && (can('mensalidade_mediun') || can('mensalidade_associado'))
      ? [
          { text: 'Mensalidades', icon: <PaymentsIcon />,            href: '/admin/financeiro/mensalidades' },
          { text: 'Configuração', icon: <AccountBalanceWalletIcon />, href: '/admin/financeiro/config' },
        ]
      : [];

  const relatoriosItems: NavGroupItem[] = [
    ...(can('analytics_basico') && hasGroupView('analytics')
      ? [{ text: 'Analytics', icon: <AnalyticsIcon />, href: '/admin/analytics' }] : []),
    ...(can('relatorio_gira') && hasGroupView('relatorio_gira')
      ? [{ text: 'Relatório de Gira', icon: <SummarizeIcon />, href: '/admin/relatorio-gira' }] : []),
    ...(!isOperator && can('auditoria')
      ? [{ text: 'Auditoria', icon: <HistoryIcon />, href: '/admin/audit-trail' }] : []),
  ];

  const bottomItems = [
    ...(hasGroupView('porta')
      ? [{ text: 'Porta', icon: <MeetingRoomIcon />, href: '/admin/porta' }] : []),
    ...(!isOperator
      ? [
          { text: 'Plano',         icon: <CardMembershipIcon />, href: '/admin/plano' },
          { text: 'Assinatura',    icon: <CreditCardIcon />,     href: '/admin/billing' },
          { text: 'Configurações', icon: <SettingsIcon />,        href: '/admin/config' },
        ]
      : []),
  ];

  // ─── Accordion state ───────────────────────────────────────────────────────
  const isCadastrosActive  = cadastrosItems.some((i) => i.href === pathname);
  const isEstoqueActive    = estoqueItems.some((i) => i.href === pathname);
  const isFinanceiroActive = financeiroItems.some((i) => i.href === pathname);
  const isRelatoriosActive = relatoriosItems.some((i) => i.href === pathname);

  const [cadastrosOpen,  setCadastrosOpen]  = useState(isCadastrosActive);
  const [estoqueOpen,    setEstoqueOpen]    = useState(isEstoqueActive);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);
  const [relatoriosOpen, setRelatoriosOpen] = useState(isRelatoriosActive);

  useEffect(() => { if (isCadastrosActive)  setCadastrosOpen(true);  }, [isCadastrosActive]);
  useEffect(() => { if (isEstoqueActive)    setEstoqueOpen(true);    }, [isEstoqueActive]);
  useEffect(() => { if (isFinanceiroActive) setFinanceiroOpen(true); }, [isFinanceiroActive]);
  useEffect(() => { if (isRelatoriosActive) setRelatoriosOpen(true); }, [isRelatoriosActive]);

  // ─── Plan chip color ───────────────────────────────────────────────────────
  const planChipColor =
    subscription?.plan === 'premium' ? '#f59e0b' :
    subscription?.plan === 'pro'     ? '#8b5cf6' :
    subscription?.plan === 'basic'   ? '#3b82f6' :
    '#94a3b8';

  // ─── Drawer content ────────────────────────────────────────────────────────
  const content = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <BrandHeader showClose={mobileOpen} onClose={onClose} />
      <Divider />

      <List sx={{ flex: 1, py: 1, overflowY: 'auto' }}>
        {topItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            text={item.text}
            icon={item.icon}
            active={pathname === item.href}
          />
        ))}

        {cadastrosItems.length > 0 && (
          <NavGroup
            label="Cadastros"
            icon={<FolderOpenIcon />}
            items={cadastrosItems}
            open={cadastrosOpen}
            onToggle={() => setCadastrosOpen((o) => !o)}
            activeHref={pathname}
          />
        )}

        {estoqueItems.length > 0 && (
          <NavGroup
            label="Estoque"
            icon={<Inventory2Icon />}
            items={estoqueItems}
            open={estoqueOpen}
            onToggle={() => setEstoqueOpen((o) => !o)}
            activeHref={pathname}
          />
        )}

        {financeiroItems.length > 0 && (
          <NavGroup
            label="Financeiro"
            icon={<AccountBalanceWalletIcon />}
            items={financeiroItems}
            open={financeiroOpen}
            onToggle={() => setFinanceiroOpen((o) => !o)}
            activeHref={pathname}
          />
        )}

        {relatoriosItems.length > 0 && (
          <NavGroup
            label="Relatórios"
            icon={<BarChartIcon />}
            items={relatoriosItems}
            open={relatoriosOpen}
            onToggle={() => setRelatoriosOpen((o) => !o)}
            activeHref={pathname}
          />
        )}

        {bottomItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            text={item.text}
            icon={item.icon}
            active={pathname === item.href}
          />
        ))}
      </List>

      <Divider />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {subscriptionLoading ? (
          <Skeleton variant="rounded" width={56} height={24} sx={{ borderRadius: 4 }} />
        ) : (
          <Chip
            label={planLabel}
            size="small"
            onClick={() => router.push('/admin/plano')}
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              letterSpacing: 0.5,
              color: '#fff',
              cursor: 'pointer',
              backgroundColor: planChipColor,
              alignSelf: 'flex-start',
              '&:hover': { opacity: 0.85 },
            }}
          />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          GiraHub v4.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      {/* Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {content}
      </Drawer>

      {/* Desktop */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {content}
      </Drawer>
    </Box>
  );
};
