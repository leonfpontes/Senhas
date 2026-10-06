/**
 * /login — entrada de admins e operadores (e da plataforma).
 * Sessão em cookie HttpOnly; o frontend só guarda `user` no localStorage (ver CLAUDE.md).
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { CircleCheck, Info, Loader2, TriangleAlert, CircleAlert } from 'lucide-react';
import { AuthShell } from '@/components/auth';
import { TextField, PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import { completeLogin, type SessionUser } from '@/services/authSession';

type Notice = { key: string; variant: 'success' | 'info'; text: string };

const QUERY_NOTICES: Record<string, Notice> = {
  account_deleted: {
    key: 'account_deleted',
    variant: 'success',
    text: 'Sua conta foi excluída. Seus dados pessoais foram removidos conforme a LGPD.',
  },
  account_deactivated: {
    key: 'account_deactivated',
    variant: 'info',
    text: 'Conta e terreiro desativados. Seus dados foram preservados — para voltar, entre com e-mail e senha e toque em "Reativar e entrar".',
  },
  reset: { key: 'reset', variant: 'success', text: 'Senha redefinida. Entre com a nova senha.' },
  sessions_ended: {
    key: 'sessions_ended',
    variant: 'info',
    text: 'Todas as sessões foram encerradas por segurança. Entre novamente.',
  },
  reactivated: { key: 'reactivated', variant: 'success', text: 'Conta reativada! Entre para continuar.' },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (!router.isReady) return;
    const active = Object.values(QUERY_NOTICES).filter((n) => router.query[n.key] === '1');
    setNotices(active);
  }, [router.isReady, router.query]);

  const dismissNotice = (key: string) => setNotices((prev) => prev.filter((n) => n.key !== key));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const response = await apiClient.post('/api/v1/auth/login', {
        email,
        password,
        remember_me: rememberMe,
      });

      // "Lembrar-me" desmarcado: o backend devolve cookies de sessão (somem ao fechar o navegador).
      completeLogin(response.data.user as SessionUser);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown; message?: unknown } } } | undefined;
      const detail = e?.response?.data?.detail;
      const code = detail && typeof detail === 'object' ? (detail as { error_code?: string }).error_code : null;
      const message =
        (detail && typeof detail === 'object' ? (detail as { message?: string }).message : detail) ||
        e?.response?.data?.message ||
        'E-mail ou senha incorretos. Tente novamente.';
      if (code) setErrorCode(code);
      setError(message as string);
    } finally {
      setLoading(false);
    }
  };

  // Conta desativada pelo próprio admin: a senha já foi conferida no login — reativa com os
  // mesmos dados e já entra, sem pedir a senha de novo.
  const handleReactivate = async () => {
    setReactivating(true);
    try {
      const res = await apiClient.post(
        '/api/v1/auth/reactivate-account',
        { email, password, remember_me: rememberMe },
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      completeLogin(res.data.user as SessionUser);
    } catch (err) {
      setErrorCode(null);
      setError(extractApiErrorMessage(err, 'Não foi possível reativar a conta. Tente novamente.'));
    } finally {
      setReactivating(false);
    }
  };

  return (
    <AuthShell
      headTitle="Entrar — GiraHub"
      title="Acesse sua conta"
      footer={
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">Ainda não tem conta?</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/cadastro">Criar conta grátis</Link>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {notices.map((n) => (
          <Alert key={n.key} variant={n.variant}>
            {n.variant === 'success' ? <CircleCheck aria-hidden /> : <Info aria-hidden />}
            <AlertDescription className="flex items-start justify-between gap-3">
              <span>{n.text}</span>
              <button
                type="button"
                onClick={() => dismissNotice(n.key)}
                className="shrink-0 text-xs font-semibold underline underline-offset-2"
              >
                Fechar
              </button>
            </AlertDescription>
          </Alert>
        ))}

        {error && errorCode === 'TENANT_DEACTIVATED' ? (
          <Alert variant="warning" role="alert">
            <TriangleAlert aria-hidden />
            <AlertDescription className="flex flex-col gap-2">
              <span>{error}</span>
              <Button type="button" size="sm" onClick={handleReactivate} disabled={reactivating} aria-busy={reactivating}>
                {reactivating ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {reactivating ? 'Reativando…' : 'Reativar e entrar'}
              </Button>
            </AlertDescription>
          </Alert>
        ) : error ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
        />

        <PasswordField
          label="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(v) => setRememberMe(v === true)}
          />
          <Label htmlFor="remember-me" className="cursor-pointer font-normal">
            Lembrar-me
          </Label>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading || !email || !password}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>

        <div className="text-center">
          <Link href="/forgot-password" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
