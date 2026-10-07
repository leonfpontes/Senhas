/**
 * EmBreve — tela provisória das abas da Área do Médium que chegam nos próximos cards
 * (Agenda: AM-07, Avisos: AM-09, Mensalidade: AM-11). Título em Fraunces + EmptyState do kit.
 */
import React from 'react';
import { EmptyState } from '@/components/EmptyState';

export interface EmBreveProps {
  titulo: string;
  icon: React.ReactNode;
  descricao: string;
}

export function EmBreve({ titulo, icon, descricao }: EmBreveProps) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-4 pt-6 pb-8">
      <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">
        {titulo}
      </h1>
      <EmptyState
        className="flex-1"
        icon={icon}
        title="Em breve"
        description={<span className="text-base">{descricao}</span>}
      />
    </div>
  );
}

export default EmBreve;
