/**
 * ShareLinkDialog — o único lugar onde o terreiro compartilha o link de senhas.
 *
 * Link grande e legível, QR code (qrcode.react, o mesmo do checklist), botão de WhatsApp,
 * copiar e abrir em nova aba. Usado pelo GiraCard, pelo drawer da gira, pelo checklist do
 * dashboard, pela barra inferior do celular e pela busca de ações.
 *
 * `onShared(kind)` avisa quem abriu que houve um compartilhamento de verdade (WhatsApp ou
 * cópia) — o checklist usa isso para marcar o passo "Compartilhe" como feito.
 */
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ExternalLink, Send, Star } from 'lucide-react';
import { CartazDoPortao } from '@/components/admin/CartazDoPortao';
import { useSubscription } from '@/hooks/useSubscription';
import { useTenant } from '@/providers/ThemeProvider';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type ShareKind = 'whatsapp' | 'copy' | 'open';

export interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Link de senhas (comum). */
  link: string | null | undefined;
  /** Link de senhas de associado (aba separada quando informado). */
  sponsorLink?: string | null;
  tenantName?: string | null;
  title?: string;
  description?: string;
  loading?: boolean;
  onShared?: (kind: ShareKind) => void;
  /**
   * Link de UMA gira (`/public/gira/{id}`), não o link único do terreiro: os textos deixam de
   * dizer que o link vale para todas as giras.
   */
  giraName?: string | null;
}

export function buildWhatsAppShareUrl(link: string, tenantName?: string | null, giraName?: string | null): string {
  const quem = tenantName ? ` do ${tenantName}` : '';
  const text = giraName
    ? `Para pegar sua senha para a ${giraName}${quem}, é só abrir este link no celular:\n${link}`
    : `Para pegar sua senha para as giras${quem}, é só abrir este link no celular:\n${link}\n\n` +
      'O link é o mesmo para todas as giras — pode salvar.';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export interface UnifiedLinks {
  public_link: string;
  sponsor_public_link: string;
}

let unifiedLinksCache: UnifiedLinks | null = null;
let unifiedLinksPromise: Promise<UnifiedLinks | null> | null = null;

/** Links únicos do terreiro (`/giras/unified-links`), com cache por aba. */
export function fetchUnifiedLinks(force = false): Promise<UnifiedLinks | null> {
  if (unifiedLinksCache && !force) return Promise.resolve(unifiedLinksCache);
  if (unifiedLinksPromise && !force) return unifiedLinksPromise;
  unifiedLinksPromise = apiClient
    .get<UnifiedLinks>('/api/v1/admin/giras/unified-links')
    .then((res) => {
      const data = res?.data;
      if (data && typeof data.public_link === 'string') {
        unifiedLinksCache = data;
        return data;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      unifiedLinksPromise = null;
    });
  return unifiedLinksPromise;
}

/** Só para testes: limpa o cache dos links únicos. */
export function resetUnifiedLinksCache(): void {
  unifiedLinksCache = null;
  unifiedLinksPromise = null;
}

/** O texto que vai no WhatsApp (o mesmo do link `wa.me`), para a prévia "No grupo da casa vai ficar assim". */
export function whatsAppShareText(link: string, tenantName?: string | null, giraName?: string | null): string {
  return decodeURIComponent(buildWhatsAppShareUrl(link, tenantName, giraName).split('?text=')[1] ?? '');
}

function LinkPanel({
  link,
  tenantName,
  onShared,
  accent,
  giraName,
}: {
  link: string;
  tenantName?: string | null;
  onShared?: (kind: ShareKind) => void;
  accent?: boolean;
  giraName?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      onShared?.('copy');
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm text-muted-foreground">
        {giraName
          ? 'O link desta gira abre direto nela. O do terreiro sempre abre a próxima gira com senhas abertas: bom para a bio do Instagram e para o cartaz fixo.'
          : 'O link do terreiro é o mesmo para todas as giras: sempre abre a próxima com senhas abertas. Bom para a bio do Instagram e para o cartaz fixo.'}
      </p>
      <div
        className={cn(
          'flex min-h-15 items-center gap-2.5 rounded-[10px] border-[1.5px] border-input bg-card py-2 pr-2.5 pl-4',
          accent && 'border-warning/60',
        )}
      >
        <p data-testid="share-link-text" className="min-w-0 flex-1 text-base font-medium break-all text-foreground">
          {link}
        </p>
        <Button type="button" variant="outline" className="h-10 shrink-0" onClick={handleCopy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button asChild size="touch">
          <a
            href={buildWhatsAppShareUrl(link, tenantName, giraName)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onShared?.('whatsapp')}
          >
            <Send aria-hidden /> Mandar no WhatsApp
          </a>
        </Button>
        <Button asChild variant="link" className="h-11 px-0 text-base">
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => onShared?.('open')}>
            Abrir o link <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
      <p className="mt-1 text-sm font-medium text-muted-foreground">No grupo da casa vai ficar assim:</p>
      <div className="rounded-[10px] rounded-tl-none bg-[#DCF8C6] px-3.5 py-2.5 text-sm whitespace-pre-line text-[#1F2A1F]" data-testid="share-preview">
        {whatsAppShareText(link, tenantName, giraName)}
      </div>
    </div>
  );
}

/** QR simples (sem a beta do cartaz): o mesmo de sempre, para imprimir na entrada. */
function QrSimples({ link }: { link: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl border bg-white p-3" aria-hidden>
        <QRCodeSVG value={link} size={148} level="M" data-testid="share-link-qr" />
      </div>
      <p className="w-40 text-center text-xs text-muted-foreground">Aponte a câmera do celular.</p>
    </div>
  );
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  link,
  sponsorLink,
  tenantName,
  title = 'Mande o link.',
  description = 'Link de senhas do terreiro',
  loading = false,
  onShared,
  giraName,
}: ShareLinkDialogProps) {
  const hasSponsor = Boolean(sponsorLink);
  const { beta } = useSubscription();
  // O perfil nem sempre traz o nome da casa: o tema do painel sempre traz.
  const { tenantName: nomeDoTema } = useTenant();
  tenantName = tenantName || nomeDoTema;
  const cartaz = Boolean(beta?.('beta_cartaz_portao'));
  // O cartaz é sempre do link do terreiro (vale para todas as giras), mesmo abrindo pela gira.
  const [linkDoTerreiro, setLinkDoTerreiro] = useState<string | null>(giraName ? null : link ?? null);
  useEffect(() => {
    if (!open || !cartaz) return;
    if (!giraName) {
      setLinkDoTerreiro(link ?? null);
      return;
    }
    let vivo = true;
    void fetchUnifiedLinks().then((l) => vivo && setLinkDoTerreiro(l?.public_link ?? null));
    return () => {
      vivo = false;
    };
  }, [open, cartaz, giraName, link]);

  const painel = (l: string, accent?: boolean) => (
    <LinkPanel link={l} tenantName={tenantName} onShared={onShared} giraName={giraName} accent={accent} />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-background sm:max-w-4xl" data-testid="share-link-dialog">
        <DialogHeader>
          <DialogDescription className="text-sm font-medium">{description}</DialogDescription>
          <DialogTitle className="font-display text-[2.25rem] leading-[1.05] font-normal tracking-[-0.02em]">
            {title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            Carregando link…
          </p>
        ) : !link ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            O link aparece assim que a primeira gira tiver senhas configuradas.
          </p>
        ) : (
          <div className="flex flex-col gap-8 md:flex-row">
            <div className="min-w-0 flex-1">
              {hasSponsor ? (
                <Tabs defaultValue="comum">
                  <TabsList className="w-full">
                    <TabsTrigger value="comum" className="flex-1">
                      Comum
                    </TabsTrigger>
                    <TabsTrigger value="associado" className="flex-1">
                      <Star className="size-3.5" aria-hidden /> Associado
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="comum" className="mt-4">
                    {painel(link)}
                  </TabsContent>
                  <TabsContent value="associado" className="mt-4">
                    {painel(sponsorLink as string, true)}
                  </TabsContent>
                </Tabs>
              ) : (
                painel(link)
              )}
            </div>
            <div className="flex shrink-0 justify-center md:w-[260px]">
              {cartaz && linkDoTerreiro ? (
                <CartazDoPortao link={linkDoTerreiro} tenantName={tenantName ?? ''} />
              ) : (
                <QrSimples link={link} />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ShareLinkDialog;
