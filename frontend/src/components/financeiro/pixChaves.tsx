/**
 * Peças comuns das chaves PIX da mensalidade (cadastro único, migração 112 — 11/2026):
 * URLs, tipos da resposta de `GET /config/pix/chaves`, o select da conta bancária e a prévia do
 * QR + "PIX copia e cola" de uma chave (gerada no servidor, a mesma que o médium usa).
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBRL } from '@/lib/dateBr';
import type { PixTipo } from '@/lib/pixChave';
import { useSnackbar } from '@/contexts/SnackbarContext';

export const PIX_CHAVES_URL = '/api/v1/admin/financeiro/config/pix/chaves';
export const PIX_GRUPOS_URL = '/api/v1/admin/financeiro/config/pix/grupos';
export const INSTRUCOES_MAX = 500;
export const APELIDO_MAX = 60;
/** Valor do Select quando a chave não está ligada a nenhuma conta. */
export const SEM_CONTA = '__sem_conta__';

export interface ContaBancariaOpcao {
  id: string;
  nome: string;
  banco: string | null;
}

export interface GrupoResumoApi {
  id: string;
  nome: string;
  cor: string;
}

export interface ChavePixApi {
  id: string;
  apelido: string;
  principal: boolean;
  tipo: PixTipo;
  chave_mascarada: string;
  chave: string | null;
  nome_recebedor: string;
  cidade: string;
  instrucoes: string | null;
  alterado_em: string | null;
  conta_bancaria_id: string | null;
  conta_bancaria_nome: string | null;
  grupos: GrupoResumoApi[];
  total_mediuns: number;
  brcode_previa: string | null;
}

export interface ChavesPixApi {
  chaves: ChavePixApi[];
  valor_previa?: number | null;
  /** `chave_id` null = o grupo paga na chave principal. */
  grupos: (GrupoResumoApi & { chave_id: string | null })[];
  contas_bancarias: ContaBancariaOpcao[];
  conflitos: { medium_id: string; medium_nome: string; chave_valida: string; outras: string[] }[];
}

export function ContaBancariaSelect({
  id,
  value,
  onChange,
  contas,
  nomeAtual,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  contas: ContaBancariaOpcao[];
  /** Nome da conta salva, quando ela não está mais entre as ativas. */
  nomeAtual?: string | null;
}) {
  const fora = value !== SEM_CONTA && !contas.some((c) => c.id === value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Conta onde o PIX cai</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-label="Conta onde o PIX cai">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_CONTA}>Sem conta definida</SelectItem>
          {fora && <SelectItem value={value}>{nomeAtual ?? 'Conta atual'}</SelectItem>}
          {contas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.banco ? `${c.nome} (${c.banco})` : c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        A mensalidade paga nesta chave entra no saldo dessa conta no Fluxo de caixa. Cadastre as contas em Configuração
        financeira → Contas bancárias.
      </p>
    </div>
  );
}

/** QR + "PIX copia e cola" de uma chave salva, com um valor de exemplo. */
export function PixPreview({ brcode, valor }: { brcode: string; valor?: number | null }) {
  const { showSuccess, showError } = useSnackbar();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(brcode);
      showSuccess('PIX copia e cola copiado.');
    } catch {
      showError('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start">
      <div className="self-center rounded-lg bg-white p-2 sm:self-start">
        <QRCodeSVG value={brcode} size={148} level="M" data-testid="pix-qr-previa" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-semibold">QR e PIX copia e cola desta chave</p>
        <p className="text-xs text-muted-foreground">
          Valor de exemplo: {formatBRL(valor ?? 0)}. Leia com o app do seu banco e confira a chave e o nome de quem recebe
          antes de divulgar para a corrente.
        </p>
        <code
          className="block max-h-20 overflow-auto break-all rounded-md bg-muted px-2 py-1 text-[11px]"
          aria-label="PIX copia e cola"
        >
          {brcode}
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
