/**
 * "Pagar com PIX" (AM-11, jornada J7): três passos — copiar o PIX copia e cola, abrir o app do
 * banco em "PIX copia e cola", enviar o comprovante — e, recolhidos, o QR Code (para pagar de
 * outro aparelho) e a chave da casa (para quem prefere digitar).
 *
 * O código vem pronto do servidor (`GET /api/v1/medium/mensalidades/{mes}/pix`: valor e txid do
 * mês) — a tela nunca monta o BR Code. Sem clipboard (navegador do WhatsApp, por exemplo), o
 * código fica selecionável e a tela pede "toque e segure para copiar".
 */
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Info, MessageCircle, TriangleAlert, Upload } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { TerreiroEmblem } from '../TerreiroEmblem';
import { diaMesCurto, nomeDoMes, valorBr } from '../format';
import { MediumSheet, Passo } from './MediumSheet';
import { copiarTexto } from './arquivos';
import type { MesMensalidade, PixDoMes } from './tipos';

export interface PagarPixSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mes: MesMensalidade | null;
  terreiroNome?: string | null;
  logoUrl?: string | null;
  /** Link "Falar com a casa" (WhatsApp), quando a casa cadastrou. */
  whatsapp?: string | null;
  onEnviarComprovante: () => void;
}

type Copiado = 'codigo' | 'chave' | null;

const CODE_BOX =
  'rounded-xl border border-border bg-muted px-3 py-2.5 font-mono text-sm break-all select-all';

export function PagarPixSheet({
  open,
  onOpenChange,
  mes,
  terreiroNome,
  logoUrl,
  whatsapp,
  onEnviarComprovante,
}: PagarPixSheetProps) {
  const [pix, setPix] = useState<PixDoMes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<Copiado>(null);
  const [semCopia, setSemCopia] = useState<Copiado>(null);

  useEffect(() => {
    if (!open || !mes) return;
    let vivo = true;
    setPix(null);
    setErro(null);
    setCopiado(null);
    setSemCopia(null);
    apiClient
      .get<PixDoMes>(`/api/v1/medium/mensalidades/${mes.mes}/pix`)
      .then((res) => vivo && setPix(res.data))
      .catch(
        (err) =>
          vivo &&
          setErro(
            extractApiErrorMessage(err, 'Não conseguimos montar o PIX agora. Tente de novo.'),
          ),
      );
    return () => {
      vivo = false;
    };
  }, [open, mes]);

  const copiar = async (qual: Exclude<Copiado, null>, texto: string) => {
    const ok = await copiarTexto(texto);
    setCopiado(ok ? qual : null);
    setSemCopia(ok ? null : qual);
  };

  const recebedor = pix?.nome_recebedor || terreiroNome || 'a casa';
  const titulo = mes ? `${nomeDoMes(mes.mes)}` : '';

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      data-testid="sheet-pagar"
      title="Pagar com PIX"
      leading={
        <TerreiroEmblem nome={terreiroNome ?? undefined} logoUrl={logoUrl} className="size-11" />
      }
      description={
        mes ? (
          <>
            Para {terreiroNome || 'a casa'} · {titulo} ·{' '}
            <strong className="text-foreground">{valorBr(pix?.valor ?? mes.valor)}</strong>
          </>
        ) : undefined
      }
    >
      {erro ? (
        <div className="flex flex-col gap-3">
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3 text-base text-destructive-strong"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>{erro}</span>
          </p>
          {whatsapp && (
            <Button asChild variant="outline" size="touch" className="w-full font-bold">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden /> Falar com a casa
              </a>
            </Button>
          )}
        </div>
      ) : !pix ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Preparando o PIX">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {pix.chave_alterada_em && (
            <p className="flex items-start gap-2.5 rounded-xl bg-info/10 p-3 text-sm text-info-strong">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                A casa trocou a chave PIX em {diaMesCurto(pix.chave_alterada_em)}. Confira o nome de
                quem recebe antes de pagar.
              </span>
            </p>
          )}
          <ol className="flex flex-col gap-4">
            <Passo n={1}>
              <strong>Copie o código do PIX</strong>
              <div className={CODE_BOX} data-testid="pix-copia-e-cola">
                {pix.copia_e_cola}
              </div>
              <Button
                type="button"
                size="touch"
                className="w-full font-bold"
                onClick={() => void copiar('codigo', pix.copia_e_cola)}
              >
                {copiado === 'codigo' ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copiado === 'codigo' ? 'Código copiado' : 'Copiar código do PIX'}
              </Button>
              {semCopia === 'codigo' && (
                <p role="status" className="text-sm text-muted-foreground">
                  Não deu para copiar sozinho. Toque e segure no código acima e escolha
                  <strong> Copiar</strong>.
                </p>
              )}
            </Passo>
            <Passo n={2}>
              <span>
                Abra o app do seu banco, entre em <strong>PIX</strong> e escolha{' '}
                <strong>PIX copia e cola</strong>. Confira o nome de quem recebe:{' '}
                <strong>{recebedor}</strong>.
              </span>
            </Passo>
            <Passo n={3}>
              <span>Depois de pagar, envie o comprovante aqui.</span>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full font-bold"
                onClick={onEnviarComprovante}
              >
                <Upload aria-hidden /> Enviar comprovante
              </Button>
            </Passo>
          </ol>

          {pix.instrucoes && (
            <p className="rounded-xl bg-muted px-3.5 py-3 text-sm whitespace-pre-line">
              <strong className="block text-xs tracking-wider text-muted-foreground uppercase">
                Recado da casa
              </strong>
              {pix.instrucoes}
            </p>
          )}

          <Accordion type="multiple" className="rounded-2xl border border-border px-4">
            <AccordionItem value="qr">
              <AccordionTrigger className="min-h-12 items-center text-base font-bold">
                Pagar de outro aparelho (QR Code)
              </AccordionTrigger>
              <AccordionContent className="flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={pix.copia_e_cola} size={200} level="M" data-testid="pix-qr" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Aponte a câmera do app do banco para o código.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="chave">
              <AccordionTrigger className="min-h-12 items-center text-base font-bold">
                Prefere usar a chave PIX?
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                <div className={CODE_BOX} data-testid="pix-chave">
                  {pix.chave}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full font-bold"
                  onClick={() => void copiar('chave', pix.chave)}
                >
                  {copiado === 'chave' ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copiado === 'chave' ? 'Chave copiada' : 'Copiar chave PIX'}
                </Button>
                {semCopia === 'chave' && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Não deu para copiar sozinho. Toque e segure na chave e escolha{' '}
                    <strong>Copiar</strong>.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Digite o valor de <strong>{valorBr(pix.valor)}</strong> no app do banco.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </MediumSheet>
  );
}

export default PagarPixSheet;
