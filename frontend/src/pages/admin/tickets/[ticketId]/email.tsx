/**
 * Rastreio de e-mail de uma senha.
 * Rota: /admin/tickets/[ticketId]/email — o conteúdo é o `TicketEmailPanel`, o mesmo do Sheet
 * de detalhes da tela de Senhas.
 */
import React from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';
import AdminLayout from '../../admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/admin/PageHeader';
import { PlanLocked } from '@/components/gates';
import { TicketEmailPanel } from '@/components/admin/TicketEmailPanel';
import { minPlanFor } from '@/constants/plans';

export default function TicketEmailPage() {
  return (
    <AdminLayout title="E-mail da senha" maxWidth="md">
      <TicketEmailContent />
    </AdminLayout>
  );
}

function TicketEmailContent() {
  const router = useRouter();
  const { ticketId } = router.query as { ticketId?: string };
  const { can, loading: subLoading } = useSubscription();

  if (!subLoading && !can('email_transacional')) {
    return <PlanLocked feature="Rastreio de e-mail" minPlan={minPlanFor('email_transacional').label} />;
  }

  return (
    <>
      <PageHeader
        title="E-mail da senha"
        subtitle="Status de entrega, reenvio e prévia do e-mail enviado ao consulente."
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/tickets')}>
            <ArrowLeft aria-hidden /> Voltar para Senhas
          </Button>
        }
      />
      {ticketId && <TicketEmailPanel ticketId={ticketId} />}
    </>
  );
}
