/**
 * "Cheguei" com o QR do dia (AM-28) — folha da Área do Médium.
 *
 * Três caminhos:
 * 1. Leitor dentro da Área: câmera traseira (`getUserMedia`) + `lib/leitorQr` — o
 *    `BarcodeDetector` nativo (Chrome/Edge no Android) ou, sem ele (iPhone, AM-29), o `jsqr`
 *    baixado só nessa hora (chunk próprio). Leu o QR → manda o código.
 * 2. Câmera do próprio celular (sem câmera na Área ou sem os leitores): o QR é um link da Área com
 *    `?cheguei=<código>` — a câmera abre a Área e o detalhe da atividade já marca o "Cheguei".
 * 3. Sem câmera ou sem permissão: digitar o código curto que aparece embaixo do QR.
 *
 * O servidor confere o código daquela atividade e daquela janela (muda a cada minuto). A câmera é
 * desligada ao fechar a folha.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, QrCode } from 'lucide-react';
import { MediumSheet } from '@/components/medium/mensalidade/MediumSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { criarLeitorQr, temCamera } from '@/lib/leitorQr';
import { codigoDoErro, codigoDoQr, mensagemDoErro } from './presencaApi';

export interface ChegueiSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  onCodigo: (codigo: string) => Promise<void>;
}

export function ChegueiSheet({ open, onOpenChange, titulo, onCodigo }: ChegueiSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ocupadoRef = useRef(false);
  const [camera, setCamera] = useState<'desligada' | 'abrindo' | 'lendo' | 'negada' | 'sem_leitor'>(
    'desligada',
  );
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const enviar = useCallback(
    async (valor: string) => {
      const limpo = codigoDoQr(valor);
      if (!limpo || ocupadoRef.current) return;
      ocupadoRef.current = true;
      setEnviando(true);
      setErro(null);
      try {
        await onCodigo(limpo);
        pararCamera();
        onOpenChange(false);
      } catch (err) {
        setErro(
          codigoDoErro(err) === 'QR_INVALIDO'
            ? 'Esse código não vale mais. Aponte para o QR que está na tela agora ou digite o código novo.'
            : mensagemDoErro(err, 'Não conseguimos marcar sua presença. Tente de novo.'),
        );
      } finally {
        ocupadoRef.current = false;
        setEnviando(false);
      }
    },
    [onCodigo, onOpenChange, pararCamera],
  );

  useEffect(() => {
    if (!open) {
      pararCamera();
      setCamera('desligada');
      return;
    }
    setCodigo('');
    setErro(null);
    if (!temCamera()) {
      setCamera('sem_leitor');
      return;
    }
    let ativo = true;
    let lendo = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    setCamera('abrindo');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (stream) => {
        if (!ativo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // Câmera liberada: só agora escolhe o leitor (no iPhone baixa o jsqr; negar a câmera
        // não baixa nada).
        const leitor = await criarLeitorQr();
        if (!ativo) return;
        if (!leitor) {
          pararCamera();
          setCamera('sem_leitor');
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (!ativo) return;
        setCamera('lendo');
        timer = setInterval(() => {
          const v = videoRef.current;
          if (!v || v.readyState < 2 || ocupadoRef.current || lendo) return;
          lendo = true;
          leitor
            .ler(v)
            .then((lido) => {
              if (lido) void enviar(lido);
            })
            .catch(() => undefined)
            .finally(() => {
              lendo = false;
            });
        }, 350);
      })
      .catch(() => ativo && setCamera('negada'));
    return () => {
      ativo = false;
      if (timer) clearInterval(timer);
      pararCamera();
    };
  }, [open, enviar, pararCamera]);

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Cheguei"
      description={`Aponte para o QR da casa · ${titulo}`}
      data-testid="cheguei-sheet"
    >
      {(camera === 'abrindo' || camera === 'lendo') && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
            aria-label="Câmera lendo o QR"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80"
          />
          {camera === 'abrindo' && (
            <span className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="size-8 animate-spin" aria-hidden />
            </span>
          )}
        </div>
      )}
      {camera === 'sem_leitor' && (
        <p
          className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-base"
          data-testid="cheguei-sem-leitor"
        >
          <Camera className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <span>
            Abra a <strong>câmera do celular</strong> e aponte para o QR que está na tela da casa: o
            link já marca a sua presença. Ou digite o código que aparece embaixo do QR.
          </span>
        </p>
      )}
      {camera === 'negada' && (
        <p className="rounded-2xl bg-warning/15 p-4 text-base text-warning-strong" role="status">
          Não conseguimos abrir a câmera. Digite o código que aparece embaixo do QR.
        </p>
      )}

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(codigo);
        }}
      >
        <Label htmlFor="cheguei-codigo" className="text-base font-bold">
          Código embaixo do QR
        </Label>
        <Input
          id="cheguei-codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 12))}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          placeholder="Ex.: K7P2QX"
          className="h-12 text-center font-mono text-xl tracking-[0.3em] uppercase"
        />
        {erro && (
          <p
            className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-strong"
            role="alert"
          >
            {erro}
          </p>
        )}
        <Button
          type="submit"
          size="touch"
          className="w-full font-bold"
          disabled={enviando || codigo.trim().length < 6}
        >
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <QrCode aria-hidden />}
          Marcar presença
        </Button>
      </form>
    </MediumSheet>
  );
}
