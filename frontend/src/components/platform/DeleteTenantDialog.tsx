/**
 * Exclusão permanente de terreiro (LGPD) — `DELETE /api/v1/platform/tenants/{id}` com
 * `confirm_slug`. Usado na lista de Terreiros e no Tenant 360 (inclusive para terreiro que se
 * desativou pelo painel: o backend aceita excluir terreiro já excluído logicamente).
 */
import React, { useEffect, useState } from 'react';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { TextField } from '@/components/fields';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface DeleteTenantTarget {
  id: string;
  name: string;
  slug: string;
}

interface DeleteTenantDialogProps {
  tenant: DeleteTenantTarget | null;
  onClose: () => void;
  onDeleted: (tenant: DeleteTenantTarget) => void;
}

export function DeleteTenantDialog({ tenant, onClose, onDeleted }: DeleteTenantDialogProps) {
  const [slug, setSlug] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setSlug('');
    setConfirmed(false);
    setError(null);
  }, [tenant]);

  const confirm = async () => {
    if (!tenant || !confirmed || slug !== tenant.slug) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.delete(`/api/v1/platform/tenants/${tenant.id}`, { data: { confirm_slug: slug } });
      onDeleted(tenant);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Erro ao excluir terreiro'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={tenant !== null} onOpenChange={(o) => !o && !deleting && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Excluir terreiro permanentemente</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Esta ação <strong>não pode ser desfeita</strong>. Usuários, giras, senhas, médiuns, estoque e dados de{' '}
                <strong className="text-foreground">{tenant?.name}</strong> serão removidos.
              </p>
              <TextField
                label={`Digite o slug "${tenant?.slug ?? ''}" para confirmar`}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={deleting}
                autoComplete="off"
                error={slug.length > 0 && slug !== tenant?.slug ? 'Slug não corresponde' : undefined}
              />
              <label className="flex items-start gap-2 text-sm text-foreground">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} disabled={deleting} className="mt-0.5" />
                Entendo que todos os dados serão removidos permanentemente.
              </label>
              {error && (
                <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={deleting || !confirmed || slug !== tenant?.slug}
            onClick={(e) => { e.preventDefault(); confirm(); }}
          >
            {deleting ? 'Excluindo…' : 'Excluir permanentemente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
