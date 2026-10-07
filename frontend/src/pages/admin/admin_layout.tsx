'use client';

/**
 * AdminLayout — casca do painel: Sidebar (bloco shadcn, recolhível; Sheet no celular), topbar,
 * banner de impersonação, aviso de assinatura, barra inferior no celular, busca de ações (⌘K)
 * e o contexto da "gira de hoje" compartilhado por Dashboard/Giras/Senhas/Porta.
 *
 * `AdminThemeProvider` continua aqui porque as telas ainda não migradas dependem do tema MUI
 * (e é ele quem alterna a classe `dark` em <html>).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Loader2, Lock } from 'lucide-react';
import { AdminThemeProvider } from '@/providers/AdminThemeProvider';
import { AdminSidebar } from '@/components/admin/layout/AdminSidebar';
import { AdminTopbar } from '@/components/admin/layout/AdminTopbar';
import { ImpersonationBanner } from '@/components/admin/layout/ImpersonationBanner';
import { useAdminNav, type NavAction } from '@/components/admin/layout/navConfig';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SubscriptionWarningBanner } from '@/components/admin/SubscriptionWarningBanner';
import { CommandPalette, useCommandPaletteShortcut } from '@/components/admin/CommandPalette';
import { MobileTabBar } from '@/components/admin/MobileTabBar';
import { GiraProvider } from '@/components/admin/GiraContext';
import { ShareLinkDialog, fetchUnifiedLinks, type UnifiedLinks } from '@/components/admin/ShareLinkDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useProfile } from '@/hooks/useProfile';
import { useSubscription } from '@/hooks/useSubscription';
import { PermissionFeature } from '@/constants/permissionFeatures';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  noPadding?: boolean;
}

const MAX_WIDTH_CLASS: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'max-w-[444px]',
  sm: 'max-w-[600px]',
  md: 'max-w-[900px]',
  lg: 'max-w-[1200px]',
  xl: 'max-w-[1536px]',
};

/**
 * Feature de grupo exigida pelo layout para a rota. Tem de ser a MESMA da tela e do backend:
 * Lançamentos/Fluxo usam `contas_financeiras`, Mensalidades usa `financeiro`. A Configuração
 * financeira mistura as duas (cada aba se protege), então o layout não exige feature nela.
 */
export const getFeatureForPath = (path: string): PermissionFeature | null => {
  if (path.startsWith('/admin/giras')) return 'giras';
  if (path.startsWith('/admin/tickets')) return 'tickets';
  if (path.startsWith('/admin/porta')) return 'porta';
  if (path.startsWith('/admin/mediuns')) return 'mediuns';
  if (path.startsWith('/admin/associados')) return 'associados';
  if (path.startsWith('/admin/users')) return 'usuarios';
  if (path.startsWith('/admin/cursos-presenciais')) return 'cursos_presenciais';
  if (path.startsWith('/admin/meu-site')) return 'site';
  if (path.startsWith('/admin/estoque')) return 'estoque';
  if (path.startsWith('/admin/financeiro/mensalidades')) return 'financeiro';
  if (path.startsWith('/admin/financeiro/config')) return null;
  if (path.startsWith('/admin/financeiro')) return 'contas_financeiras';
  if (path.startsWith('/admin/config')) return 'configuracoes';
  if (path.startsWith('/admin/plano')) return 'configuracoes';
  if (path.startsWith('/admin/billing')) return 'configuracoes';
  if (path.startsWith('/admin/audit-trail')) return 'auditoria';
  if (path.startsWith('/admin/analytics')) return 'analytics';
  if (path.startsWith('/admin/relatorio-gira')) return 'relatorio_gira';
  return null;
};

export default function AdminLayout(props: AdminLayoutProps) {
  return (
    <AdminThemeProvider>
      <GiraProvider>
        <SidebarProvider>
          <AdminLayoutInner {...props} />
        </SidebarProvider>
      </GiraProvider>
    </AdminThemeProvider>
  );
}

function AdminLayoutInner({ children, title, maxWidth = 'lg', noPadding = false }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = router.pathname;
  const { profile } = useProfile();
  const { can: canGroup, loading: permissionsLoading } = usePermissions();
  const { canCreateGira: canCreateGiraFn, can: canPlan } = useSubscription();

  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateUser, setImpersonateUser] = useState<{ email?: string; username?: string } | null>(null);
  const [impersonateTenant, setImpersonateTenant] = useState<{ name?: string } | null>(null);

  const [commandOpen, setCommandOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<UnifiedLinks | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const isOperator = profile?.role === 'operator';
  const view = useCallback(
    (feature: PermissionFeature) => !isOperator || canGroup(feature, 'view'),
    [isOperator, canGroup],
  );

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem('impersonating')) {
      setIsImpersonating(true);
      try {
        setImpersonateUser(JSON.parse(sessionStorage.getItem('user') || '{}'));
        setImpersonateTenant(JSON.parse(sessionStorage.getItem('impersonate_tenant') || '{}'));
      } catch {
        /* non-critical */
      }
    }
  }, []);

  const feature = getFeatureForPath(pathname);
  const isAuthorized =
    (!isOperator || !feature || canGroup(feature, 'view')) &&
    !(isOperator && pathname.startsWith('/admin/permission-groups'));

  const pageTitle = title ? `${title} | GiraHub` : 'GiraHub';

  const navGroups = useAdminNav({ isOperator, tenantId: profile?.tenant_id });

  const openShare = useCallback(() => {
    setShareOpen(true);
    if (shareLinks) return;
    setShareLoading(true);
    fetchUnifiedLinks()
      .then((links) => setShareLinks(links))
      .finally(() => setShareLoading(false));
  }, [shareLinks]);

  const handleNavAction = useCallback(
    (action: NavAction) => {
      if (action === 'share-link') openShare();
    },
    [openShare],
  );

  useCommandPaletteShortcut(useCallback(() => setCommandOpen((o) => !o), []));

  const canGiras = view('giras');
  const canPorta = view('porta');
  const canCreateGira = canGroup('giras', 'insert') && canCreateGiraFn();
  const canWalkIn = pathname === '/admin/porta' && canGroup('porta', 'insert');

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>

      <AdminSidebar isOperator={isOperator} onAction={handleNavAction} />

      <SidebarInset className="min-w-0">
        {isImpersonating && (
          <ImpersonationBanner
            userLabel={impersonateUser?.email || impersonateUser?.username || '...'}
            tenantLabel={impersonateTenant?.name || '...'}
          />
        )}
        <AdminTopbar title={title || 'Início'} onOpenCommand={() => setCommandOpen(true)} />
        <SubscriptionWarningBanner />

        {permissionsLoading && isOperator && feature ? (
          <div className="flex min-h-[50vh] flex-1 items-center justify-center" role="status" aria-label="Carregando">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : !isAuthorized ? (
          <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10">
                <Lock className="size-14 text-destructive/80" aria-hidden />
                <h1 className="text-xl font-bold">Acesso restrito</h1>
                <p className="text-muted-foreground">Seu usuário não tem permissão para ver esta área.</p>
                <p className="text-sm text-muted-foreground">
                  Peça a um administrador do terreiro para liberar o acesso.
                </p>
                <Button className="mt-2" onClick={() => router.push('/admin/dashboard')}>
                  Voltar para o início
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : noPadding ? (
          <div className="flex flex-1 flex-col overflow-hidden pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        ) : (
          <div
            className={cn(
              'mx-auto w-full flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-8',
              maxWidth ? MAX_WIDTH_CLASS[maxWidth] : '',
            )}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        )}

        <MobileTabBar
          canGiras={canGiras}
          canPorta={canPorta}
          canCreateGira={canCreateGira}
          canWalkIn={canWalkIn}
          onShareLink={openShare}
        />
      </SidebarInset>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        groups={navGroups}
        canCreateGira={canCreateGira}
        canOpenPorta={canPorta}
        canShareLink={canGiras}
        onAction={handleNavAction}
      />

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        link={shareLinks?.public_link}
        sponsorLink={canPlan('associados') ? shareLinks?.sponsor_public_link : null}
        tenantName={profile?.tenant_name}
        loading={shareLoading}
      />

    </>
  );
}
