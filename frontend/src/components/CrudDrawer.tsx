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
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
   * A Área do Médium passa a paleta `.medium-terra`.
   */
  className?: string;
  /**
   * Gaveta em passos (jornadas v2, Nova gira): no lugar do cabeçalho, a barra de passos e
   * "Passo 1 de 3 · A gira"; os campos ficam no tamanho do desenho e o rodapé põe a ação
   * principal à esquerda, com a secundária (Cancelar ou Voltar) em texto ao lado.
   */
  passos?: { atual: number; total: number; rotulo: string };
  /** Ação secundária do rodapé no modo `passos` (padrão: Cancelar). */
  acaoSecundaria?: { rotulo: string; aoClicar: () => void };
  /** Ícone depois do rótulo do botão principal (modo `passos`). */
  saveIcon?: React.ReactNode;
  /**
   * `v2` (jornadas v2, ex.: Configurar senhas): título em Fraunces sem ícone, campos no tamanho do
   * desenho e os botões do rodapé maiores. O padrão continua o de sempre.
   */
  estilo?: 'padrao' | 'v2';
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
  passos,
  acaoSecundaria,
  saveIcon,
  estilo = 'padrao',
}: CrudDrawerProps) {
  const v2 = estilo === 'v2';
  const [confirmOpen, setConfirmOpen] = useState(false);
  // J2 v2 · 09: no celular, a gaveta em passos sobe de baixo (GavetaInferior), um passo por vez.
  const celular = useMediaQuery('(max-width: 639px)');
  const inferior = Boolean(passos) && celular;

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
          side={inferior ? 'bottom' : 'right'}
          showCloseButton={false}
          // z-index acima do Drawer do MUI (1200) enquanto as duas bibliotecas convivem.
          className={cn(
            'flex w-full max-w-full flex-col gap-0 p-0',
            'min-[640px]:w-[480px] min-[640px]:max-w-[480px]',
            (passos || v2) && 'gaveta-v2',
            inferior && 'max-h-[92dvh] rounded-t-[22px] border-t-0',
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
          {inferior && <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />}
          {passos ? (
            <div className={cn('flex items-start justify-between gap-3 px-6 pb-2', inferior ? 'pt-3' : 'pt-6')}>
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-1.5" aria-hidden>
                  {Array.from({ length: passos.total }, (_, i) => (
                    <span
                      key={i}
                      className={cn('h-1 w-[66px] rounded-full', i <= passos.atual ? 'bg-primary' : 'bg-border')}
                    />
                  ))}
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  Passo {passos.atual + 1} de {passos.total} · {passos.rotulo}
                </p>
                <SheetTitle className="sr-only">{title}</SheetTitle>
                <SheetDescription className="sr-only">{subtitle ?? title}</SheetDescription>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose} aria-label="fechar" disabled={saving}>
                <X />
              </Button>
            </div>
          ) : (
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {icon && !v2 && (
                  <span className="flex shrink-0 items-center text-brand [&_svg]:size-6">
                    {icon}
                  </span>
                )}
                <SheetTitle
                  className={cn(
                    v2
                      ? 'font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.02em]'
                      : 'truncate text-lg font-bold tracking-tight',
                  )}
                >
                  {title}
                </SheetTitle>
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
          )}

          {!passos && !v2 && <div className="h-px w-full bg-border" role="presentation" />}

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
          {passos ? (
            <div className="flex items-center gap-4 px-6 py-5">
              <Button
                type="button"
                className="h-12 px-6 text-base font-semibold"
                onClick={onSave}
                disabled={saving || saveDisabled}
              >
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                {saveLabel}
                {!saving && saveIcon}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 text-base font-semibold"
                onClick={acaoSecundaria?.aoClicar ?? handleClose}
                disabled={saving}
              >
                {acaoSecundaria?.rotulo ?? 'Cancelar'}
              </Button>
            </div>
          ) : (
          <>
          <div className="h-px w-full bg-border" role="presentation" />
          <div className="flex justify-end gap-3 bg-card px-6 py-4">
            <Button type="button" variant="outline" className={cn(v2 && 'h-12 px-5 text-base font-semibold')} onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className={cn(v2 && 'h-12 px-5 text-base font-semibold')} onClick={onSave} disabled={saving || saveDisabled}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {saveLabel}
            </Button>
          </div>
          </>
          )}
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
