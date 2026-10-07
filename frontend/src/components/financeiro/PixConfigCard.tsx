/**
 * PixConfigCard — chave PIX da mensalidade, em Financeiro → Configuração → Mensalidade (AM-10).
 *
 * - Quem só tem `financeiro:view` vê a chave mascarada (o servidor nem manda a inteira) e
 *   nenhum formulário/QR.
 * - Com `financeiro:edit`: tipo + chave (máscara e validação por tipo), nome e cidade de
 *   quem recebe (limites do BR Code), instruções e prévia do QR da chave SALVA, gerado no
 *   servidor (`brcode_previa`) — o mesmo "PIX copia e cola" que o médium vai usar.
 * - Salvar pede a senha (ConfirmDialog). O PUT vai com `skipAutoLogout`: senha errada é 401
 *   de regra de negócio e não pode derrubar a sessão. Todos os administradores recebem
 *   e-mail quando a chave muda (decisão D-05).
 */
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CircleAlert, Copy, KeyRound, Loader2, Save } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PasswordField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL, formatDateBr } from '@/lib/dateBr';
import {
  CIDADE_MAX,
  NOME_RECEBEDOR_MAX,
  PIX_TIPOS,
  PIX_TIPO_LABEL,
  chaveParaCampo,
  maskChavePix,
  validarChavePix,
  type PixTipo,
} from '@/lib/pixChave';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';

export const PIX_CONFIG_URL = '/api/v1/admin/financeiro/config/pix';
const INSTRUCOES_MAX = 500;

export interface PixConfigApi {
  configurada: boolean;
  tipo: PixTipo | null;
  chave_mascarada: string | null;
  chave: string | null;
  nome_recebedor: string | null;
  cidade: string | null;
  instrucoes: string | null;
  alterado_em: string | null;
  brcode_previa: string | null;
  valor_previa: number | null;
}

interface FormState {
  tipo: PixTipo;
  chave: string;
  nome: string;
  cidade: string;
  instrucoes: string;
}

const EMPTY: FormState = { tipo: 'cpf', chave: '', nome: '', cidade: '', instrucoes: '' };

function toForm(data: PixConfigApi): FormState {
  if (!data.configurada || !data.tipo) return EMPTY;
  return {
    tipo: data.tipo,
    chave: data.chave ? chaveParaCampo(data.tipo, data.chave) : '',
    nome: data.nome_recebedor ?? '',
    cidade: data.cidade ?? '',
    instrucoes: data.instrucoes ?? '',
  };
}

function PixPreview({ data }: { data: PixConfigApi }) {
  const { showSuccess, showError } = useSnackbar();
  if (!data.brcode_previa) return null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(data.brcode_previa ?? '');
      showSuccess('PIX copia e cola copiado.');
    } catch {
      showError('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start">
      <div className="self-center rounded-lg bg-white p-2 sm:self-start">
        <QRCodeSVG value={data.brcode_previa} size={148} level="M" data-testid="pix-qr-previa" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-semibold">Prévia do QR com a chave salva</p>
        <p className="text-xs text-muted-foreground">
          Valor de exemplo: {formatBRL(data.valor_previa ?? 0)}. Leia com o app do seu banco e confira a chave e o nome de
          quem recebe antes de divulgar para a corrente.
        </p>
        <code className="block max-h-20 overflow-auto break-all rounded-md bg-muted px-2 py-1 text-[11px]" aria-label="PIX copia e cola">
          {data.brcode_previa}
        </code>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={copiar}>
            <Copy aria-hidden /> Copiar PIX copia e cola
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PixConfigCard({ canEdit }: { canEdit: boolean }) {
  const { showSuccess } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<PixConfigApi | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saved, setSaved] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [senha, setSenha] = useState('');
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<PixConfigApi>(PIX_CONFIG_URL)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        const next = toForm(res.data);
        setForm(next);
        setSaved(next);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton className="h-40 w-full" aria-label="Carregando a chave PIX" />;
  if (loadError || !data) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar a chave PIX.</AlertDescription>
      </Alert>
    );
  }

  const chaveError = validarChavePix(form.tipo, form.chave);
  const nomeError = !form.nome.trim() ? 'Informe o nome de quem recebe.' : null;
  const cidadeError = !form.cidade.trim() ? 'Informe a cidade.' : null;
  const invalid = Boolean(chaveError || nomeError || cidadeError);
  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const abrirConfirmacao = () => {
    setTouched(true);
    if (invalid) return;
    setSenha('');
    setSenhaError(null);
    setConfirmOpen(true);
  };

  const salvar = async () => {
    if (!senha) {
      setSenhaError('Digite sua senha para confirmar.');
      return;
    }
    setSaving(true);
    setSenhaError(null);
    try {
      const res = await apiClient.put<PixConfigApi>(
        PIX_CONFIG_URL,
        {
          tipo: form.tipo,
          chave: form.chave,
          nome_recebedor: form.nome,
          cidade: form.cidade,
          instrucoes: form.instrucoes,
          senha,
        },
        // 401 aqui é "senha errada", não sessão expirada: não pode deslogar.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      setData(res.data);
      const next = toForm(res.data);
      setForm(next);
      setSaved(next);
      setConfirmOpen(false);
      setSenha('');
      setTouched(false);
      showSuccess('Chave PIX salva. Os administradores foram avisados por e-mail.');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSenhaError(
        status === 401
          ? 'Senha incorreta. Confira e tente de novo.'
          : extractApiErrorMessage(e, 'Não foi possível salvar a chave PIX.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const tipoAtual = PIX_TIPOS.find((t) => t.value === form.tipo) ?? PIX_TIPOS[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-brand" aria-hidden /> Chave PIX da mensalidade
        </CardTitle>
        <CardDescription>
          Para onde vai o dinheiro quando o médium usa “Pagar com PIX”. Sem taxa: o pagamento cai direto na conta da chave.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.configurada ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="pix-chave-atual">
            <span className="text-muted-foreground">Chave atual: </span>
            <strong>{data.tipo ? PIX_TIPO_LABEL[data.tipo] : ''}</strong> ·{' '}
            <span className="font-mono">{data.chave ?? data.chave_mascarada}</span>
            {data.alterado_em && <span className="text-muted-foreground"> · alterada em {formatDateBr(data.alterado_em)}</span>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma chave cadastrada. Sem chave, a Área mostra “Combine o pagamento com a casa”.</p>
        )}

        {canEdit && (
          <>
            <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pix-tipo">Tipo de chave</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as PixTipo, chave: '' }))}
                >
                  <SelectTrigger id="pix-tipo" className="w-full" aria-label="Tipo de chave">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIX_TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField
                label="Chave PIX"
                value={form.chave}
                onChange={(e) => set('chave', maskChavePix(form.tipo, e.target.value))}
                placeholder={tipoAtual.placeholder}
                inputMode={form.tipo === 'cpf' || form.tipo === 'telefone' ? 'numeric' : form.tipo === 'email' ? 'email' : 'text'}
                autoComplete="off"
                error={touched && chaveError ? chaveError : undefined}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nome de quem recebe"
                value={form.nome}
                onChange={(e) => set('nome', e.target.value.slice(0, NOME_RECEBEDOR_MAX))}
                maxLength={NOME_RECEBEDOR_MAX}
                error={touched && nomeError ? nomeError : undefined}
                helperText={`Até ${NOME_RECEBEDOR_MAX} letras, vai sem acento no QR. O banco do médium mostra o nome do titular da chave.`}
              />
              <TextField
                label="Cidade"
                value={form.cidade}
                onChange={(e) => set('cidade', e.target.value.slice(0, CIDADE_MAX))}
                maxLength={CIDADE_MAX}
                error={touched && cidadeError ? cidadeError : undefined}
                helperText={`Até ${CIDADE_MAX} letras.`}
              />
            </div>
            <TextField
              label="Instruções para o médium (opcional)"
              value={form.instrucoes}
              onChange={(e) => set('instrucoes', e.target.value.slice(0, INSTRUCOES_MAX))}
              multiline
              rows={2}
              maxLength={INSTRUCOES_MAX}
              placeholder="Ex.: depois de pagar, envie o comprovante pela Área."
              helperText={`Aparece junto do PIX na Área do Médium. ${form.instrucoes.length}/${INSTRUCOES_MAX}`}
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-muted-foreground">Salvar pede a sua senha e avisa todos os administradores por e-mail.</span>
              <Button type="button" onClick={abrirConfirmacao} disabled={!isDirty || saving}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                Salvar chave PIX
              </Button>
            </div>

            <PixPreview data={data} />
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirme com a sua senha"
        confirmText="Salvar chave"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={salvar}
        message={
          <div className="flex flex-col gap-3">
            <p>
              A mensalidade passa a ir para a chave <strong>{PIX_TIPO_LABEL[form.tipo]}</strong>{' '}
              <span className="font-mono">{form.chave}</span>. Todos os administradores do terreiro recebem um e-mail avisando.
            </p>
            <PasswordField
              label="Sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              error={senhaError ?? undefined}
              autoFocus
            />
          </div>
        }
      />
    </Card>
  );
}

export default PixConfigCard;
