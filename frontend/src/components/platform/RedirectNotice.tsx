/**
 * RedirectNotice — tela mínima das rotas da plataforma que viraram redirecionamento
 * (observatory, billing, users_global, profile).
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

export function RedirectNotice({ to }: { to: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Redirecionando para {to}…
      </p>
    </div>
  );
}

export default RedirectNotice;
