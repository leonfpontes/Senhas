/**
 * MediumProvider — quem sou eu na Área do Médium (AM-06): `GET /api/v1/medium/me` (nome,
 * terreiro, marca, áreas). Montado no `_app` e só busca nas rotas `/medium/*` e quando a conta
 * tem a Área (`areas.medium`) — fora dela nada é chamado. As cores do terreiro vão para o
 * <html> via `applyBrand` (+ `applyTerraBrandText` para o `text-brand` na paleta terra).
 *
 * 403/402 (área desligada, plano, assinatura) viram `indisponivel`: a tela mostra o aviso
 * neutro, sem oferta de upgrade ao médium. 401 segue o fluxo global do api_client (login).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api_client';
import { applyBrand, applyTerraBrandText } from '@/lib/brand';
import { hasMediumArea, isMediumRoute, readStoredUser } from '@/lib/areas';
import { useProfile, type UserAreas } from '@/hooks/useProfile';
import { useCurrentPathname } from '@/hooks/useAdminDataEnabled';

export interface MediumMarca {
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  font_color?: string | null;
}

export interface MediumMe {
  nome: string;
  foto_url?: string | null;
  terreiro: { id: string; nome: string; slug: string };
  marca: MediumMarca;
  areas: UserAreas;
  modulos: string[];
}

export type MediumStatus = 'idle' | 'loading' | 'ok' | 'indisponivel' | 'erro';

interface MediumContextValue {
  me: MediumMe | null;
  status: MediumStatus;
  refresh: () => void;
}

const MediumContext = createContext<MediumContextValue>({
  me: null,
  status: 'idle',
  refresh: () => {},
});

/** Cores do terreiro na Área (e na escolha de área). */
export function applyMediumBrand(marca: MediumMarca): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  applyBrand(root, {
    primary: marca.primary_color,
    secondary: marca.secondary_color,
    font: marca.font_color || '#FFFFFF',
  });
  applyTerraBrandText(root, marca.primary_color);
}

export function MediumProvider({ children }: { children: React.ReactNode }) {
  const pathname = useCurrentPathname();
  const { profile } = useProfile();
  const user = profile ?? readStoredUser();
  const enabled = pathname !== null && isMediumRoute(pathname) && hasMediumArea(user);
  const [me, setMe] = useState<MediumMe | null>(null);
  const [status, setStatus] = useState<MediumStatus>('idle');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setStatus((s) => (s === 'ok' ? s : 'loading'));
    apiClient
      .get<MediumMe>('/api/v1/medium/me')
      .then((res) => {
        if (!alive) return;
        setMe(res.data);
        setStatus('ok');
        applyMediumBrand(res.data.marca);
      })
      .catch((err: { status?: number }) => {
        if (!alive) return;
        if (err?.status === 403 || err?.status === 402) {
          setMe(null);
          setStatus('indisponivel');
        } else if (err?.status !== 401) {
          setStatus((s) => (s === 'ok' ? s : 'erro'));
        }
      });
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ me, status, refresh }), [me, status, refresh]);
  return <MediumContext.Provider value={value}>{children}</MediumContext.Provider>;
}

export function useMedium(): MediumContextValue {
  return useContext(MediumContext);
}
