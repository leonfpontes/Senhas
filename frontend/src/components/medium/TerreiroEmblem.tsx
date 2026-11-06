/**
 * TerreiroEmblem — logo do terreiro na Área do Médium (cabeçalho, faixa de abertura, escolha de área,
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

export function TerreiroEmblem({ nome, logoUrl, className, naFaixa = false }: TerreiroEmblemProps & { naFaixa?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  // Duas iniciais, sem "Terreiro", "Tenda"… ("Terreiro Filhos de Fé" → "FF"), como o CabecalhoDaCasa.
  const partes = (nome || 'T')
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e|terreiro|tenda|casa|centro|templo)$/i.test(p));
  const initial = (partes.length ? partes : [nome || 'T']).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
  return (
    <Avatar className={cn('size-10 shrink-0 bg-card ring-1 ring-border', className)}>
      {logoUrl && !failed && (
        <AvatarImage
          src={logoUrl}
          alt={nome ? `Logo de ${nome}` : 'Logo do terreiro'}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      )}
      <AvatarFallback
        className={cn(
          'text-sm font-bold',
          naFaixa ? 'bg-primary-foreground text-[color:var(--primary)]' : 'bg-primary text-primary-foreground',
        )}
        aria-hidden
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

export default TerreiroEmblem;
