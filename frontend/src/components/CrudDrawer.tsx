/**
 * CrudDrawer — drawer lateral reutilizável para formulários CRUD (fase 1: sobre o Sheet do shadcn).
 *
 * Desenho:
 *  - Cabeçalho: ícone + título + subtítulo
 *  - Corpo: área rolável do formulário (children)
 *  - Rodapé: Cancelar / Salvar fixos
 *  - Guarda de alteração não salva ao fechar (AlertDialog)
 *
 * Largura: 480px no desktop; tela cheia abaixo de 640px. Mesma API de props da versão MUI —
 * as telas que já usam `CrudDrawer` não mudam.
 */
'use client';

import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
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

export interface CrudDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  isDirty?: boolean;
  /** Mensagem de erro exibida dentro do drawer, acima do formulário. */
  error?: string | null;
  /**
   * Classes extras no painel e na confirmação de descarte (os dois vão para o <body> por portal).
   * A Área do Médium passa a paleta `.medium-terra` + a fonte Fraunces.
   */
  className?: string;
}

export default function CrudDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  onSave,
  saveLabel = 'Salvar',
  saving = false,
  saveDisabled = false,
  isDirty = false,
  error,
  className,
}: CrudDrawerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onClose();
    }
  };

  const handleDiscardClose = () => {
    setConfirmOpen(false);
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          // z-index acima do Drawer do MUI (1200) enquanto as duas bibliotecas convivem.
          className={cn(
            'flex w-full max-w-full flex-col gap-0 p-0',
            'min-[640px]:w-[480px] min-[640px]:max-w-[480px]',
            className,
          )}
          onInteractOutside={(e) => {
            // Enquanto salva, não deixa fechar clicando fora.
            if (saving) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (saving) e.preventDefault();
          }}
        >
          {/* Cabeçalho */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {icon && (
                  <span className="flex shrink-0 items-center text-brand [&_svg]:size-6">
                    {icon}
                  </span>
                )}
                <SheetTitle className="truncate text-lg font-bold tracking-tight">{title}</SheetTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleClose}
                aria-label="fechar"
                disabled={saving}
              >
                <X />
              </Button>
            </div>
            {subtitle ? (
              <SheetDescription className="mt-1">{subtitle}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>

          <div className="h-px w-full bg-border" role="presentation" />

          {/* Corpo — área rolável do formulário */}
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {children}
          </div>

          {/* Rodapé — ações fixas */}
          <div className="h-px w-full bg-border" role="presentation" />
          <div className="flex justify-end gap-3 bg-card px-6 py-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={onSave} disabled={saving || saveDisabled}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {saveLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmação de alterações não salvas */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm" className={className}>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas. Se sair agora, as informações preenchidas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscardClose}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
