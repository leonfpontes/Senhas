import React from 'react';
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Marca do GiraHub nas páginas de marketing: ícone de ticket âmbar + "GiraHub" em sans extra-bold.
 * É a mesma marca de sempre — NÃO trocar ícone, cor do ícone nem a fonte do nome (decisão do dono,
 * 2026-10-06). A cor do texto acompanha o fundo (`className`).
 */
export function GiraHubLogo({ size = 'md', className }: { size?: 'md' | 'sm'; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-sans font-extrabold tracking-tight', className)}>
      <Ticket className={cn('text-amber-400', size === 'md' ? 'size-6' : 'size-5')} aria-hidden />
      <span className="text-lg">GiraHub</span>
    </span>
  );
}

export default GiraHubLogo;
