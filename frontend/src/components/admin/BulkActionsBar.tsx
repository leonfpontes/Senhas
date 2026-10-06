/**
 * BulkActionsBar — barra fixa inferior para ações em lote em tickets (marcar usado, cancelar).
 * Fase 1: Button + AlertDialog + toast (Sonner); mesma API e mesmas chamadas de API da versão MUI.
 */
'use client';

import React, { useState } from 'react';
import { Check, Loader2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BulkActionResult {
  success: boolean;
  modified?: number;
  failed?: number;
  errors?: string[];
  warnings?: string[];
  isDryRun?: boolean;
}

export interface BulkActionsBarProps {
  selectedCount: number;
  ticketIds: string[];
  onRefresh: () => void;
  onClearSelection: () => void;
  /** Obrigatório: os endpoints de execução são por gira (`/giras/{giraId}/tickets/bulk-*`). */
  giraId: string;
  /** RBAC: `tickets:edit` — sem ele o botão "Marcar Usado" não aparece. */
  canMarkUsed?: boolean;
  /** RBAC: `tickets:delete` — sem ele o botão "Cancelar" não aparece. */
  canCancel?: boolean;
}

type BulkAction = 'mark_used' | 'cancel';

export default function BulkActionsBar({
  selectedCount,
  ticketIds,
  onRefresh,
  onClearSelection,
  giraId,
  canMarkUsed = true,
  canCancel = true,
}: BulkActionsBarProps) {
  const [actionDialog, setActionDialog] = useState<BulkAction | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkActionResult | null>(null);

  const handleAction = async (action: BulkAction) => {
    try {
      setLoading(true);

      // Primeiro valida a operação em lote
      const validateResponse = await apiClient.post('/api/v1/admin/validate-bulk', {
        ticket_ids: ticketIds,
        operation: action,
      });

      if (!validateResponse.data.valid || validateResponse.data.errors.length > 0) {
        setResult({
          success: false,
          errors: validateResponse.data.errors,
          warnings: validateResponse.data.warnings,
        });
        return;
      }

      if (!dryRun) {
        const endpoint =
          action === 'mark_used'
            ? `/api/v1/admin/giras/${giraId}/tickets/bulk-mark-used`
            : `/api/v1/admin/giras/${giraId}/tickets/bulk-cancel`;

        const executeResponse = await apiClient.post(endpoint, {
          ticket_ids: ticketIds,
          dry_run: false,
        });

        setResult({
          success: true,
          modified: executeResponse.data.modified,
          failed: executeResponse.data.failed,
          errors: executeResponse.data.errors,
        });

        if (executeResponse.data.modified > 0) {
          toast.success(
            `${executeResponse.data.modified} ticket(s) ${action === 'mark_used' ? 'marcado(s) como usado(s)' : 'cancelado(s)'}.`,
          );
          setTimeout(() => {
            onRefresh();
            onClearSelection();
            setActionDialog(null);
          }, 1000);
        }
      } else {
        setResult({
          success: true,
          modified: validateResponse.data.count,
          warnings: validateResponse.data.warnings,
          isDryRun: true,
        });
      }
    } catch (error) {
      const message = extractApiErrorMessage(error, 'Erro ao executar operação');
      toast.error(message);
      setResult({ success: false, errors: [message] });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActionDialog(null);
    setResult(null);
    setDryRun(true);
  };

  const dialogTitle = actionDialog === 'mark_used' ? 'Marcar Tickets Como Usados' : 'Cancelar Tickets';

  return (
    <>
      {/* Barra fixa inferior */}
      <div
        role="toolbar"
        aria-label="Ações em lote"
        data-slot="bulk-actions-bar"
        className={cn(
          // celular: acima da barra de abas (56px + safe area)
          'fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 md:bottom-4 md:left-[calc(50%+8rem)] md:w-[calc(100%-16rem-2rem)]',
          'flex-col gap-2 rounded-xl border border-primary/30 bg-card p-3 text-card-foreground shadow-lg',
          'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Check className="size-4" aria-hidden />
          </span>
          <span>{selectedCount} selecionado(s)</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {canMarkUsed && (
            <Button
              type="button"
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => setActionDialog('mark_used')}
            >
              <Check aria-hidden />
              Marcar Usado
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive-strong hover:bg-destructive/5 hover:text-destructive-strong"
              onClick={() => setActionDialog('cancel')}
            >
              <XCircle aria-hidden />
              Cancelar
            </Button>
          )}

          <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
            <X aria-hidden />
            Limpar
          </Button>
        </div>
      </div>

      {/* Diálogo da ação */}
      <AlertDialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open && !loading) handleClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog === 'mark_used'
                ? `Você está prestes a marcar ${selectedCount} ticket(s) como usado(s).`
                : `Você está prestes a cancelar ${selectedCount} ticket(s).`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!result ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bulk-dry-run"
                  checked={dryRun}
                  onCheckedChange={(v) => setDryRun(v === true)}
                />
                <Label htmlFor="bulk-dry-run" className="font-normal">
                  {dryRun
                    ? 'Validar primeiro (dry-run) - Recomendado'
                    : 'Executar imediatamente (dry-run desligado)'}
                </Label>
              </div>

              {dryRun && (
                <Alert variant="info">
                  <AlertDescription>
                    Será feita uma validação sem aplicar as alterações. Revise o resultado antes de executar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {result.success ? (
                <>
                  {result.isDryRun ? (
                    <Alert variant="info">
                      <AlertDescription>
                        Validação bem-sucedida: {result.modified} ticket(s) podem ser processado(s).
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="success">
                      <AlertDescription>
                        Operação concluída: {result.modified} ticket(s) processado(s).
                        {!!result.failed && result.failed > 0 && ` ${result.failed} falha(s).`}
                      </AlertDescription>
                    </Alert>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <Alert variant="warning">
                      <AlertTitle>Avisos</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5">
                          {result.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {(result.errors || []).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {!result ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => actionDialog && handleAction(actionDialog)}
                  disabled={loading}
                >
                  {loading && <Loader2 className="animate-spin" aria-hidden />}
                  {dryRun ? 'Validar' : 'Executar'}
                </Button>
              </>
            ) : result.isDryRun ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setDryRun(false);
                  }}
                >
                  Executar Agora
                </Button>
              </>
            ) : (
              <Button type="button" onClick={handleClose}>
                Fechar
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
