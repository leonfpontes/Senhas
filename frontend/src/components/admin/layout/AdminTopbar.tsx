import React from 'react';
import AppBar     from '@mui/material/AppBar';
import Avatar     from '@mui/material/Avatar';
import Box        from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Divider    from '@mui/material/Divider';
import Link       from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import Menu       from '@mui/material/Menu';
import MenuItem   from '@mui/material/MenuItem';
import Toolbar    from '@mui/material/Toolbar';
import Tooltip    from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MenuIcon          from '@mui/icons-material/Menu';
import AccountIcon       from '@mui/icons-material/AccountCircle';
import LogoutIcon        from '@mui/icons-material/Logout';
import DarkModeIcon      from '@mui/icons-material/DarkModeRounded';
import LightModeIcon     from '@mui/icons-material/LightModeRounded';
import HelpOutlineIcon   from '@mui/icons-material/HelpOutline';
import { useRouter }     from 'next/router';
import { useTour }       from '@reactour/tour';
import { useTenant }     from '@/providers/ThemeProvider';
import { useProfile }    from '@/hooks/useProfile';
import { useAdminTheme } from '@/providers/AdminThemeProvider';
import { getAdminTourSteps } from '@/tours/adminTourSteps';
import { ImpersonationBanner } from './ImpersonationBanner';
import * as Sentry from '@sentry/nextjs';
import { apiClient } from '@/services/api_client';
import { routeLabel } from '@/constants/routes';

const DRAWER_WIDTH = 280;

interface AdminTopbarProps {
  title:           string;
  onMenuClick:     () => void;
  isImpersonating: boolean;
  impersonateUser:   { email?: string; username?: string } | null;
  impersonateTenant: { name?: string } | null;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  title,
  onMenuClick,
  isImpersonating,
  impersonateUser,
  impersonateTenant,
}) => {
  const router = useRouter();
  const { config }         = useTenant();
  const { profile }        = useProfile();
  const { isDark, toggleMode } = useAdminTheme();

  const brandPrimary   = config?.colors?.primary   ?? '#6366F1';
  const brandSecondary = config?.colors?.secondary ?? '#EC4899';
  const brandFont      = config?.colors?.font      ?? '#FFFFFF';

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [avatarFailed, setAvatarFailed] = React.useState(false);

  const avatarText = (profile?.full_name || profile?.username || profile?.email || 'A')
    .charAt(0).toUpperCase();

  // Breadcrumbs a partir da rota atual (sem querystring).
  // Exibidos apenas quando há mais de 1 nível dentro de /admin.
  const segments = router.asPath.split('?')[0].split('/').filter(Boolean);
  const crumbs = segments.map((seg, idx) => ({
    label: routeLabel(seg),
    href: '/' + segments.slice(0, idx + 1).join('/'),
    isLast: idx === segments.length - 1,
  }));
  // Só mostra se há mais de 2 segmentos (ex.: /admin/financeiro/mensalidades),
  // ocultando na raiz /admin/dashboard.
  const showBreadcrumbs = segments.length > 2;

  // Tour button
  const { setSteps, setIsOpen, setCurrentStep } = useTour();
  const tourSteps = getAdminTourSteps(router.pathname);
  const handleOpenTour = () => {
    setSteps?.(tourSteps);
    setCurrentStep(0);
    setIsOpen(true);
  };

  const handleLogout = async () => {
    setAnchorEl(null);
    try { await apiClient.post('/api/v1/auth/logout'); } catch { /* non-critical */ }
    localStorage.removeItem('user');
    Sentry.setUser(null);
    router.push('/login');
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
        color: brandFont,
        width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml:    { md: `${DRAWER_WIDTH}px` },
        borderBottom: 'none',
      }}
    >
      {isImpersonating && (
        <ImpersonationBanner
          userLabel={impersonateUser?.email || impersonateUser?.username || '...'}
          tenantLabel={impersonateTenant?.name || '...'}
        />
      )}

      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          color="inherit"
          aria-label="Abrir menu"
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 1, display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700, color: brandFont, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {showBreadcrumbs && (
            <Breadcrumbs
              aria-label="breadcrumb"
              sx={{
                color: brandFont,
                '& .MuiBreadcrumbs-separator': { color: brandFont, opacity: 0.6 },
                '& .MuiTypography-root, & a': { fontSize: '0.72rem' },
                display: { xs: 'none', sm: 'flex' },
              }}
            >
              {crumbs.map((c) =>
                c.isLast ? (
                  <Typography key={c.href} sx={{ color: brandFont, opacity: 0.9 }}>
                    {c.label}
                  </Typography>
                ) : (
                  <Link
                    key={c.href}
                    component="button"
                    underline="hover"
                    onClick={() => router.push(c.href)}
                    sx={{ color: brandFont, opacity: 0.75, '&:hover': { opacity: 1 } }}
                  >
                    {c.label}
                  </Link>
                ),
              )}
            </Breadcrumbs>
          )}
        </Box>

        {tourSteps.length > 0 && (
          <Tooltip title="Guia desta tela">
            <IconButton
              color="inherit"
              aria-label="Abrir guia da tela"
              onClick={handleOpenTour}
              size="small"
              sx={{ opacity: 0.85, '&:hover': { opacity: 1 } }}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title={isDark ? 'Modo claro' : 'Modo escuro'}>
          <IconButton
            color="inherit"
            aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            onClick={toggleMode}
            size="small"
            sx={{ opacity: 0.85, '&:hover': { opacity: 1 } }}
          >
            {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          aria-label="Menu do usuário"
          aria-controls="admin-user-menu"
          aria-haspopup="true"
          sx={{ ml: 0.5 }}
        >
          <Avatar
            src={profile?.profile_photo_url && !avatarFailed ? profile.profile_photo_url : undefined}
            onError={() => setAvatarFailed(true)}
            sx={{
              width: 34, height: 34,
              fontSize: '0.875rem',
              bgcolor: 'rgba(255,255,255,0.22)',
              color: brandFont,
              border: '1.5px solid rgba(255,255,255,0.45)',
            }}
          >
            {avatarText}
          </Avatar>
        </IconButton>

        <Menu
          id="admin-user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => { setAnchorEl(null); router.push('/admin/profile'); }}>
            <AccountIcon sx={{ mr: 1, fontSize: '1.1rem' }} />
            Perfil
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1, fontSize: '1.1rem' }} />
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};
