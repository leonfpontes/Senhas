/**
 * CommandPalette — busca de páginas e ações (⌘K / Ctrl K, e botão "Buscar…" no topbar).
 *
 * Ações: "Criar gira", "Copiar link de senhas", "Abrir Porta", "Compartilhar link". As páginas
 * vêm dos mesmos grupos da sidebar (`useAdminNav`), então respeitam plano e permissão.
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { Copy, DoorOpen, Plus, Share2 } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { copyToClipboard, fetchUnifiedLinks } from '@/components/admin/ShareLinkDialog';
import { flattenNav, type NavAction, type NavGroupDef } from '@/components/admin/layout/navConfig';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroupDef[];
  /** `giras:insert` e plano com vaga para criar gira. */
  canCreateGira: boolean;
  canOpenPorta: boolean;
  canShareLink: boolean;
  onAction: (action: NavAction) => void;
}

/** Abre/fecha a paleta com ⌘K (Mac) ou Ctrl K. */
export function useCommandPaletteShortcut(onToggle: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggle]);
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  canCreateGira,
  canOpenPorta,
  canShareLink,
  onAction,
}: CommandPaletteProps) {
  const router = useRouter();
  const pages = flattenNav(groups).filter((p) => !p.action);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const handleCopyLink = async () => {
    const links = await fetchUnifiedLinks();
    if (!links?.public_link) {
      toast.error('O link de senhas ainda não está disponível. Configure as senhas de uma gira primeiro.');
      return;
    }
    const ok = await copyToClipboard(links.public_link);
    if (ok) toast.success('Link de senhas copiado!');
    else toast.error('Não foi possível copiar o link.');
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar ações e páginas"
      description="Digite para encontrar uma página ou uma ação rápida."
          >
      <CommandInput placeholder="O que você quer fazer?" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ações">
          {canCreateGira && (
            <CommandItem value="criar gira nova gira" onSelect={() => run(() => router.push('/admin/giras?nova=1'))}>
              <Plus aria-hidden /> Criar gira
            </CommandItem>
          )}
          {canShareLink && (
            <CommandItem value="copiar link de senhas" onSelect={() => run(() => void handleCopyLink())}>
              <Copy aria-hidden /> Copiar link de senhas
            </CommandItem>
          )}
          {canOpenPorta && (
            <CommandItem value="abrir porta fila chamar" onSelect={() => run(() => router.push('/admin/porta'))}>
              <DoorOpen aria-hidden /> Abrir Porta
            </CommandItem>
          )}
          {canShareLink && (
            <CommandItem value="compartilhar link whatsapp qr code" onSelect={() => run(() => onAction('share-link'))}>
              <Share2 aria-hidden /> Compartilhar link
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Páginas">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <CommandItem
                key={page.href}
                value={[page.label, ...(page.keywords ?? [])].join(' ')}
                onSelect={() => run(() => router.push(page.href))}
              >
                <Icon aria-hidden /> {page.label}
                {typeof page.badge === 'number' && page.badge > 0 && <CommandShortcut>{page.badge}</CommandShortcut>}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
