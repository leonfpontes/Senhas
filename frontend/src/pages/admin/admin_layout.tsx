'use client';

import React, { useEffect, useState } from 'react';
import Box             from '@mui/material/Box';
import Button          from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container       from '@mui/material/Container';
import Toolbar         from '@mui/material/Toolbar';
import Typography      from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Head            from 'next/head';
import { useRouter }   from 'next/router';
import { AdminThemeProvider } from '@/providers/AdminThemeProvider';
import { AdminSidebar, DRAWER_WIDTH } from '@/components/admin/layout/AdminSidebar';
import { AdminTopbar }   from '@/components/admin/layout/AdminTopbar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SubscriptionWarningBanner } from '@/components/admin/SubscriptionWarningBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfile }    from '@/hooks/useProfile';
import { PermissionFeature } from '@/constants/permissionFeatures';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';

interface AdminLayoutProps {
  children:  React.ReactNode;
  title?:    string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  noPadding?: boolean;
}

const getFeatureForPath = (path: string): PermissionFeature | null => {
  if (path.startsWith('/admin/giras'))              return 'giras';
  if (path.startsWith('/admin/tickets'))            return 'tickets';
  if (path.startsWith('/admin/porta'))              return 'porta';
  if (path.startsWith('/admin/mediuns'))            return 'mediuns';
  if (path.startsWith('/admin/associados'))         return 'associados';
  if (path.startsWith('/admin/users'))              return 'usuarios';
  if (path.startsWith('/admin/cursos-presenciais')) return 'cursos_presenciais';
  if (path.startsWith('/admin/meu-site'))           return 'cursos_presenciais';
  if (path.startsWith('/admin/estoque'))            return 'estoque';
  if (path.startsWith('/admin/financeiro'))         return 'financeiro';
  if (path.startsWith('/admin/config'))             return 'configuracoes';
  if (path.startsWith('/admin/plano'))              return 'configuracoes';
  if (path.startsWith('/admin/billing'))            return 'configuracoes';
  if (path.startsWith('/admin/audit-trail'))        return 'auditoria';
  if (path.startsWith('/admin/analytics'))          return 'analytics';
  if (path.startsWith('/admin/relatorio-gira'))     return 'relatorio_gira';
  return null;
};

export default function AdminLayout(props: AdminLayoutProps) {
  return (
    <AdminThemeProvider>
      <AdminLayoutInner {...props} />
    </AdminThemeProvider>
  );
}

function AdminLayoutInner({
  children,
  title,
  maxWidth = 'lg',
  noPadding = false,
}: AdminLayoutProps) {
  const router   = useRouter();
  const pathname = router.pathname;
  const { profile } = useProfile();

  const [mobileOpen,        setMobileOpen]        = useState(false);
  const [isImpersonating,   setIsImpersonating]   = useState(false);
  const [impersonateUser,   setImpersonateUser]   = useState<{ email?: string; username?: string } | null>(null);
  const [impersonateTenant, setImpersonateTenant] = useState<{ name?: string } | null>(null);

  const isOperator = profile?.role === 'operator';

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem('impersonating')) {
      setIsImpersonating(true);
      try {
        setImpersonateUser(JSON.parse(sessionStorage.getItem('user') || '{}'));
        setImpersonateTenant(JSON.parse(sessionStorage.getItem('impersonate_tenant') || '{}'));
      } catch { /* non-critical */ }
    }
  }, []);

  const { can: canGroup, loading: permissionsLoading } = usePermissions();
  const feature = getFeatureForPath(pathname);
  const isAuthorized =
    (!isOperator || !feature || canGroup(feature, 'view')) &&
    !(isOperator && pathname.startsWith('/admin/permission-groups'));

  const pageTitle = title ? `${title} | Senhas Admin` : 'Senhas Admin';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>

      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <AdminTopbar
          title={title || 'Admin Dashboard'}
          onMenuClick={() => setMobileOpen(true)}
          isImpersonating={isImpersonating}
          impersonateUser={impersonateUser}
          impersonateTenant={impersonateTenant}
        />

        <AdminSidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          isOperator={isOperator}
        />

        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          }}
        >
          <Toolbar />
          {isImpersonating && <Box sx={{ height: 36 }} />}
          <SubscriptionWarningBanner />

          {permissionsLoading && isOperator && feature ? (
            <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
              <CircularProgress />
            </Box>
          ) : !isAuthorized ? (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <LockOutlinedIcon sx={{ fontSize: 64, color: 'error.main', opacity: 0.8 }} />
                <Typography variant="h5" fontWeight={700}>Acesso Restrito</Typography>
                <Typography variant="body1" color="text.secondary">
                  Seu usuário (operador) não possui permissão de visualização para esta área.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Entre em contato com o administrador do seu terreiro para solicitar acesso.
                </Typography>
                <Button variant="contained" onClick={() => router.push('/admin/dashboard')} sx={{ mt: 2 }}>
                  Voltar para o Dashboard
                </Button>
              </Box>
            </Container>
          ) : noPadding ? (
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ErrorBoundary>{children}</ErrorBoundary>
            </Box>
          ) : (
            <Container maxWidth={maxWidth} sx={{ py: 3, px: { xs: 2, sm: 3 } }}>
              <ErrorBoundary>{children}</ErrorBoundary>
            </Container>
          )}
        </Box>

        <SupportChatWidget enabled={Boolean(profile?.tenant_id) && !isImpersonating} />
      </Box>
    </>
  );
}
