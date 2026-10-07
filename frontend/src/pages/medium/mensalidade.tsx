/**
 * /medium/mensalidade — Mensalidade da Área do Médium. Provisória (AM-06): o AM-11 troca pelo conteúdo de verdade.
 */
import React from 'react';
import { Wallet } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { EmBreve } from '@/components/medium/EmBreve';

export default function MediumMensalidadePage() {
  return (
    <MediumLayout title="Mensalidade">
      <EmBreve
        titulo="Mensalidade"
        icon={<Wallet />}
        descricao="Aqui você vai ver sua mensalidade do mês, pagar com PIX e enviar o comprovante."
      />
    </MediumLayout>
  );
}
