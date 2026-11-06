/**
 * PermissionDenied — gate de grupo de permissão (CLAUDE.md, "Frontend — checklist por tela").
 * Mesmo texto do Alert amarelo padrão: nunca deixar o 403 exposto.
 */
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface PermissionDeniedProps {
  /** Mensagem alternativa (padrão: "Você não tem permissão para visualizar este módulo."). */
  message?: string;
  /** O que fazer (J10 v2 · 05). Padrão: pedir a quem administra para incluir a pessoa num grupo. */
  dica?: string;
  className?: string;
}

export const PERMISSION_DENIED_MESSAGE = 'Você não tem permissão para visualizar este módulo.';

export const PERMISSION_DENIED_DICA = 'Peça a quem administra o terreiro para incluir você num grupo com acesso a este módulo.';

export function PermissionDenied({ message = PERMISSION_DENIED_MESSAGE, dica = PERMISSION_DENIED_DICA, className }: PermissionDeniedProps) {
  return (
    <Alert variant="warning" className={className}>
      <ShieldAlert aria-hidden />
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription>{dica}</AlertDescription>
    </Alert>
  );
}

export default PermissionDenied;
