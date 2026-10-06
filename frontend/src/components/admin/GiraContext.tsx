/**
 * GiraContext — a "gira de hoje" compartilhada por Dashboard, Giras, Senhas e Porta.
 *
 * Antes cada tela tinha o próprio select de gira e começava vazia. Agora o layout admin
 * monta um `GiraProvider` que carrega a lista uma vez (quando alguma tela pede), escolhe a
 * gira ativa mais próxima de agora e guarda a escolha do usuário em `sessionStorage`, então
 * trocar a gira na Porta pré-seleciona a mesma gira em Senhas.
 *
 * Sem provider (testes que mockam o layout) o hook devolve valores neutros e as telas
 * continuam carregando as giras por conta própria.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/services/api_client';

export interface GiraSummary {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim?: string | null;
  is_active: boolean;
  max_tickets?: number | null;
  release_start_at?: string | null;
  release_end_at?: string | null;
}

interface GiraContextValue {
  giras: GiraSummary[];
  loading: boolean;
  /** Lista já carregada ao menos uma vez. */
  loaded: boolean;
  /** Gira ativa mais próxima de agora (hoje, senão a próxima, senão a mais recente em 24h). */
  todayGira: GiraSummary | null;
  /** Gira escolhida pelo usuário (persistida na sessão) ou a de hoje. */
  selectedGiraId: string | null;
  setSelectedGiraId: (id: string | null) => void;
  /** Dispara o carregamento da lista (idempotente). */
  ensureLoaded: () => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = 'girahub:gira-selecionada';
const DAY_MS = 24 * 60 * 60 * 1000;

const noop = () => {};
const GiraContext = createContext<GiraContextValue>({
  giras: [],
  loading: false,
  loaded: false,
  todayGira: null,
  selectedGiraId: null,
  setSelectedGiraId: noop,
  ensureLoaded: noop,
  refresh: async () => {},
});

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Gira "de hoje": entre as ativas, a que acontece hoje (em andamento ou a próxima do dia);
 * senão a próxima no futuro; senão a mais recente das últimas 24h.
 */
export function pickTodayGira(giras: GiraSummary[], now: Date = new Date()): GiraSummary | null {
  const active = giras
    .filter((g) => g.is_active && !Number.isNaN(new Date(g.data_inicio).getTime()))
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
  if (active.length === 0) return null;

  const today = active.filter((g) => sameLocalDay(new Date(g.data_inicio), now));
  if (today.length > 0) {
    // Em andamento (começou há menos de 6h) ou a próxima do dia; senão a última de hoje.
    const current = today.find((g) => new Date(g.data_inicio).getTime() >= now.getTime() - 6 * 60 * 60 * 1000);
    return current ?? today[today.length - 1];
  }

  const upcoming = active.find((g) => new Date(g.data_inicio).getTime() > now.getTime());
  if (upcoming) return upcoming;

  const recent = [...active].reverse().find((g) => now.getTime() - new Date(g.data_inicio).getTime() <= DAY_MS);
  return recent ?? null;
}

/** Rótulo curto para selects: "Gira de Caboclos · qui 12/03 20:00". */
export function giraLabel(g: Pick<GiraSummary, 'nome' | 'data_inicio'>): string {
  const d = new Date(g.data_inicio);
  if (Number.isNaN(d.getTime())) return g.nome;
  const date = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${g.nome} · ${date} ${time}`;
}

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage bloqueado — segue só na memória */
  }
}

export function GiraProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const [giras, setGiras] = useState<GiraSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    setStored(readStored());
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const res = await apiClient.get('/api/v1/admin/giras');
      const data = res?.data;
      const list: GiraSummary[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setGiras(list.filter((g) => g && typeof g.id === 'string'));
    } catch {
      /* a tela mostra o próprio erro ao carregar as giras */
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [enabled]);

  const ensureLoaded = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    requested.current = true;
    await load();
  }, [load]);

  const todayGira = useMemo(() => pickTodayGira(giras), [giras]);

  const selectedGiraId = useMemo(() => {
    if (stored && (!loaded || giras.some((g) => g.id === stored))) return stored;
    return todayGira?.id ?? null;
  }, [stored, loaded, giras, todayGira]);

  const setSelectedGiraId = useCallback((id: string | null) => {
    setStored(id);
    writeStored(id);
  }, []);

  const value = useMemo<GiraContextValue>(
    () => ({ giras, loading, loaded, todayGira, selectedGiraId, setSelectedGiraId, ensureLoaded, refresh }),
    [giras, loading, loaded, todayGira, selectedGiraId, setSelectedGiraId, ensureLoaded, refresh],
  );

  return <GiraContext.Provider value={value}>{children}</GiraContext.Provider>;
}

/**
 * Acesso ao contexto. Por padrão dispara o carregamento da lista na primeira montagem
 * (`load: false` só lê o que já estiver carregado — ex.: barra inferior).
 */
export function useGiraContext(options: { load?: boolean } = {}): GiraContextValue {
  const ctx = useContext(GiraContext);
  const { load = true } = options;
  const { ensureLoaded } = ctx;
  useEffect(() => {
    if (load) ensureLoaded();
  }, [load, ensureLoaded]);
  return ctx;
}

export default GiraContext;
