/**
 * HistoryPanel — versões salvas do site com "Restaurar" (confirmação antes, Gap #15).
 */
import React, { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import type { SiteVersion } from '../types';

export interface HistoryPanelProps {
  versions: SiteVersion[];
  loading: boolean;
  canEdit: boolean;
  hasChanges: boolean;
  onRestore: (version: SiteVersion) => Promise<void>;
}

export function HistoryPanel({ versions, loading, canEdit, hasChanges, onRestore }: HistoryPanelProps) {
  const [target, setTarget] = useState<SiteVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const confirm = async () => {
    if (!target) return;
    setRestoring(true);
    try {
      await onRestore(target);
      setTarget(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <EmptyState compact icon={<History />} title="Nenhuma versão salva" description="Cada salvamento guarda uma versão aqui." />
      ) : (
        <ol className="m-0 list-none p-0" aria-label="Versões salvas">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{v.label || new Date(v.created_at).toLocaleString('pt-BR')}</p>
                {v.label && <p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString('pt-BR')}</p>}
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setTarget(v)} aria-label={`Restaurar versão de ${new Date(v.created_at).toLocaleString('pt-BR')}`}>
                  <RotateCcw aria-hidden /> Restaurar
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={target !== null}
        title="Restaurar versão"
        message={
          <>
            {hasChanges && <p className="mb-2 font-medium text-warning">Você tem alterações não salvas — elas serão descartadas.</p>}
            Restaurar a versão de <strong>{target ? new Date(target.created_at).toLocaleString('pt-BR') : ''}</strong>? As seções atuais serão substituídas.
          </>
        }
        confirmText="Restaurar"
        loading={restoring}
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}

export default HistoryPanel;
