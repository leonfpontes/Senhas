/**
 * T078: BulkActionsBar - Reusable component for bulk actions (mark used, cancel, etc.)
 */
'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { apiClient, extractApiErrorMessage } from '../../services/api_client';

interface BulkActionResult {
  success: boolean;
  modified?: number;
  failed?: number;
  errors?: string[];
  warnings?: string[];
  isDryRun?: boolean;
}

interface BulkActionsBarProps {
  selectedCount: number;
  ticketIds: string[];
  onRefresh: () => void;
  onClearSelection: () => void;
  giraId?: string;
}

export default function BulkActionsBar({
  selectedCount,
  ticketIds,
  onRefresh,
  onClearSelection,
  giraId,
}: BulkActionsBarProps) {
  const [actionDialog, setActionDialog] = useState<'mark_used' | 'cancel' | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkActionResult | null>(null);

  const handleAction = async (action: 'mark_used' | 'cancel') => {
    try {
      setLoading(true);

      // First, validate the bulk operation
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

      // If validation passed and not dry-run, execute the action
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

        // Refresh data after successful operation
        if (executeResponse.data.modified > 0) {
          setTimeout(() => {
            onRefresh();
            onClearSelection();
            setActionDialog(null);
          }, 1000);
        }
      } else {
        // For dry-run, show validation results
        setResult({
          success: true,
          modified: validateResponse.data.count,
          warnings: validateResponse.data.warnings,
          isDryRun: true,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        errors: [extractApiErrorMessage(error, 'Erro ao executar operação')],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActionDialog(null);
    setResult(null);
    setDryRun(true);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1,
          p: 2,
          backgroundColor: '#e3f2fd',
          borderRadius: 1,
          mb: 2,
          border: '1px solid #90caf9',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Checkbox checked={true} disabled />
          <Typography>{selectedCount} selecionado(s)</Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="success"
            size="small"
            startIcon={<CheckIcon />}
            onClick={() => setActionDialog('mark_used')}
          >
            Marcar Usado
          </Button>

          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<CloseIcon />}
            onClick={() => setActionDialog('cancel')}
          >
            Cancelar
          </Button>

          <Button
            variant="text"
            size="small"
            startIcon={<ClearIcon />}
            onClick={onClearSelection}
          >
            Limpar
          </Button>
        </Box>
      </Box>

      {/* Action Dialog */}
      <Dialog open={Boolean(actionDialog)} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog === 'mark_used'
            ? 'Marcar Tickets Como Usados'
            : 'Cancelar Tickets'}
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {!result ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography>
                {actionDialog === 'mark_used'
                  ? `Você está prestes a marcar ${selectedCount} ticket(s) como usado(s).`
                  : `Você está prestes a cancelar ${selectedCount} ticket(s).`}
              </Typography>

              <FormControlLabel
                control={<Checkbox checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />}
                label={
                  dryRun
                    ? '✓ Validar primeiro (dry-run) - Recomendado'
                    : 'Executar imediatamente (sem validação)'
                }
              />

              {dryRun && (
                <Alert severity="info">
                  Será feita uma validação sem aplicar as alterações. Revise o resultado antes de executar.
                </Alert>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {result.success ? (
                <>
                  {result.isDryRun ? (
                    <Alert severity="info">
                      Validação bem-sucedida: {result.modified} ticket(s) podem ser processado(s).
                    </Alert>
                  ) : (
                    <Alert severity="success">
                      Operação concluída: {result.modified} ticket(s) processado(s).
                      {!!result.failed && result.failed > 0 && ` ${result.failed} falha(s).`}
                    </Alert>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <Alert severity="warning">
                      <strong>Avisos:</strong>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                        {result.warnings.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                </>
              ) : (
                <Alert severity="error">
                  <strong>Erro:</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    {(result.errors || []).map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          {!result ? (
            <>
              <Button onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={() => handleAction(actionDialog!)}
                variant="contained"
                disabled={loading}
              >
                {loading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                {dryRun ? 'Validar' : 'Executar'}
              </Button>
            </>
          ) : (
            <>
              {result.isDryRun ? (
                <>
                  <Button onClick={handleClose}>Cancelar</Button>
                  <Button
                    onClick={() => {
                      setResult(null);
                      setDryRun(false);
                    }}
                    variant="contained"
                  >
                    Executar Agora
                  </Button>
                </>
              ) : (
                <Button onClick={handleClose} variant="contained">
                  Fechar
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
