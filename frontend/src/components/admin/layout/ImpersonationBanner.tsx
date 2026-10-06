/**
 * ImpersonationBanner — faixa de aviso quando o superadmin opera como um usuário do terreiro.
 * "Encerrar" pede uma confirmação leve antes de limpar a sessão de impersonação.
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
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-1.5 text-sm font-semibold text-warning-foreground"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span>
        Operando como <strong>{userLabel}</strong> em <strong>{tenantLabel}</strong>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 border-warning-foreground/40 bg-transparent text-warning-foreground hover:bg-warning-foreground/10 hover:text-warning-foreground"
        onClick={() => setConfirmOpen(true)}
      >
        Encerrar
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm" className="z-[1400]">
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar a sessão como {userLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Você volta para a sua própria conta. Nada do que foi feito aqui é desfeito.
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
