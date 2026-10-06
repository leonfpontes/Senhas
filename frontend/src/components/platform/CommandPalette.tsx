/**
 * CommandPalette — busca de comandos da plataforma (⌘K / Ctrl+K).
 *
 * Pula para qualquer terreiro por nome/slug e oferece ações sobre o melhor resultado:
 * "Entrar como admin de X", "Abrir conversa de X", "Dar bônus a X". Os terreiros são carregados
 * na primeira abertura (`GET /api/v1/platform/tenants?limit=1000`) e filtrados no cliente — o
 * endpoint `/tenants/search` existe no backend, mas fica à sombra de `/tenants/{tenant_id}`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Building2, Gift, LayoutDashboard, LifeBuoy, LogIn, MessageSquare, ScrollText, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { impersonateTenantAdmin } from './impersonate';
import { PlanBadge } from './PlanBadge';

export interface CommandTenant {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  plan?: string | null;
  is_bonus?: boolean | null;
}

export const PALETTE_NAV = [
  { label: 'Hoje', href: '/platform', icon: LayoutDashboard },
  { label: 'Terreiros', href: '/platform/tenants', icon: Building2 },
  { label: 'Suporte', href: '/platform/suporte', icon: LifeBuoy },
  { label: 'Auditoria', href: '/platform/audit_consolidated', icon: ScrollText },
  { label: 'Configurações', href: '/platform/settings', icon: Settings },
] as const;

const MAX_RESULTS = 8;

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterTenants(tenants: CommandTenant[], query: string, limit = MAX_RESULTS): CommandTenant[] {
  const q = normalize(query.trim());
  if (!q) return tenants.slice(0, limit);
  const terms = q.split(/\s+/);
  return tenants
    .filter((t) => {
      const hay = `${normalize(t.name)} ${normalize(t.slug)}`;
      return terms.every((term) => hay.includes(term));
    })
    .slice(0, limit);
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tenants, setTenants] = useState<CommandTenant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || tenants !== null || loading) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<CommandTenant[]>('/api/v1/platform/tenants', { params: { limit: 1000 } })
      .then((res) => {
        if (!cancelled) setTenants(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setTenants([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenants, loading]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useMemo(() => filterTenants(tenants ?? [], query), [tenants, query]);
  const best = query.trim() ? results[0] : undefined;

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const enterAsAdmin = useCallback(
    async (t: CommandTenant) => {
      setBusy(true);
      try {
        await impersonateTenantAdmin(t.id);
        onOpenChange(false);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, err instanceof Error ? err.message : 'Erro ao entrar como admin'));
      } finally {
        setBusy(false);
      }
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar na plataforma</DialogTitle>
          <DialogDescription>Pule para um terreiro ou execute uma ação</DialogDescription>
        </DialogHeader>
        {/* Filtro próprio (nome/slug sem acento) — por isso `shouldFilter={false}`. */}
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
      <CommandInput
        placeholder="Buscar terreiro por nome ou slug…"
        value={query}
        onValueChange={setQuery}
        aria-label="Buscar terreiro"
      />
      <CommandList>
        <CommandEmpty>{loading ? 'Carregando terreiros…' : 'Nenhum terreiro encontrado.'}</CommandEmpty>

        {best && (
          <>
            <CommandGroup heading={`Ações · ${best.name}`}>
              <CommandItem value={`entrar-${best.id}`} disabled={busy} onSelect={() => enterAsAdmin(best)}>
                <LogIn aria-hidden />
                <span>Entrar como admin de {best.name}</span>
              </CommandItem>
              <CommandItem value={`conversa-${best.id}`} onSelect={() => go(`/platform/suporte?tenant=${best.id}`)}>
                <MessageSquare aria-hidden />
                <span>Abrir conversa de {best.name}</span>
              </CommandItem>
              <CommandItem value={`bonus-${best.id}`} onSelect={() => go(`/platform/tenants/${best.id}?tab=assinatura&bonus=1`)}>
                <Gift aria-hidden />
                <span>Dar bônus a {best.name}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Terreiros">
            {results.map((t) => (
              <CommandItem key={t.id} value={`tenant-${t.id}`} onSelect={() => go(`/platform/tenants/${t.id}`)}>
                <Building2 aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {t.name}
                  <span className="ml-2 text-xs text-muted-foreground">{t.slug}</span>
                </span>
                {t.plan !== undefined && <PlanBadge plan={t.plan} bonus={t.is_bonus} />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!query.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navegação">
              {PALETTE_NAV.map((item) => (
                <CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)}>
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                  {item.href === '/platform' && <CommandShortcut>Início</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Atalho ⌘K / Ctrl+K: devolve `[open, setOpen]`. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return [open, setOpen];
}

export default CommandPalette;
