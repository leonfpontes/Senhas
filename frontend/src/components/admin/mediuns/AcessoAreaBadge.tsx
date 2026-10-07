/**
 * Selo "Acesso à Área" na tela Médiuns (AM-03): Ativo · Convite enviado · Sem acesso.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACESSO_LABEL, type AcessoArea } from './acessoArea';

export function AcessoAreaBadge({ acesso, className }: { acesso?: AcessoArea | null; className?: string }) {
  const status = acesso?.status ?? 'sem_acesso';
  if (status === 'ativo') {
    return <Badge className={cn('border-transparent bg-success text-success-foreground', className)}>{ACESSO_LABEL.ativo}</Badge>;
  }
  if (status === 'convite_enviado') {
    return (
      <Badge variant="outline" className={cn('border-info/40 bg-info/10 text-info-strong', className)}>
        {ACESSO_LABEL.convite_enviado}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('text-muted-foreground', className)}>
      {ACESSO_LABEL.sem_acesso}
    </Badge>
  );
}

export default AcessoAreaBadge;
