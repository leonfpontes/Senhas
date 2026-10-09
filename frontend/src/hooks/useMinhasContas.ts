/**
 * Outras contas do mesmo e-mail (outros terreiros) para o "Trocar de terreiro" dos menus.
 *
 * Busca `GET /api/v1/auth/minhas-contas` uma vez por usuário e guarda na memória da página (a
 * troca recarrega a página inteira, então o cache nunca fica com a conta errada). Impersonando
 * não busca (os cookies do navegador são do super admin; o backend também devolve vazio).
 * Qualquer erro vale como lista vazia: a opção simplesmente não aparece.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api_client';
import { MINHAS_CONTAS_PATH, type MinhaConta } from '@/services/authSession';

const cache = new Map<string, Promise<MinhaConta[]>>();

/** Só para testes. */
export function resetMinhasContasCache(): void {
  cache.clear();
}

function impersonating(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem('impersonating'));
  } catch {
    return false;
  }
}

function load(userId: string): Promise<MinhaConta[]> {
  let p = cache.get(userId);
  if (!p) {
    p = apiClient
      .get(MINHAS_CONTAS_PATH)
      .then((res) => (Array.isArray(res?.data) ? (res.data as MinhaConta[]) : []))
      .catch(() => [] as MinhaConta[]);
    cache.set(userId, p);
  }
  return p;
}

export function useMinhasContas(userId: string | null | undefined, enabled = true): MinhaConta[] {
  const [contas, setContas] = useState<MinhaConta[]>([]);
  useEffect(() => {
    if (!userId || !enabled || typeof window === 'undefined' || impersonating()) {
      setContas([]);
      return;
    }
    let vivo = true;
    void load(userId).then((lista) => {
      if (vivo) setContas(lista);
    });
    return () => {
      vivo = false;
    };
  }, [userId, enabled]);
  return contas;
}
