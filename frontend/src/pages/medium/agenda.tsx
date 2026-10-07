/**
 * /medium/agenda — Agenda da Área do Médium. Provisória (AM-06): o AM-07 troca pelo conteúdo de verdade.
 */
import React from 'react';
import { CalendarDays } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { EmBreve } from '@/components/medium/EmBreve';

export default function MediumAgendaPage() {
  return (
    <MediumLayout title="Agenda">
      <EmBreve
        titulo="Agenda"
        icon={<CalendarDays />}
        descricao="As giras e as atividades da casa vão aparecer aqui, com dia, horário e o que levar."
      />
    </MediumLayout>
  );
}
