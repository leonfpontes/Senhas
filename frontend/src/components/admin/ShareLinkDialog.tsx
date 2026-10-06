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
import { Check, Copy, ExternalLink, MessageCircle, Star } from 'lucide-react';
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
}

export function buildWhatsAppShareUrl(link: string, tenantName?: string | null): string {
  const quem = tenantName ? ` do ${tenantName}` : '';
  const text =
    `Para pegar sua senha para as giras${quem}, é só abrir este link no celular:\n${link}\n\n` +
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

function LinkPanel({
  link,
  tenantName,
  onShared,
  accent,
}: {
  link: string;
  tenantName?: string | null;
  onShared?: (kind: ShareKind) => void;
  accent?: boolean;
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-xl border bg-white p-3" aria-hidden>
          <QRCodeSVG value={link} size={148} level="M" data-testid="share-link-qr" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p
            data-testid="share-link-text"
            className={cn(
              'rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground',
              accent && 'border-warning/50',
            )}
          >
            {link}
          </p>
          <p className="text-xs text-muted-foreground">
            O link é o mesmo para todas as giras: compartilhe uma vez e deixe o QR impresso na entrada —
            quem chegar aponta a câmera e pega a senha.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button asChild size="touch" className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
          <a
            href={buildWhatsAppShareUrl(link, tenantName)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onShared?.('whatsapp')}
          >
            <MessageCircle aria-hidden /> Enviar no WhatsApp
          </a>
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={handleCopy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Link copiado!' : 'Copiar link'}
        </Button>
        <Button asChild size="touch" variant="outline">
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => onShared?.('open')}>
            <ExternalLink aria-hidden /> Abrir
          </a>
        </Button>
      </div>
    </div>
  );
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  link,
  sponsorLink,
  tenantName,
  title = 'Link de senhas do terreiro',
  description = 'Por este link os consulentes pegam a senha pelo celular.',
  loading = false,
  onShared,
}: ShareLinkDialogProps) {
  const hasSponsor = Boolean(sponsorLink);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="share-link-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            Carregando link…
          </p>
        ) : !link ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            O link aparece assim que a primeira gira tiver senhas configuradas.
          </p>
        ) : hasSponsor ? (
          <Tabs defaultValue="comum">
            <TabsList className="w-full">
              <TabsTrigger value="comum" className="flex-1">
                Senha comum
              </TabsTrigger>
              <TabsTrigger value="associado" className="flex-1">
                <Star className="size-3.5" aria-hidden /> Associados
              </TabsTrigger>
            </TabsList>
            <TabsContent value="comum" className="mt-4">
              <LinkPanel link={link} tenantName={tenantName} onShared={onShared} />
            </TabsContent>
            <TabsContent value="associado" className="mt-4">
              <LinkPanel link={sponsorLink as string} tenantName={tenantName} onShared={onShared} accent />
            </TabsContent>
          </Tabs>
        ) : (
          <LinkPanel link={link} tenantName={tenantName} onShared={onShared} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ShareLinkDialog;
