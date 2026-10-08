/**
 * TerreiroEmblem — logo do terreiro na Área do Médium (cabeçalho, faixa café, escolha de área,
 * ícone da tela inicial). Sem logo (ou se a imagem falhar), a inicial do terreiro sobre a cor
 * da marca (`bg-primary text-primary-foreground`, contraste garantido pelo applyBrand).
 */
import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface TerreiroEmblemProps {
  nome?: string | null;
  logoUrl?: string | null;
  className?: string;
}

export function TerreiroEmblem({ nome, logoUrl, className }: TerreiroEmblemProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  const initial = (nome || 'T').trim().charAt(0).toUpperCase();
  return (
    <Avatar className={cn('size-10 shrink-0 bg-card ring-2 ring-primary/40', className)}>
      {logoUrl && !failed && (
        <AvatarImage
          src={logoUrl}
          alt={nome ? `Logo de ${nome}` : 'Logo do terreiro'}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      )}
      <AvatarFallback
        className="bg-primary font-display text-lg font-bold text-primary-foreground"
        aria-hidden
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

export default TerreiroEmblem;
