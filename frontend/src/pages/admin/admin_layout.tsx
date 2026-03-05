/**
 * T092: Admin Layout - Enhanced with Tenant Branding
 * Main layout wrapper for all admin pages with Material-UI v6 design system
 * Includes: AppBar with tenant awareness, Drawer navigation, responsive design
 */
'use client';

import React, { useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Container,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Event as EventIcon,
  ConfirmationNumber as TicketIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  Assessment as AnalyticsIcon,
  History as HistoryIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTenant } from '@/providers/ThemeProvider';

const DRAWER_WIDTH = 280;

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

export default function AdminLayout({ 
  children, 
  title,
  maxWidth = 'lg',
}: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const router = useRouter();
  const pathname = router.pathname;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { tenantName, logoUrl } = useTenant();

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
    localStorage.removeItem('token');
    handleMenuClose();
    router.push('/login');
  };

  const navigationItems = [
    {
      text: 'Dashboard',
      icon: <DashboardIcon />,
      href: '/admin/dashboard',
    },
    {
      text: 'Giras',
      icon: <EventIcon />,
      href: '/admin/giras',
    },
    {
      text: 'Tickets',
      icon: <TicketIcon />,
      href: '/admin/tickets',
    },
    {
      text: 'Usuários',
      icon: <PeopleIcon />,
      href: '/admin/users',
    },
    {
      text: 'Analytics',
      icon: <AnalyticsIcon />,
      href: '/admin/analytics',
    },
    {
      text: 'Auditoria',
      icon: <HistoryIcon />,
      href: '/admin/audit-trail',
    },
    {
      text: 'Configurações',
      icon: <SettingsIcon />,
      href: '/admin/config',
    },
  ];

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
      }}
    >
      {/* Drawer Header */}
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {logoUrl && (
            <Box
              component="img"
              src={logoUrl}
              alt="Tenant Logo"
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
              }}
            />
          )}
          <Box>
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              Senhas
            </Typography>
            {tenantName && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: 'text.secondary',
                }}
              >
                {tenantName}
              </Typography>
            )}
          </Box>
        </Box>
        {isMobile && (
          <IconButton
            onClick={handleDrawerClose}
            size="small"
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Toolbar>

      {/* Navigation Items */}
      <List
        component="nav"
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1,
        }}
      >
        {navigationItems.map((item) => (
          <Link 
            key={item.href} 
            href={item.href} 
            style={{ textDecoration: 'none' }}
          >
            <ListItem
              disablePadding
              sx={{
                display: 'block',
                mb: 0.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: pathname === item.href ? 'primary.main' : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontWeight: pathname === item.href ? 600 : 500,
                  color: pathname === item.href ? 'primary.main' : 'inherit',
                }}
              />
            </ListItem>
          </Link>
        ))}
      </List>

      {/* Footer Divider */}
      <Box
        sx={{
          borderTop: '1px solid #e0e0e0',
          p: 1.5,
        }}
      >
        <Typography variant="caption" color="textSecondary">
          v0.5 - Admin Dashboard
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />
      
      {/* AppBar */}
      <AppBar
        position="fixed"
        variant="elevation"
        sx={{
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
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
          >
            <AccountIcon />
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

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          mt: { xs: 8, sm: 8 },
          overflow: 'auto',
        }}
      >
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
  );
}
