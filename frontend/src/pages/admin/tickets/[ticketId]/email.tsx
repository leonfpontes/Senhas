/**
 * Rastreio de e-mail de uma senha.
 * Rota: /admin/tickets/[ticketId]/email — o conteúdo é o `TicketEmailPanel`, o mesmo do Sheet
 * de detalhes da tela de Senhas.
 */
import React from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '../../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useProfile';
import { PermissionDenied, PlanLocked } from '@/components/gates';
import { TicketEmailPanel } from '@/components/admin/TicketEmailPanel';
import { minPlanFor } from '@/constants/plans';

export default function TicketEmailPage() {
  return (
    <AdminLayout title="E-mail da senha" maxWidth="lg">
      <TicketEmailContent />
    </AdminLayout>
  );
}

function TicketEmailContent() {
  const router = useRouter();
  const { ticketId } = router.query as { ticketId?: string };
  const { can, loading: subLoading } = useSubscription();
  const { profile, loading: profileLoading } = useProfile();
  // email-status / resend-email exigem admin no backend (email_resend.py).
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  if (!subLoading && !can('email_transacional')) {
    return <PlanLocked feature="Rastreio de e-mail" minPlan={minPlanFor('email_transacional').label} />;
  }
  if (!profileLoading && !isAdmin) {
    return <PermissionDenied message="Só administradores veem o rastreio e reenviam o e-mail da senha." />;
  }

  // J2 v2 · 07: o título, o rastreio e a prévia moram no painel, em duas colunas.
  return ticketId ? (
    <TicketEmailPanel ticketId={ticketId} layout="pagina" onVoltar={() => router.push('/admin/tickets')} />
  ) : null;
}
