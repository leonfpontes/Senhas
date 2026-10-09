/**
 * "Já paguei: enviar comprovante" (AM-12, jornadas J7/J8): tirar foto, escolher da galeria ou
 * um PDF; prévia; "Enviar para a casa". A foto é reduzida no navegador antes de subir
 * (`prepararComprovante`, limite de 2 MB igual ao do servidor) e erros dizem o que fazer.
 *
 * `POST /api/v1/medium/mensalidades/{mes}/comprovante` (multipart `arquivo` + `valor_informado`
 * opcional): o mês fica "Aguardando a casa confirmar" — o médium nunca marca como pago. Cada envio
 * é um comprovante NOVO (pagamento parcial, migração 092): os anteriores ficam no histórico.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, ImageUp, Loader2, TriangleAlert } from 'lucide-react';
import { MoneyInput } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { nomeDoMes, valorBr } from '../format';
import { MediumSheet } from './MediumSheet';
import { ArquivoInvalido, prepararComprovante, tamanhoLegivel } from './arquivos';
import { pagamentoParcial, type MesMensalidade } from './tipos';

export interface EnviarComprovanteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mes: MesMensalidade | null;
  onEnviado: (mes: MesMensalidade) => void;
}

export function EnviarComprovanteSheet({
  open,
  onOpenChange,
  mes,
  onEnviado,
}: EnviarComprovanteSheetProps) {
  const { showSuccess } = useSnackbar();
  const cameraRef = useRef<HTMLInputElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [valorPago, setValorPago] = useState(0);

  useEffect(() => {
    if (!open) {
      setArquivo(null);
      setErro(null);
      setValorPago(0);
    }
  }, [open]);

  useEffect(() => {
    if (
      !arquivo ||
      !arquivo.type.startsWith('image/') ||
      typeof URL.createObjectURL !== 'function'
    ) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro(null);
    setPreparando(true);
    try {
      setArquivo(await prepararComprovante(file));
    } catch (err) {
      setArquivo(null);
      setErro(
        err instanceof ArquivoInvalido
          ? err.message
          : 'Não conseguimos abrir esse arquivo. Tente outra foto ou o PDF do banco.',
      );
    } finally {
      setPreparando(false);
    }
  };

  const enviar = async () => {
    if (!arquivo || !mes) return;
    setEnviando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append('arquivo', arquivo, arquivo.name);
      if (valorPago > 0) form.append('valor_informado', valorPago.toFixed(2));
      const res = await apiClient.post<MesMensalidade>(
        `/api/v1/medium/mensalidades/${mes.mes}/comprovante`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      showSuccess('Comprovante enviado. A casa vai conferir.');
      onEnviado(res.data);
      onOpenChange(false);
    } catch (err) {
      setErro(
        extractApiErrorMessage(
          err,
          'Não conseguimos enviar agora. Confira a internet e tente de novo.',
        ),
      );
    } finally {
      setEnviando(false);
    }
  };

  const ocupado = preparando || enviando;

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      data-testid="sheet-comprovante"
      title="Enviar comprovante"
      description={
        mes
          ? `Mensalidade de ${nomeDoMes(mes.mes)} · ${pagamentoParcial(mes) ? 'falta ' : ''}${valorBr(mes.valor)}`
          : undefined
      }
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="comprovante-camera"
        onChange={(e) => void escolher(e)}
      />
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        data-testid="comprovante-arquivo"
        onChange={(e) => void escolher(e)}
      />

      {arquivo ? (
        <div
          className="flex items-center gap-3 rounded-xl border border-border p-3"
          data-testid="comprovante-previa"
        >
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
            <img
              src={previa}
              alt="Prévia do comprovante"
              className="size-16 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-7" aria-hidden />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate">{arquivo.name}</strong>
            <span className="text-sm text-muted-foreground">{tamanhoLegivel(arquivo.size)}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 font-semibold text-brand"
            onClick={() => arquivoRef.current?.click()}
            disabled={ocupado}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full font-semibold"
            onClick={() => cameraRef.current?.click()}
            disabled={ocupado}
          >
            <Camera aria-hidden /> Tirar foto do comprovante
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full font-semibold"
            onClick={() => arquivoRef.current?.click()}
            disabled={ocupado}
          >
            <ImageUp aria-hidden /> Escolher foto ou PDF
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Foto, print ou PDF do comprovante do banco. Se a foto for grande, a gente reduz antes de
        enviar.
      </p>

      <MoneyInput
        label="Quanto você pagou? (opcional)"
        value={valorPago}
        onChange={setValorPago}
        disabled={ocupado}
        helperText="Pagou só uma parte? Diga o valor: a casa confere e você vê quanto falta."
        inputClassName="h-12 text-base"
      />

      {preparando && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Preparando a foto…
        </p>
      )}
      {erro && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3 text-base text-destructive-strong"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{erro}</span>
        </p>
      )}

      <Button
        type="button"
        size="touch"
        className="w-full font-semibold"
        disabled={!arquivo || ocupado}
        onClick={() => void enviar()}
      >
        {enviando && <Loader2 className="animate-spin" aria-hidden />}
        {enviando ? 'Enviando…' : 'Enviar para a casa'}
      </Button>
    </MediumSheet>
  );
}

export default EnviarComprovanteSheet;
