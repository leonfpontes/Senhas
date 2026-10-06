/**
 * Download de comprovante (blob autenticado) para as telas de mensalidades.
 * O endpoint exige cookie de sessão, por isso não dá para usar um `<a href>` direto.
 */
import { apiClient } from '@/services/api_client';

export async function baixarComprovante(url: string, filename?: string | null): Promise<void> {
  const res = await apiClient.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'comprovante';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

/** Monta o multipart aceito pelos endpoints `POST .../{pessoa_id}/{mes}` de mensalidade. */
export function montarFormPagamento(p: {
  status: string;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  observacao?: string | null;
  comprovante?: File | null;
}): FormData {
  const form = new FormData();
  form.append('status', p.status);
  if (p.valor_pago != null && p.valor_pago > 0) form.append('valor_pago', String(p.valor_pago));
  if (p.data_pagamento) form.append('data_pagamento', p.data_pagamento);
  if (p.observacao) form.append('observacao', p.observacao);
  if (p.comprovante) form.append('comprovante', p.comprovante);
  return form;
}

export const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } } as const;
