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
  className?: string;
}

export const PERMISSION_DENIED_MESSAGE = 'Você não tem permissão para visualizar este módulo.';

export function PermissionDenied({ message = PERMISSION_DENIED_MESSAGE, className }: PermissionDeniedProps) {
  return (
    <Alert variant="warning" className={className}>
      <ShieldAlert aria-hidden />
      <AlertTitle>Sem permissão</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export default PermissionDenied;
