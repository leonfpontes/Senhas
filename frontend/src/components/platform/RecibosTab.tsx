/**
 * Aba "Recibos" do Tenant 360 — recibos que a GiraHub emite para o terreiro (ex.: bonificado que
 * paga um valor avulso). API em `/api/v1/platform/recibos` (só super-admin); o PDF sai no
 * navegador (`lib/pdf/reciboPdf.ts`) a partir do registro salvo, então a 2ª via é igual à 1ª.
 * Recibo não se apaga: cancela com motivo e o PDF sai marcado CANCELADO.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Download, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { DateField, MoneyInput, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FORMA_PAGAMENTO_LABELS,
  assinaturaFromBlob,
  formatDocumento,
  gerarReciboPdf,
  type AssinaturaImg,
  type ReciboPdfData,
} from '@/lib/pdf/reciboPdf';
import { ToneBadge } from './PlanBadge';
import { fmtDate, fmtMoney } from './format';

export interface Recibo extends ReciboPdfData {
  id: string;
  numero: number;
  ano: number;
  tenant_id: string | null;
}

interface Emissor {
  nome: string;
  empresa: string;
  cnpj: string | null;
  cidade: string | null;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formVazio() {
  const d = new Date();
  return {
    pagador_nome: '',
    pagador_documento: '',
    valor: 0,
    referente: `uso da plataforma GiraHub —${MESES[d.getMonth()]}/${d.getFullYear()}`,
    forma_pagamento: 'pix',
    data_pagamento: hojeIso() as string | null,
  };
}

/** Assinatura do servidor; null (404 = não configurada, ou erro) → recibo só com a linha. */
async function buscarAssinatura(): Promise<AssinaturaImg | null> {
  try {
    const res = await apiClient.get<Blob>('/api/v1/platform/recibos/assinatura', { responseType: 'blob' });
    return await assinaturaFromBlob(res.data);
  } catch {
    return null;
  }
}

async function baixar(r: Recibo) {
  try {
    await gerarReciboPdf(r, await buscarAssinatura());
  } catch {
    toast.error('Não foi possível gerar o PDF do recibo.');
  }
}

export function RecibosTab({ tenantId, tenantName, disabled }: { tenantId: string; tenantName: string; disabled?: boolean }) {
  const [recibos, setRecibos] = useState<Recibo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emissor, setEmissor] = useState<Emissor | null>(null);

  const [novoOpen, setNovoOpen] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [cancelando, setCancelando] = useState<Recibo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.get<{ items: Recibo[] }>('/api/v1/platform/recibos', { params: { tenant_id: tenantId, limit: 200 } });
      setRecibos(res.data.items ?? []);
    } catch (err) {
      setRecibos([]);
      setError(extractApiErrorMessage(err, 'Erro ao carregar os recibos'));
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirNovo = () => {
    setForm(formVazio());
    setFormError(null);
    setNovoOpen(true);
    if (!emissor) {
      apiClient.get<Emissor>('/api/v1/platform/recibos/emissor').then((r) => setEmissor(r.data)).catch(() => setEmissor(null));
    }
  };

  const docDigitos = form.pagador_documento.replace(/\D/g, '');
  const docInvalido = docDigitos.length > 0 && docDigitos.length !== 11 && docDigitos.length !== 14;
  const formValido = form.pagador_nome.trim().length >= 2 && form.valor > 0 && form.referente.trim().length >= 3 && !docInvalido;
  const formDirty = form.pagador_nome.trim() !== '' || form.valor > 0 || docDigitos !== '';

  const emitir = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiClient.post<Recibo>('/api/v1/platform/recibos', {
        tenant_id: tenantId,
        pagador_nome: form.pagador_nome,
        pagador_documento: docDigitos || null,
        valor: form.valor.toFixed(2),
        referente: form.referente,
        forma_pagamento: form.forma_pagamento,
        data_pagamento: form.data_pagamento,
      });
      setNovoOpen(false);
      toast.success(`Recibo nº ${res.data.numero_formatado} emitido.`);
      await baixar(res.data);
      void carregar();
    } catch (err) {
      setFormError(extractApiErrorMessage(err, 'Erro ao emitir o recibo'));
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    if (!cancelando) return;
    setCancelSaving(true);
    setCancelError(null);
    try {
      await apiClient.post(`/api/v1/platform/recibos/${cancelando.id}/cancelar`, { motivo });
      toast.success(`Recibo nº ${cancelando.numero_formatado} cancelado.`);
      setCancelando(null);
      void carregar();
    } catch (err) {
      setCancelError(extractApiErrorMessage(err, 'Erro ao cancelar o recibo'));
    } finally {
      setCancelSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<Recibo>[]>(
    () => [
      { accessorKey: 'numero_formatado', header: 'Nº', meta: { mobile: true } },
      { accessorKey: 'data_pagamento', header: 'Pago em', cell: ({ row }) => fmtDate(`${row.original.data_pagamento}T12:00:00`) },
      { accessorKey: 'pagador_nome', header: 'Pagador', meta: { mobile: true } },
      { accessorKey: 'referente', header: 'Referente a', cell: ({ row }) => <span className="line-clamp-2">{row.original.referente}</span> },
      { accessorKey: 'valor', header: 'Valor', meta: { mobile: true, align: 'right' }, cell: ({ row }) => fmtMoney(Number(row.original.valor)) },
      {
        id: 'status',
        header: 'Status',
        meta: { mobile: true },
        cell: ({ row }) => (row.original.cancelado_em ? <ToneBadge tone="destructive">Cancelado</ToneBadge> : <ToneBadge tone="success">Emitido</ToneBadge>),
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        meta: { mobile: true, align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => void baixar(row.original)} aria-label={`Baixar PDF do recibo ${row.original.numero_formatado}`}>
              <Download /> PDF
            </Button>
            {!row.original.cancelado_em && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCancelando(row.original); setMotivo(''); setCancelError(null); }}
                aria-label={`Cancelar o recibo ${row.original.numero_formatado}`}
              >
                <Ban /> Cancelar
              </Button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Recibos emitidos pela GiraHub para este terreiro. O PDF sai com número, valor por extenso e a sua assinatura.</p>
        <Button size="sm" onClick={abrirNovo} disabled={disabled}><ReceiptText /> Emitir recibo</Button>
      </div>

      {error && <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert>}

      <DataTable
        columns={columns}
        data={recibos ?? []}
        getRowId={(r) => r.id}
        loading={recibos === null}
        pageSize={20}
        emptyMessage="Nenhum recibo emitido."
        emptyDescription="Use “Emitir recibo” quando o terreiro pagar um valor (ex.: bonificado que contribui)."
        emptyIcon={<ReceiptText />}
      />

      <CrudDrawer
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        title="Emitir recibo"
        subtitle={tenantName}
        icon={<ReceiptText />}
        onSave={emitir}
        saveLabel="Emitir e baixar PDF"
        saving={saving}
        saveDisabled={!formValido}
        isDirty={formDirty}
        error={formError}
      >
        <TextField
          label="Recebido de"
          required
          placeholder="Nome de quem está pagando"
          value={form.pagador_nome}
          onChange={(e) => setForm({ ...form, pagador_nome: e.target.value })}
        />
        <TextField
          label="CPF ou CNPJ de quem paga"
          placeholder="Opcional"
          inputMode="numeric"
          value={form.pagador_documento}
          onChange={(e) => setForm({ ...form, pagador_documento: e.target.value })}
          onBlur={() => setForm((f) => ({ ...f, pagador_documento: formatDocumento(f.pagador_documento) }))}
          error={docInvalido ? 'CPF tem 11 dígitos e CNPJ, 14.' : undefined}
        />
        <MoneyInput label="Valor" required value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
        <TextField
          label="Referente a"
          required
          multiline
          rows={2}
          value={form.referente}
          onChange={(e) => setForm({ ...form, referente: e.target.value })}
          helperText="Aparece no recibo: “…referente a <este texto>, paga via Pix em …”."
        />
        <div className="grid gap-1.5">
          <Label htmlFor="recibo-forma">Forma de pagamento</Label>
          <Select value={form.forma_pagamento} onValueChange={(v) => setForm({ ...form, forma_pagamento: v })}>
            <SelectTrigger id="recibo-forma" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FORMA_PAGAMENTO_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label.charAt(0).toUpperCase() + label.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateField label="Data do pagamento" value={form.data_pagamento} max={hojeIso()} onChange={(v) => setForm({ ...form, data_pagamento: v })} />
        {emissor && (
          <p className="text-xs text-muted-foreground">
            Emitido por {emissor.nome} · {emissor.empresa}
            {emissor.cnpj ? ` · CNPJ ${formatDocumento(emissor.cnpj)}` : ' (sem CNPJ configurado)'}
            {emissor.cidade ? ` · ${emissor.cidade}` : ''}.
          </p>
        )}
      </CrudDrawer>

      <CrudDrawer
        open={cancelando !== null}
        onClose={() => setCancelando(null)}
        title="Cancelar recibo"
        subtitle={cancelando ? `Nº ${cancelando.numero_formatado} · ${fmtMoney(Number(cancelando.valor))}` : undefined}
        icon={<Ban />}
        onSave={cancelar}
        saveLabel="Cancelar recibo"
        saving={cancelSaving}
        saveDisabled={motivo.trim().length < 3}
        isDirty={motivo.trim() !== ''}
        error={cancelError}
      >
        <p className="text-sm text-muted-foreground">O recibo continua na lista e o PDF passa a sair com a marca CANCELADO. O número não é reaproveitado.</p>
        <TextField label="Motivo" required multiline rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </CrudDrawer>
    </>
  );
}
