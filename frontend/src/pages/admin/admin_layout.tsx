/**
 * T092: Admin Layout - Enhanced with Tenant Branding
 * Main layout wrapper for all admin pages with Material-UI v6 design system
 * Includes: AppBar with tenant awareness, Drawer navigation, responsive design
 */
'use client';

import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Collapse,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Chip,
  Container,
  Divider,
  Skeleton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import EventIcon from '@mui/icons-material/Event';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import TicketIcon from '@mui/icons-material/ConfirmationNumber';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import AnalyticsIcon from '@mui/icons-material/Assessment';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountIcon from '@mui/icons-material/AccountCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import BarChartIcon from '@mui/icons-material/BarChart';
import SummarizeIcon from '@mui/icons-material/Summarize';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useTour } from '@reactour/tour';
import { useTenant } from '@/providers/ThemeProvider';
import { useSubscription, PlanFeatures } from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useProfile';
import { useBirthday } from '@/providers/BirthdayProvider';
import { getAdminTourSteps } from '@/tours/adminTourSteps';
import { endImpersonation } from '../../services/api_client';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionFeature } from '@/constants/permissionFeatures';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const DRAWER_WIDTH = 280;

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  /** Skip Container wrapper — needed for editors that require full-height internal scroll (e.g. Site Builder) */
  noPadding?: boolean;
}

/**
 * Botão de ajuda (?) que dispara o tour guiado da tela atual.
 * Renderizado apenas quando existem steps definidos para a rota.
 */
function TourHelpButton() {
  const router = useRouter();
  const { setSteps, setIsOpen, setCurrentStep } = useTour();
  const steps = getAdminTourSteps(router.pathname);

  if (steps.length === 0) return null;

  const handleOpenTour = () => {
    setSteps?.(steps);
    setCurrentStep(0);
    setIsOpen(true);
  };

  return (
    <Tooltip title="Guia desta tela">
      <IconButton
        color="inherit"
        aria-label="abrir guia da tela"
        onClick={handleOpenTour}
        size="small"
        sx={{ opacity: 0.85, '&:hover': { opacity: 1 } }}
      >
        <HelpOutlineIcon />
      </IconButton>
    </Tooltip>
  );
}

const getFeatureForPath = (path: string): PermissionFeature | null => {
  if (path.startsWith('/admin/giras')) return 'giras';
  if (path.startsWith('/admin/tickets')) return 'tickets';
  if (path.startsWith('/admin/porta')) return 'porta';
  if (path.startsWith('/admin/mediuns')) return 'mediuns';
  if (path.startsWith('/admin/associados')) return 'associados';
  if (path.startsWith('/admin/users')) return 'usuarios';
  if (path.startsWith('/admin/cursos-presenciais')) return 'cursos_presenciais';
  if (path.startsWith('/admin/meu-site')) return 'cursos_presenciais';
  if (path.startsWith('/admin/estoque')) return 'estoque';
  if (path.startsWith('/admin/financeiro')) return 'financeiro';
  if (path.startsWith('/admin/config')) return 'configuracoes';
  if (path.startsWith('/admin/plano')) return 'configuracoes';
  if (path.startsWith('/admin/billing')) return 'configuracoes';
  if (path.startsWith('/admin/audit-trail')) return 'auditoria';
  if (path.startsWith('/admin/analytics')) return 'analytics';
  if (path.startsWith('/admin/relatorio-gira')) return 'relatorio_gira';
  return null;
};

export default function AdminLayout(props: AdminLayoutProps) {
  return <AdminLayoutInner {...props} />;
}

function AdminLayoutInner({ 
  children, 
  title,
  maxWidth = 'lg',
  noPadding = false,
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateUser, setImpersonateUser] = useState<{ email?: string; username?: string } | null>(null);
  const [impersonateTenant, setImpersonateTenant] = useState<{ name?: string } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const router = useRouter();
  const pathname = router.pathname;
  // Profile comes from the persistent ProfileProvider in _app.tsx (no per-navigation fetch).
  const { profile: currentUser } = useProfile();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { tenantName, logoUrl, config } = useTenant();
  const brandPrimary = config?.colors?.primary || theme.palette.primary.main;
  const brandSecondary = config?.colors?.secondary || theme.palette.secondary.main;
  const brandFont = config?.colors?.font || '#FFFFFF';

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('impersonating')) {
      setIsImpersonating(true);
      try {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const tenant = JSON.parse(sessionStorage.getItem('impersonate_tenant') || '{}');
        setImpersonateUser(user);
        setImpersonateTenant(tenant);
      } catch {}
    }
  }, []);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const handleEndImpersonation = () => {
    endImpersonation();
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleDrawerClose = () => {
    setMobileOpen(false);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    handleMenuClose();
    router.push('/login');
  };

  const handleGoToProfile = () => {
    handleMenuClose();
    router.push('/admin/profile');
  };

  const avatarText = (currentUser?.full_name || currentUser?.username || currentUser?.email || 'A')
    .charAt(0)
    .toUpperCase();

  const { can, planLabel, subscription, loading: subscriptionLoading } = useSubscription();
  const { birthdayCount } = useBirthday();
  const { can: canGroup, loading: permissionsLoading } = usePermissions();
  const isOperator = currentUser?.role === 'operator';

  const hasGroupView = (feature: PermissionFeature): boolean => {
    if (!isOperator) return true;
    return canGroup(feature, 'view');
  };

  const feature = getFeatureForPath(pathname);
  const isAuthorized = 
    (!isOperator || !feature || canGroup(feature, 'view')) &&
    !(isOperator && pathname.startsWith('/admin/permission-groups'));

  const cadastrosItems = [
    ...(hasGroupView('giras') ? [{ text: 'Giras', icon: <EventIcon />, href: '/admin/giras' }] : []),
    ...(can('mediuns') && hasGroupView('mediuns') ? [{ text: 'Médiuns', icon: <SelfImprovementIcon />, href: '/admin/mediuns' }] : []),
    ...(hasGroupView('usuarios') ? [{ text: 'Usuários', icon: <PeopleIcon />, href: '/admin/users' }] : []),
    ...(!isOperator ? [{ text: 'Grupos de Permissão', icon: <LockOutlinedIcon />, href: '/admin/permission-groups' }] : []),
    ...(can('associados') && hasGroupView('associados') ? [{ text: 'Associados', icon: <Diversity3Icon />, href: '/admin/associados' }] : []),
    ...(hasGroupView('cursos_presenciais') ? [{ text: 'Cursos Presenciais', icon: <CardMembershipIcon />, href: '/admin/cursos-presenciais' }] : []),
  ];

  const cadastrosHrefs = cadastrosItems.map((i) => i.href);
  const isCadastrosActive = cadastrosHrefs.includes(pathname);
  const [cadastrosOpen, setCadastrosOpen] = useState(isCadastrosActive);

  const estoqueItems = (can('estoque_controle') && hasGroupView('estoque')) ? [
    { text: 'Grupos de Material', icon: <CategoryIcon />, href: '/admin/estoque/grupos' },
    { text: 'Itens', icon: <Inventory2Icon />, href: '/admin/estoque/itens' },
    { text: 'Movimentações', icon: <SwapVertIcon />, href: '/admin/estoque/movimentacoes' },
    { text: 'Relatório', icon: <BarChartIcon />, href: '/admin/estoque/relatorio' },
  ] : [];
  const estoqueHrefs = estoqueItems.map((i) => i.href);
  const isEstoqueActive = estoqueHrefs.includes(pathname);
  const [estoqueOpen, setEstoqueOpen] = useState(isEstoqueActive);

  const relatoriosItems = [
    ...(can('analytics_basico') && hasGroupView('analytics') ? [{ text: 'Analytics', icon: <AnalyticsIcon />, href: '/admin/analytics' }] : []),
    ...(can('relatorio_gira') && hasGroupView('relatorio_gira') ? [{ text: 'Relatório de Gira', icon: <SummarizeIcon />, href: '/admin/relatorio-gira' }] : []),
    ...(!isOperator && can('auditoria') ? [{ text: 'Auditoria', icon: <HistoryIcon />, href: '/admin/audit-trail' }] : []),
  ];
  const relatoriosHrefs = relatoriosItems.map((i) => i.href);
  const isRelatoriosActive = relatoriosHrefs.includes(pathname);
  const [relatoriosOpen, setRelatoriosOpen] = useState(isRelatoriosActive);

  const financeiroItems = (!isOperator && (can('mensalidade_mediun') || can('mensalidade_associado'))) ? [
    { text: 'Mensalidades', icon: <PaymentsIcon />, href: '/admin/financeiro/mensalidades' },
    { text: 'Configuração', icon: <AccountBalanceWalletIcon />, href: '/admin/financeiro/config' },
  ] : [];
  const financeiroHrefs = financeiroItems.map((i) => i.href);
  const isFinanceiroActive = financeiroHrefs.includes(pathname);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);

  // Keep accordion groups open when navigating to a child route or when
  // subscription data finishes loading (can() may initially return false).
  useEffect(() => {
    if (isCadastrosActive) setCadastrosOpen(true);
  }, [isCadastrosActive]);

  useEffect(() => {
    if (isEstoqueActive) setEstoqueOpen(true);
  }, [isEstoqueActive]);

  useEffect(() => {
    if (isRelatoriosActive) setRelatoriosOpen(true);
  }, [isRelatoriosActive]);

  useEffect(() => {
    if (isFinanceiroActive) setFinanceiroOpen(true);
  }, [isFinanceiroActive]);

  const topItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, href: '/admin/dashboard' },
    ...(hasGroupView('tickets') ? [{ text: 'Tickets', icon: <TicketIcon />, href: '/admin/tickets' }] : []),
    ...(can('site_builder') && hasGroupView('cursos_presenciais') ? [{ text: 'Meu Site', icon: <LanguageIcon />, href: '/admin/meu-site' }] : []),
  ];

  const bottomItems = [
    ...(hasGroupView('porta') ? [{ text: 'Porta', icon: <MeetingRoomIcon />, href: '/admin/porta' }] : []),
    ...(!isOperator ? [
      { text: 'Plano', icon: <CardMembershipIcon />, href: '/admin/plano' },
      { text: 'Assinatura', icon: <CreditCardIcon />, href: '/admin/billing' },
      { text: 'Configurações', icon: <SettingsIcon />, href: '/admin/config' },
    ] : []),
  ];

  const TOOLBAR_HEIGHT = 64;

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
      }}
    >
      <Box
        sx={{
          p: 2,
          minHeight: TOOLBAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
          position: 'relative',
        }}
      >
        {isMobile && (
          <IconButton
            onClick={handleDrawerClose}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: brandFont,
              opacity: 0.8,
              '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.15)' },
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {logoUrl && !logoFailed ? (
            <Box
              component="img"
              src={logoUrl}
              alt="Tenant Logo"
              onError={() => setLogoFailed(true)}
              sx={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid rgba(255,255,255,0.5)`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                flexShrink: 0,
              }}
            />
          ) : (
            <Avatar
              sx={{
                width: 52,
                height: 52,
                bgcolor: 'rgba(255,255,255,0.2)',
                color: brandFont,
                fontWeight: 700,
                fontSize: '1.25rem',
                border: '2px solid rgba(255,255,255,0.5)',
              }}
            >
              {(tenantName || 'T').charAt(0).toUpperCase()}
            </Avatar>
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: brandFont,
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {tenantName || 'Meu Terreiro'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: brandFont,
                opacity: 0.75,
                fontWeight: 500,
                letterSpacing: 0.5,
              }}
            >
              Senhas Admin
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Navigation Items */}
      <List sx={{ flex: 1, py: 2 }}>
        {topItems.map((item) => (
          <ListItem key={item.href} disablePadding>
            <Link href={item.href} passHref legacyBehavior>
              <ListItemButton
                selected={pathname === item.href}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  '& .MuiListItemIcon-root': { color: 'text.secondary' },
                  '&.Mui-selected': {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    color: brandFont,
                    '& .MuiListItemIcon-root': { color: brandFont },
                    '& .MuiListItemText-primary': { color: brandFont },
                  },
                  '&.Mui-selected:hover': {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    filter: 'brightness(0.97)',
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
              </ListItemButton>
            </Link>
          </ListItem>
        ))}

        {/* Cadastros group */}
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => setCadastrosOpen(!cadastrosOpen)}
            sx={{
              borderRadius: 2,
              mx: 1,
              '& .MuiListItemIcon-root': { color: 'text.secondary' },
              ...(isCadastrosActive && !cadastrosOpen && {
                background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                color: brandFont,
                '& .MuiListItemIcon-root': { color: brandFont },
                '& .MuiListItemText-primary': { color: brandFont },
              }),
            }}
          >
            <ListItemIcon><FolderOpenIcon /></ListItemIcon>
            <ListItemText primary="Cadastros" primaryTypographyProps={{ variant: 'body2', fontWeight: isCadastrosActive ? 600 : 500 }} />
            {cadastrosOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
        </ListItem>
        <Collapse in={cadastrosOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {cadastrosItems.map((item) => (
              <ListItem key={item.href} disablePadding>
                <Link href={item.href} passHref legacyBehavior>
                  <ListItemButton
                    selected={pathname === item.href}
                    sx={{
                      borderRadius: 2,
                      mx: 1,
                      pl: 4,
                      '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 36 },
                      '&.Mui-selected': {
                        background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                        color: brandFont,
                        '& .MuiListItemIcon-root': { color: brandFont },
                        '& .MuiListItemText-primary': { color: brandFont },
                      },
                      '&.Mui-selected:hover': {
                        background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                        filter: 'brightness(0.97)',
                      },
                    }}
                  >
                    <ListItemIcon>
                      {item.href === '/admin/mediuns' && birthdayCount > 0 ? (
                        <Badge badgeContent={birthdayCount} color="error" max={9}>
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
                  </ListItemButton>
                </Link>
              </ListItem>
            ))}
          </List>
        </Collapse>

        {/* Estoque group — visible only for Pro+ plans */}
        {can('estoque_controle') && hasGroupView('estoque') && (
          <>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => setEstoqueOpen(!estoqueOpen)}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  '& .MuiListItemIcon-root': { color: 'text.secondary' },
                  ...(isEstoqueActive && !estoqueOpen && {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    color: brandFont,
                    '& .MuiListItemIcon-root': { color: brandFont },
                    '& .MuiListItemText-primary': { color: brandFont },
                  }),
                }}
              >
                <ListItemIcon><Inventory2Icon /></ListItemIcon>
                <ListItemText primary="Estoque" primaryTypographyProps={{ variant: 'body2', fontWeight: isEstoqueActive ? 600 : 500 }} />
                {estoqueOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
            </ListItem>
            <Collapse in={estoqueOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {estoqueItems.map((item) => (
                  <ListItem key={item.href} disablePadding>
                    <Link href={item.href} passHref legacyBehavior>
                      <ListItemButton
                        selected={pathname === item.href}
                        sx={{
                          borderRadius: 2,
                          mx: 1,
                          pl: 4,
                          '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 36 },
                          '&.Mui-selected': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            color: brandFont,
                            '& .MuiListItemIcon-root': { color: brandFont },
                            '& .MuiListItemText-primary': { color: brandFont },
                          },
                          '&.Mui-selected:hover': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            filter: 'brightness(0.97)',
                          },
                        }}
                      >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
                      </ListItemButton>
                    </Link>
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}

        {/* Financeiro group — Premium only, not for operators */}
        {!isOperator && (can('mensalidade_mediun') || can('mensalidade_associado')) && (
          <>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => setFinanceiroOpen(!financeiroOpen)}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  '& .MuiListItemIcon-root': { color: 'text.secondary' },
                  ...(isFinanceiroActive && !financeiroOpen && {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    color: brandFont,
                    '& .MuiListItemIcon-root': { color: brandFont },
                    '& .MuiListItemText-primary': { color: brandFont },
                  }),
                }}
              >
                <ListItemIcon><AccountBalanceWalletIcon /></ListItemIcon>
                <ListItemText primary="Financeiro" primaryTypographyProps={{ variant: 'body2', fontWeight: isFinanceiroActive ? 600 : 500 }} />
                {financeiroOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
            </ListItem>
            <Collapse in={financeiroOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {financeiroItems.map((item) => (
                  <ListItem key={item.href} disablePadding>
                    <Link href={item.href} passHref legacyBehavior>
                      <ListItemButton
                        selected={pathname === item.href}
                        sx={{
                          borderRadius: 2,
                          mx: 1,
                          pl: 4,
                          '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 36 },
                          '&.Mui-selected': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            color: brandFont,
                            '& .MuiListItemIcon-root': { color: brandFont },
                            '& .MuiListItemText-primary': { color: brandFont },
                          },
                          '&.Mui-selected:hover': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            filter: 'brightness(0.97)',
                          },
                        }}
                      >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
                      </ListItemButton>
                    </Link>
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}

        {/* Relatórios group — visible when at least one report feature is available */}
        {relatoriosItems.length > 0 && (
          <>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => setRelatoriosOpen(!relatoriosOpen)}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  '& .MuiListItemIcon-root': { color: 'text.secondary' },
                  ...(isRelatoriosActive && !relatoriosOpen && {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    color: brandFont,
                    '& .MuiListItemIcon-root': { color: brandFont },
                    '& .MuiListItemText-primary': { color: brandFont },
                  }),
                }}
              >
                <ListItemIcon><BarChartIcon /></ListItemIcon>
                <ListItemText primary="Relatórios" primaryTypographyProps={{ variant: 'body2', fontWeight: isRelatoriosActive ? 600 : 500 }} />
                {relatoriosOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
            </ListItem>
            <Collapse in={relatoriosOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {relatoriosItems.map((item) => (
                  <ListItem key={item.href} disablePadding>
                    <Link href={item.href} passHref legacyBehavior>
                      <ListItemButton
                        selected={pathname === item.href}
                        sx={{
                          borderRadius: 2,
                          mx: 1,
                          pl: 4,
                          '& .MuiListItemIcon-root': { color: 'text.secondary', minWidth: 36 },
                          '&.Mui-selected': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            color: brandFont,
                            '& .MuiListItemIcon-root': { color: brandFont },
                            '& .MuiListItemText-primary': { color: brandFont },
                          },
                          '&.Mui-selected:hover': {
                            background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                            filter: 'brightness(0.97)',
                          },
                        }}
                      >
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
                      </ListItemButton>
                    </Link>
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}

        {bottomItems.map((item) => (
          <ListItem key={item.href} disablePadding>
            <Link href={item.href} passHref legacyBehavior>
              <ListItemButton
                selected={pathname === item.href}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  '& .MuiListItemIcon-root': { color: 'text.secondary' },
                  '&.Mui-selected': {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    color: brandFont,
                    '& .MuiListItemIcon-root': { color: brandFont },
                    '& .MuiListItemText-primary': { color: brandFont },
                  },
                  '&.Mui-selected:hover': {
                    background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                    filter: 'brightness(0.97)',
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
              </ListItemButton>
            </Link>
          </ListItem>
        ))}
      </List>

      <Divider />

      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.5,
        }}
      >
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
              backgroundColor:
                subscription?.plan === 'premium'
                  ? '#f59e0b'
                  : subscription?.plan === 'pro'
                  ? '#8b5cf6'
                  : subscription?.plan === 'basic'
                  ? '#3b82f6'
                  : '#94a3b8',
              '&:hover': {
                opacity: 0.85,
              },
            }}
          />
        )}
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          GiraHub v3.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
    <Head>
      <title>{title ? `${title} | Senhas Admin` : 'Senhas Admin'}</title>
    </Head>
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />

      {/* AppBar — contains impersonation banner inside */}
      <AppBar
        position="fixed"
        variant="elevation"
        sx={{
          background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
          color: brandFont,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        {isImpersonating && (
          <Box
            sx={{
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              py: 0.5,
              px: 2,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              Visualizando como: {impersonateUser?.email || impersonateUser?.username || '...'} — Terreiro: {impersonateTenant?.name || '...'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={handleEndImpersonation}
              sx={{ borderColor: 'inherit', fontWeight: 600 }}
            >
              Encerrar
            </Button>
          </Box>
        )}
        <Toolbar sx={{ gap: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ 
              mr: 2, 
              display: { md: 'none' },
            }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography 
            variant="h6" 
            noWrap 
            sx={{ 
              flexGrow: 1,
              fontWeight: 700,
            }}
          >
            {title || 'Admin Dashboard'}
          </Typography>

          <TourHelpButton />

          <IconButton
            onClick={handleMenuOpen}
            size="small"
            aria-label="user menu"
            aria-controls="user-menu"
            aria-haspopup="true"
            sx={{ ml: 1 }}
          >
            <Avatar
              src={
                currentUser?.profile_photo_url && !avatarFailed
                  ? currentUser.profile_photo_url
                  : undefined
              }
              onError={() => setAvatarFailed(true)}
              sx={{
                width: 34,
                height: 34,
                fontSize: '0.875rem',
                bgcolor: 'rgba(255,255,255,0.22)',
                color: brandFont,
                border: '1px solid rgba(255,255,255,0.45)',
              }}
            >
              {avatarText}
            </Avatar>
          </IconButton>

          <Menu
            id="user-menu"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={handleGoToProfile}>
              <AccountIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
              Perfil
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ 
          width: { md: DRAWER_WIDTH }, 
          flexShrink: { md: 0 },
        }}
      >
        {/* Mobile Drawer (Temporary) */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop Drawer (Persistent) */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid #e0e0e0',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content — spacer via Toolbar to push below AppBar */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        {/* Spacer: matches AppBar height (toolbar + optional banner) */}
        <Toolbar />
        {isImpersonating && <Box sx={{ height: 36 }} />}
        {permissionsLoading && isOperator && feature ? (
          <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
            <CircularProgress />
          </Box>
        ) : !isAuthorized ? (
          <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <LockOutlinedIcon sx={{ fontSize: 64, color: 'error.main', opacity: 0.8 }} />
              <Typography variant="h5" fontWeight={700}>
                Acesso Restrito
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Seu usuário (operador) não possui permissão de visualização para esta área do sistema.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Caso precise de acesso, entre em contato com o administrador do seu terreiro.
              </Typography>
              <Button
                variant="contained"
                onClick={() => router.push('/admin/dashboard')}
                sx={{ textTransform: 'none', mt: 2 }}
              >
                Voltar para o Dashboard
              </Button>
            </Box>
          </Container>
        ) : noPadding ? (
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </Box>
        ) : (
          <Container
            maxWidth={maxWidth}
            sx={{
              py: 3,
              px: {
                xs: 2,
                sm: 3,
              },
            }}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </Container>
        )}
      </Box>
    </Box>
    </>
  );
}
