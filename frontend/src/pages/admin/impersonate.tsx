/**
 * Página de entrada da impersonação (superadmin → usuário do terreiro).
 *
 * Recebe `token`, `user` e `tenant` pela query string **ou pelo fragmento** (`#token=…&user=…&tenant=…`).
 * O fragmento nunca sai do navegador (não vai em logs de servidor nem no Referer), por isso é a
 * forma preferida; a query string continua aceita por compatibilidade com links já emitidos.
 *
 * Os dados ficam no `sessionStorage` (isolados do `localStorage` do superadmin) e a página
 * recarrega inteira em /admin/dashboard para os providers remontarem com o token novo.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ImpersonationParams {
  token: string;
  user: string;
  tenant: string;
}

/** Lê os parâmetros do fragmento (`#token=…`) e, no que faltar, da query string. */
export function readImpersonationParams(
  query: Record<string, string | string[] | undefined>,
  hash: string,
): ImpersonationParams | null {
  const fromHash = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const pick = (key: keyof ImpersonationParams): string => {
    const h = fromHash.get(key);
    if (h) return h;
    const q = query[key];
    return (Array.isArray(q) ? q[0] : q) ?? '';
  };
  const token = pick('token');
  const user = pick('user');
  const tenant = pick('tenant');
  if (!token || !user || !tenant) return null;
  return { token, user, tenant };
}

export default function ImpersonateLandingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const params = readImpersonationParams(router.query, typeof window !== 'undefined' ? window.location.hash : '');
    if (!params) {
      setError('Parâmetros de impersonação inválidos');
      return;
    }

    try {
      const userInfo = JSON.parse(atob(params.user));
      const tenantInfo = JSON.parse(atob(params.tenant));

      sessionStorage.setItem('access_token', params.token);
      sessionStorage.setItem('user', JSON.stringify(userInfo));
      sessionStorage.setItem('impersonate_tenant', JSON.stringify(tenantInfo));
      sessionStorage.setItem('impersonating', 'true');

      // Recarga completa: os providers de _app.tsx (perfil, assinatura, permissões) precisam
      // remontar já com o token de impersonação; `router.replace` manteria o estado antigo.
      window.location.replace('/admin/dashboard');
    } catch {
      setError('Erro ao processar dados de impersonação');
    }
  }, [router.isReady, router.query]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Alert variant="destructive" className="max-w-md">
          <ShieldAlert aria-hidden />
          <AlertTitle>Não foi possível entrar como este usuário</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4" role="status">
      <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
      <p className="text-sm text-muted-foreground">Preparando a sessão…</p>
    </div>
  );
}
