/**
 * OrientacoesCorrenteField — campo "Orientações para a corrente" no drawer da gira (AM-07).
 *
 * O que levar, roupa, horário de chegada da corrente. Aparece só na Área do Médium (Agenda e
 * Início) — diferente dos "Recados", que vão no e-mail e no bilhete do consulente. Só renderiza
 * quando o terreiro tem a Área (`can('area_medium')`: plano + chave do piloto); sem ela o campo
 * some e a tela não envia o valor (o backend aceita o campo de qualquer forma).
 */
import React from 'react';
import { TextField } from '@/components/fields/TextField';
import { useSubscription } from '@/hooks/useSubscription';

export const ORIENTACOES_MAX = 2000;

/** O terreiro usa a Área do Médium (mostra o campo e envia o valor). */
export function useOrientacoesCorrenteHabilitado(): boolean {
  const { can } = useSubscription();
  return can('area_medium');
}

export interface OrientacoesCorrenteFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function OrientacoesCorrenteField({ value, onChange }: OrientacoesCorrenteFieldProps) {
  const habilitado = useOrientacoesCorrenteHabilitado();
  if (!habilitado) return null;
  return (
    <TextField
      label="Orientações para a corrente"
      multiline
      rows={3}
      maxLength={ORIENTACOES_MAX}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ex.: Roupa branca e guias. A corrente chega às 19h30."
      helperText="Opcional. O que levar, roupa e horário de chegada. Só os médiuns veem, na Área do Médium — nunca vai para o consulente."
      data-testid="gira-orientacoes-corrente"
    />
  );
}

export default OrientacoesCorrenteField;
