/**
 * QR do dia da presença (AM-28) — painel grande para a tela da chamada e canto do modo TV.
 *
 * Lê `GET /api/v1/admin/atividades/{id}/qr` (chamada) ou `/da-gira/{gira_id}/qr` (Porta/TV): o
 * código muda a cada 60 s, então o painel busca de novo quando ele vence (e a cada 20 s fora da
 * janela, para aparecer sozinho quando o "Cheguei" abre). O QR é um link da Área com
 * `?cheguei=<código>` — sem nome, e-mail ou qualquer dado pessoal (a TV é pública). Embaixo, o
 * código curto para quem prefere digitar.
 */
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { cn } from '@/lib/utils';
import type { QrResponse } from '@/constants/presenca';

const RECARGA_FORA_DA_JANELA_MS = 20_000;

function hora(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function useQrPresenca(url: string | null) {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [erro, setErro] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    apiClient
      .get<QrResponse>(url)
      .then((res) => {
        if (!vivo) return;
        setQr(res.data);
        setErro(false);
        const vence =
          res.data.ativo && res.data.expira_em
            ? new Date(res.data.expira_em).getTime() - Date.now()
            : null;
        const espera = vence != null ? Math.max(1_000, vence + 500) : RECARGA_FORA_DA_JANELA_MS;
        timer = setTimeout(() => setNonce((n) => n + 1), espera);
      })
      .catch(() => {
        if (!vivo) return;
        setErro(true);
        timer = setTimeout(() => setNonce((n) => n + 1), RECARGA_FORA_DA_JANELA_MS);
      });
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [url, nonce]);

  return { qr, erro };
}

function Segundos({ ate }: { ate?: string | null }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  if (!ate) return null;
  const s = Math.max(0, Math.round((new Date(ate).getTime() - agora) / 1_000));
  return <span className="tabular-nums">{s}s</span>;
}

export interface QrPresencaProps {
  url: string | null;
  /** `tela`: painel da chamada (explica quando aparece); `tv`: canto do modo TV (só com o QR). */
  variante?: 'tela' | 'tv';
  className?: string;
}

export function QrPresenca({ url, variante = 'tela', className }: QrPresencaProps) {
  const { qr } = useQrPresenca(url);
  if (!qr || qr.modo !== 'qr') return null;
  const tv = variante === 'tv';

  if (!qr.ativo || !qr.conteudo || !qr.codigo) {
    if (tv) return null;
    return (
      <div
        className={cn('flex items-center gap-3 rounded-xl border bg-card p-4 text-sm', className)}
        data-testid="qr-presenca-fechado"
      >
        <QrCode className="size-5 text-muted-foreground" aria-hidden />
        <span>
          O QR do “Cheguei” aparece aqui
          {qr.janela_abre_em
            ? ` das ${hora(qr.janela_abre_em)} às ${hora(qr.janela_fecha_em)}`
            : ''}
          .
        </span>
      </div>
    );
  }

  return (
    <section
      aria-label="QR do Cheguei"
      data-testid="qr-presenca"
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl p-5 text-center',
        tv ? 'bg-white text-black shadow-2xl' : 'border bg-white text-black',
        className,
      )}
    >
      <p className={cn('font-bold', tv ? 'text-xl' : 'text-base')}>
        Médium: aponte a câmera para marcar “Cheguei”
      </p>
      <QRCodeSVG
        value={qr.conteudo}
        size={tv ? 260 : 320}
        level="M"
        marginSize={2}
        className="h-auto w-full max-w-[min(80vw,420px)]"
        aria-label="QR do Cheguei"
      />
      <p className="text-sm text-neutral-700">Ou digite o código na Área do Médium</p>
      <p
        className={cn('font-mono font-black tracking-[0.3em]', tv ? 'text-4xl' : 'text-5xl')}
        data-testid="qr-codigo"
      >
        {qr.codigo}
      </p>
      <p className="text-sm text-neutral-700">
        Muda em <Segundos ate={qr.expira_em} />
      </p>
    </section>
  );
}

export default QrPresenca;
