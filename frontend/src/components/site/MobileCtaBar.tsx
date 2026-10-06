/**
 * MobileCtaBar — barra inferior fixa "Retirar senha" do site público no celular.
 * `variant="inline"` é a versão da prévia (fica dentro do quadro, não da janela).
 * Cor de marca com texto por contraste.
 */
import React from 'react';
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { buttonVariants } from '@/components/ui/button';
import { senhaUrl } from './lib';

export interface MobileCtaBarProps {
  slug: string;
  brandColor: string;
  variant?: 'fixed' | 'inline';
  inert?: boolean;
  className?: string;
}

export function MobileCtaBar({ slug, brandColor, variant = 'fixed', inert = false, className }: MobileCtaBarProps) {
  return (
    <div
      data-testid="mobile-cta-bar"
      className={cn(
        'z-40 border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        variant === 'fixed' && 'fixed inset-x-0 bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden',
        className,
      )}
    >
      <a
        href={senhaUrl(slug)}
        tabIndex={inert ? -1 : undefined}
        aria-disabled={inert || undefined}
        onClick={inert ? (e) => e.preventDefault() : undefined}
        className={cn(
          buttonVariants({ size: 'touch' }),
          'w-full bg-[var(--brand)] text-[var(--brand-fg)] shadow-md hover:bg-[var(--brand)] hover:opacity-90 focus-visible:ring-[var(--brand)]/50',
        )}
        style={{ '--brand': brandColor, '--brand-fg': pickForeground(brandColor) } as React.CSSProperties}
      >
        <Ticket aria-hidden />
        Retirar senha
      </a>
    </div>
  );
}

export default MobileCtaBar;
