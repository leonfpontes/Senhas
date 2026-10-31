/**
 * ImpersonationBanner — faixa de aviso quando o superadmin opera como um usuário do terreiro.
 * Faixa de uma linha só (no celular o texto corta com "…"). "Encerrar" pede uma confirmação leve antes de limpar a sessão de impersonação.
 */
import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { endImpersonation } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ImpersonationBannerProps {
  userLabel: string;
  tenantLabel: string;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({ userLabel, tenantLabel }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      title={`Operando como ${userLabel} em ${tenantLabel}`}
      className="flex min-w-0 items-center justify-center gap-2 bg-warning px-3 py-1 text-xs font-medium text-warning-foreground sm:gap-3 sm:px-4 sm:text-sm"
    >
      <ShieldAlert className="size-3.5 shrink-0 sm:size-4" aria-hidden />
      {/* Uma linha só: no celular o texto corta com "…" (o texto inteiro fica no title). */}
      <span className="min-w-0 truncate">
        <span className="hidden sm:inline">Operando como </span>
        <strong className="font-semibold">{userLabel}</strong>
        <span className="hidden sm:inline"> em </span>
        <span className="sm:hidden"> · </span>
        <strong className="font-semibold">{tenantLabel}</strong>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 shrink-0 border-warning-foreground/40 bg-transparent px-2 text-xs text-warning-foreground hover:bg-warning-foreground/10 hover:text-warning-foreground sm:h-7 sm:px-3 sm:text-sm"
        onClick={() => setConfirmOpen(true)}
      >
        Encerrar
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar esta sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está operando como{' '}
              <strong className="break-all font-semibold text-foreground">{userLabel}</strong>. Ao
              encerrar, volta para a sua própria conta. Nada do que foi feito aqui é desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar</AlertDialogCancel>
            <AlertDialogAction onClick={() => endImpersonation()}>Encerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ImpersonationBanner;
