/**
 * /medium/avisos — Avisos da Área do Médium. Provisória (AM-06): o AM-09 troca pelo conteúdo de verdade.
 */
import React from 'react';
import { Megaphone } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { EmBreve } from '@/components/medium/EmBreve';

export default function MediumAvisosPage() {
  return (
    <MediumLayout title="Avisos">
      <EmBreve
        titulo="Avisos"
        icon={<Megaphone />}
        descricao="Os avisos da direção da casa vão aparecer aqui, só para a corrente."
      />
    </MediumLayout>
  );
}
