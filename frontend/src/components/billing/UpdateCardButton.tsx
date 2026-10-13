'use client';

import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

export interface UpdateCardButtonProps {
  /** Rótulo do botão (padrão "Atualizar cartão"). */
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline';
  className?: string;
}

/**
 * "Atualizar cartão" — abre o Portal do Cliente da Stripe (`POST /api/v1/admin/billing/portal`),
 * onde o terreiro troca o cartão e paga a fatura em aberto. Usado no aviso "Pagamento pendente"
 * (tolerância do cartão, migração 094) do topo do painel e em /admin/billing. Só para admin —
 * a rota é de admin e quem renderiza já filtra o papel.
 */
export function UpdateCardButton({ label = 'Atualizar cartão', size = 'sm', variant = 'default', className }: UpdateCardButtonProps) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    try {
      const res = await apiClient.post<{ portal_url: string }>('/api/v1/admin/billing/portal');
      window.location.href = res.data.portal_url;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Não foi possível abrir a troca de cartão. Tente de novo em instantes.'));
      setLoading(false);
    }
  };

  return (
    <Button type="button" size={size} variant={variant} className={className} disabled={loading} onClick={open}>
      <CreditCard aria-hidden /> {loading ? 'Abrindo…' : label}
    </Button>
  );
}

export default UpdateCardButton;
