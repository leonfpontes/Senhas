/**
 * /platform/suporte — inbox de suporte do super admin (todas as conversas de todos os terreiros).
 *
 * Desktop (≥ lg): três colunas — lista, conversa e contexto do terreiro (links para o 360 e
 * impersonação). Celular: lista → conversa num `Sheet`. Polling de 8s, badge no título da aba e som
 * em mensagem nova (mesmo padrão de admin/porta.tsx).
 *
 * `?conversation=<id>` seleciona uma conversa; `?tenant=<id>` seleciona a conversa do terreiro
 * (buscada com `tenant_id` se não estiver na lista filtrada). Não há endpoint para a plataforma
 * abrir conversa nova — a conversa nasce no chat do terreiro.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Building2, CheckCircle2, LifeBuoy, LogIn, RotateCcw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { cn } from '@/lib/utils';
import PlatformLayout from './layout';
import { PageHeader } from '@/components/admin/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToneBadge, fmtDate, fmtTime, fmtDateTime, impersonateTenantAdmin } from '@/components/platform';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const POLLING_INTERVAL_MS = 8000;

interface ConversationSummary {
  id: string;
  tenant_id: string;
  tenant_name: string;
  owner_name_snapshot: string;
  status: 'open' | 'resolved';
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: boolean;
}

interface Message {
  id: string;
  body: string;
  is_from_support: boolean;
  sender_name_snapshot: string;
  created_at: string;
}

type StatusFilter = 'open' | 'resolved' | 'all';

/** Agrupa mensagens por dia para os separadores de data. */
export function groupByDay(messages: Message[]): { day: string; items: Message[] }[] {
  const groups: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = fmtDate(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  return groups;
}

function SuportePageContent() {
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 1200px)');
  const isMobile = useMediaQuery('(max-width: 899px)');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [extra, setExtra] = useState<ConversationSummary | null>(null); // selecionada fora do filtro
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const seenMessageIds = useRef<Set<string>>(new Set());
  const firstMessagesLoad = useRef(true);
  const baseTitleRef = useRef<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get<ConversationSummary[]>('/api/v1/platform/support-chat/conversations', { params });
      setConversations(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Erro ao carregar conversas'));
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await apiClient.get<Message[]>(`/api/v1/platform/support-chat/conversations/${conversationId}/messages`);
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (!firstMessagesLoad.current) {
        const genuinelyNew = incoming.some((m) => !m.is_from_support && !seenMessageIds.current.has(m.id));
        if (genuinelyNew) {
          try { new Audio('/sounds/notification.mp3').play().catch(() => {}); } catch { /* não crítico */ }
        }
      }
      incoming.forEach((m) => seenMessageIds.current.add(m.id));
      firstMessagesLoad.current = false;
      setMessages(incoming);
    } catch {
      /* tenta no próximo poll */
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  // Seleção por query (?conversation= / ?tenant=) — uma vez, quando a lista chega.
  const appliedQuery = useRef(false);
  useEffect(() => {
    if (!router.isReady || appliedQuery.current || loadingList) return;
    const { conversation, tenant } = router.query;
    if (typeof conversation === 'string') {
      appliedQuery.current = true;
      setSelectedId(conversation);
      if (!conversations.some((c) => c.id === conversation)) {
        apiClient
          .get<ConversationSummary[]>('/api/v1/platform/support-chat/conversations', { params: { limit: 200 } })
          .then((r) => setExtra((Array.isArray(r.data) ? r.data : []).find((c) => c.id === conversation) ?? null))
          .catch(() => {});
      }
      if (isMobile) setSheetOpen(true);
    } else if (typeof tenant === 'string') {
      appliedQuery.current = true;
      const found = conversations.find((c) => c.tenant_id === tenant);
      if (found) {
        setSelectedId(found.id);
        if (isMobile) setSheetOpen(true);
      } else {
        apiClient
          .get<ConversationSummary[]>('/api/v1/platform/support-chat/conversations', { params: { tenant_id: tenant, limit: 1 } })
          .then((r) => {
            const c = (Array.isArray(r.data) ? r.data : [])[0];
            if (c) {
              setExtra(c);
              setSelectedId(c.id);
              if (isMobile) setSheetOpen(true);
            } else {
              toast.info('Este terreiro ainda não abriu conversa de suporte.');
            }
          })
          .catch(() => {});
      }
    }
  }, [router.isReady, router.query, loadingList, conversations, isMobile]);

  useEffect(() => {
    if (!selectedId) return;
    firstMessagesLoad.current = true;
    seenMessageIds.current = new Set();
    setLoadingMessages(true);
    loadMessages(selectedId).finally(() => setLoadingMessages(false));
    apiClient.post(`/api/v1/platform/support-chat/conversations/${selectedId}/read`).catch(() => {});
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(selectedId);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadMessages]);

  // Rolagem automática para a última mensagem.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, selectedId, sheetOpen]);

  // Título da aba com badge de não lidas.
  const unreadCount = conversations.filter((c) => c.unread).length;
  useEffect(() => {
    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    const base = baseTitleRef.current;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
    return () => {
      if (baseTitleRef.current !== null) document.title = baseTitleRef.current;
    };
  }, [unreadCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => !q || c.tenant_name.toLowerCase().includes(q) || c.owner_name_snapshot.toLowerCase().includes(q));
  }, [conversations, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? (extra?.id === selectedId ? extra : null);

  const select = (id: string) => {
    setSelectedId(id);
    if (isMobile) setSheetOpen(true);
  };

  const handleSendReply = async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    try {
      await apiClient.post(`/api/v1/platform/support-chat/conversations/${selectedId}/messages`, { body });
      setReply('');
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao enviar resposta'));
    } finally {
      setSending(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === 'open' ? 'resolved' : 'open';
    try {
      const res = await apiClient.patch<ConversationSummary>(`/api/v1/platform/support-chat/conversations/${selected.id}/status`, { status: next });
      if (extra?.id === selected.id) setExtra(res.data);
      await loadConversations();
      toast.success(next === 'resolved' ? 'Conversa marcada como resolvida.' : 'Conversa reaberta.');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Erro ao atualizar o status da conversa'));
    }
  };

  const [impersonating, setImpersonating] = useState(false);
  const enterAsAdmin = async () => {
    if (!selected) return;
    setImpersonating(true);
    try {
      await impersonateTenantAdmin(selected.tenant_id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, err instanceof Error ? err.message : 'Erro ao entrar como admin'));
    } finally {
      setImpersonating(false);
    }
  };

  // ── Blocos ──

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <TextField
          label="Buscar conversa"
          placeholder="Terreiro ou usuário"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          startAdornment={<Search className="size-4 text-muted-foreground" aria-hidden />}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="flex flex-col gap-2 p-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState compact icon={<LifeBuoy />} title="Nenhuma conversa encontrada." />
        ) : (
          <ul className="m-0 list-none divide-y p-0" role="listbox" aria-label="Conversas">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selectedId}
                  onClick={() => select(c.id)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                    c.id === selectedId && 'bg-accent',
                  )}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <span className={cn('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-bold' : 'font-medium')}>{c.tenant_name}</span>
                    {c.unread && <ToneBadge tone="warning">Nova</ToneBadge>}
                    <span className="text-[0.68rem] text-muted-foreground tabular-nums">{fmtTime(c.last_message_at)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{c.owner_name_snapshot}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{c.last_message_preview || '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const conversation = (
    <div className="flex h-full min-h-0 flex-col">
      {!selected ? (
        <EmptyState compact className="h-full" icon={<LifeBuoy />} title="Selecione uma conversa para ver as mensagens." />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b p-3">
            {isMobile && (
              <Button variant="ghost" size="icon-sm" onClick={() => setSheetOpen(false)} aria-label="Voltar para a lista">
                <ArrowLeft />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/platform/tenants/${selected.tenant_id}`} className="block truncate text-sm font-bold underline-offset-4 hover:underline">
                {selected.tenant_name}
              </Link>
              <span className="text-xs text-muted-foreground">{selected.owner_name_snapshot}</span>
            </div>
            <ToneBadge tone={selected.status === 'open' ? 'success' : 'muted'}>{selected.status === 'open' ? 'Aberta' : 'Resolvida'}</ToneBadge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleToggleStatus} aria-label={selected.status === 'open' ? 'Marcar como resolvida' : 'Reabrir conversa'}>
                  {selected.status === 'open' ? <CheckCircle2 /> : <RotateCcw />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{selected.status === 'open' ? 'Marcar como resolvida' : 'Reabrir conversa'}</TooltipContent>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Mensagens">
            {loadingMessages && messages.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map((i) => <Skeleton key={i} className={cn('h-12 w-2/3', i % 2 ? 'ml-auto' : '')} />)}
              </div>
            ) : messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem mensagens ainda.</p>
            ) : (
              groupByDay(messages).map((group) => (
                <div key={group.day} className="mb-3">
                  <div className="my-2 flex items-center gap-2 text-[0.68rem] font-semibold text-muted-foreground uppercase">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    {group.day}
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {group.items.map((m) => (
                      <li
                        key={m.id}
                        className={cn(
                          'max-w-[85%] rounded-xl px-3 py-2 text-sm sm:max-w-[70%]',
                          m.is_from_support ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted text-foreground',
                        )}
                      >
                        <span className="mb-0.5 flex items-baseline justify-between gap-3 text-[0.68rem] opacity-80">
                          <span>{m.sender_name_snapshot}</span>
                          <time dateTime={m.created_at}>{fmtTime(m.created_at)}</time>
                        </span>
                        <p className="m-0 break-words whitespace-pre-wrap">{m.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            <div ref={listEndRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendReply();
            }}
          >
            <Textarea
              aria-label="Responder"
              placeholder="Responder… (Enter envia, Shift+Enter quebra linha)"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              disabled={sending}
              rows={2}
              className="max-h-32 min-h-10 flex-1 resize-none"
            />
            <Button type="submit" size="icon" disabled={sending || !reply.trim()} aria-label="Enviar resposta">
              <Send />
            </Button>
          </form>
        </>
      )}
    </div>
  );

  const context = selected && (
    <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Contexto do terreiro">
      <div>
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Terreiro</p>
        <p className="mt-1 font-semibold">{selected.tenant_name}</p>
        <p className="text-xs text-muted-foreground">Responsável: {selected.owner_name_snapshot}</p>
        <p className="text-xs text-muted-foreground">Última mensagem: {fmtDateTime(selected.last_message_at)}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="justify-start">
          <Link href={`/platform/tenants/${selected.tenant_id}`}><Building2 /> Abrir o terreiro (360)</Link>
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={enterAsAdmin} disabled={impersonating}>
          <LogIn /> Entrar como admin
        </Button>
        <Button asChild variant="outline" size="sm" className="justify-start">
          <Link href={`/platform/tenants/${selected.tenant_id}?tab=auditoria`}>Auditoria do terreiro</Link>
        </Button>
      </div>
      <p className="mt-auto text-xs text-muted-foreground">
        Conversas nascem no chat do painel do terreiro; a plataforma responde por aqui.
      </p>
    </aside>
  );

  return (
    <>
      <PageHeader
        title="Suporte"
        subtitle="Conversas de suporte de todos os terreiros."
        actions={
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList aria-label="Filtrar por status">
              <TabsTrigger value="open">Abertas</TabsTrigger>
              <TabsTrigger value="resolved">Resolvidas</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      <div className={cn('grid h-[calc(100svh-14rem)] min-h-[26rem] gap-3', isMobile ? 'grid-cols-1' : isDesktop ? 'grid-cols-[20rem_1fr_17rem]' : 'grid-cols-[18rem_1fr]')}>
        <section className="min-h-0 overflow-hidden rounded-xl border bg-card" aria-label="Lista de conversas">{list}</section>
        {!isMobile && <section className="min-h-0 overflow-hidden rounded-xl border bg-card" aria-label="Conversa">{conversation}</section>}
        {isDesktop && <section className="min-h-0 overflow-hidden rounded-xl border bg-card">{context ?? <EmptyState compact className="h-full" title="Contexto do terreiro" description="Aparece ao selecionar uma conversa." />}</section>}
      </div>

      {isMobile && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-full" showCloseButton={false}>
            <SheetHeader className="sr-only">
              <SheetTitle>Conversa de suporte</SheetTitle>
              <SheetDescription>{selected?.tenant_name ?? ''}</SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">{conversation}</div>
              {selected && (
                <div className="flex gap-2 border-t p-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/platform/tenants/${selected.tenant_id}`}><Building2 /> Terreiro</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={enterAsAdmin} disabled={impersonating}>
                    <LogIn /> Entrar como admin
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

export default function PlatformSuportePage() {
  return (
    <PlatformLayout title="Suporte">
      <SuportePageContent />
    </PlatformLayout>
  );
}
