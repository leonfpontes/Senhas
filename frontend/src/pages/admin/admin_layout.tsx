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
  Container,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import EventIcon from '@mui/icons-material/Event';
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
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useTenant } from '@/providers/ThemeProvider';
import { apiClient } from '@/services/api_client';
import { SubscriptionProvider, useSubscription, PlanFeatures } from '@/hooks/useSubscription';

const DRAWER_WIDTH = 280;

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

interface CurrentUserProfile {
  id: string;
  email: string;
  username: string;
  full_name?: string | null;
  profile_photo_url?: string | null;
}

export default function AdminLayout(props: AdminLayoutProps) {
  return (
    <SubscriptionProvider>
      <AdminLayoutInner {...props} />
    </SubscriptionProvider>
  );
}

function AdminLayoutInner({ 
  children, 
  title,
  maxWidth = 'lg',
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateUser, setImpersonateUser] = useState<{ email?: string; username?: string } | null>(null);
  const [impersonateTenant, setImpersonateTenant] = useState<{ name?: string } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const router = useRouter();
  const pathname = router.pathname;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored);
          setCurrentUser(parsed);
        }

        const response = await apiClient.get('/api/v1/auth/profile');
        const profile = response.data;
        setCurrentUser(profile);
        setAvatarFailed(false);

        // Guard: never write to localStorage during an impersonation session.
        // The api_client prioritises sessionStorage tokens, so the profile
        // response belongs to the tenant user — not the superadmin. Writing it
        // back to localStorage would corrupt the superadmin's session, causing
        // /platform routes to become inaccessible after the impersonation tab
        // is closed (sessionStorage is destroyed with the tab).
        const isImpersonatingSession =
          typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('impersonating');

        if (!isImpersonatingSession) {
          localStorage.setItem(
            'user',
            JSON.stringify({
              ...(stored ? JSON.parse(stored) : {}),
              ...profile,
            }),
          );
        }
      } catch {
        // Keep fallback from localStorage when profile endpoint fails.
      }
    };

    loadCurrentUser();
  }, []);

  const handleEndImpersonation = () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('impersonating');
    sessionStorage.removeItem('impersonate_tenant');
    window.close();
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

  const { can } = useSubscription();

  const cadastrosItems = [
    { text: 'Giras', icon: <EventIcon />, href: '/admin/giras' },
    { text: 'Usuários', icon: <PeopleIcon />, href: '/admin/users' },
    ...(can('associados') ? [{ text: 'Associados', icon: <Diversity3Icon />, href: '/admin/associados' }] : []),
  ];

  const cadastrosHrefs = cadastrosItems.map((i) => i.href);
  const isCadastrosActive = cadastrosHrefs.includes(pathname);
  const [cadastrosOpen, setCadastrosOpen] = useState(isCadastrosActive);

  const topItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, href: '/admin/dashboard' },
    { text: 'Tickets', icon: <TicketIcon />, href: '/admin/tickets' },
  ];

  const bottomItems = [
    { text: 'Porta', icon: <MeetingRoomIcon />, href: '/admin/porta' },
    ...(can('analytics_basico') ? [{ text: 'Analytics', icon: <AnalyticsIcon />, href: '/admin/analytics' }] : []),
    ...(can('auditoria') ? [{ text: 'Auditoria', icon: <HistoryIcon />, href: '/admin/audit-trail' }] : []),
    { text: 'Plano', icon: <CardMembershipIcon />, href: '/admin/plano' },
    { text: 'Configurações', icon: <SettingsIcon />, href: '/admin/config' },
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
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: pathname === item.href ? 600 : 500 }} />
                  </ListItemButton>
                </Link>
              </ListItem>
            ))}
          </List>
        </Collapse>

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
        }}
      >
        <Typography variant="caption" display="block" color="text.secondary">
          Senhas v1.1
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          Admin Edition
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
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
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
              display: { sm: 'none' },
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
          width: { sm: DRAWER_WIDTH }, 
          flexShrink: { sm: 0 },
        }}
      >
        {/* Mobile Drawer (Temporary) */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
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
            display: { xs: 'none', sm: 'block' },
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
          {children}
        </Container>
      </Box>
    </Box>
    </>
  );
}
