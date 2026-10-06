/**
 * ConfirmDialog — confirmação simples (excluir, cancelar, etc.) sobre o AlertDialog do shadcn.
 * Mesma API da versão MUI; `destructive` usa `buttonVariants({ variant: 'destructive' })`.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
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

export interface ConfirmDialogProps {
  open:        boolean;
  title:       string;
  message:     React.ReactNode;
  confirmText?: string;
  cancelText?:  string;
  destructive?: boolean;
  loading?:     boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText  = 'Cancelar',
  destructive = false,
  loading     = false,
  onConfirm,
  onCancel,
}) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next && !loading) onCancel();
    }}
  >
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle className="font-bold">{title}</AlertDialogTitle>
        {typeof message === 'string' ? (
          <AlertDialogDescription>{message}</AlertDialogDescription>
        ) : (
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{message}</div>
          </AlertDialogDescription>
        )}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel
          disabled={loading}
          onClick={(e) => {
            e.preventDefault();
            onCancel();
          }}
        >
          {cancelText}
        </AlertDialogCancel>
        <AlertDialogAction
          disabled={loading}
          variant={destructive ? 'destructive' : 'default'}
          className={cn('min-w-[90px]', buttonVariants({ variant: destructive ? 'destructive' : 'default' }))}
          onClick={(e) => {
            // O chamador fecha o diálogo (controla `open`) depois da operação terminar.
            e.preventDefault();
            onConfirm();
          }}
        >
          {loading ? 'Aguarde...' : confirmText}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
