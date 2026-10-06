/**
 * ReadOnlyNotice — aviso discreto para quem só tem `view` na feature (sem insert/edit/delete).
 * As ações continuam ocultas (regra do CLAUDE.md); este aviso só explica o porquê.
 */
import React from 'react';
import { Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface ReadOnlyNoticeProps {
  message?: string;
  className?: string;
}

export const READ_ONLY_MESSAGE =
  'Você tem acesso somente leitura a este módulo. Peça a um administrador para liberar edição no seu grupo de permissão.';

export function ReadOnlyNotice({ message = READ_ONLY_MESSAGE, className }: ReadOnlyNoticeProps) {
  return (
    <Alert variant="info" className={className}>
      <Eye aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export default ReadOnlyNotice;
