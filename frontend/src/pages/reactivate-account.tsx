/**
 * /reactivate-account — volta com um terreiro desativado pelo próprio admin
 * (fluxo "Desativar conta" em /admin/profile). O e-mail pode vir na query (`?email=`),
 * lido só depois de `router.isReady`.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth';
import { TextField, PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, extractApiErrorMessage, ApiRequestConfig } from '@/services/api_client';

export default function ReactivateAccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.email;
    if (typeof q === 'string' && q) setEmail((prev) => prev || q);
  }, [router.isReady, router.query.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.post(
        '/api/v1/auth/reactivate-account',
        { email, password },
        // A resposta é sempre a mesma mensagem genérica — não é 401 de sessão.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      setSuccess(true);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível processar a solicitação. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell headTitle="Reativar conta — GiraHub" title="Reativar conta e terreiro">
      {success ? (
        <div className="flex flex-col gap-4">
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription>
              Se o e-mail e a senha estiverem corretos, sua conta foi reativada. Entre para continuar.
            </AlertDescription>
          </Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/login?reactivated=1">Entrar</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted-foreground">
            Informe o e-mail e a senha da conta que você desativou. Giras, senhas, médiuns e associados
            foram preservados; a assinatura volta no plano gratuito.
          </p>

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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

          <Button type="submit" size="lg" className="w-full" disabled={loading || !email || !password}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {loading ? 'Reativando…' : 'Reativar conta'}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Voltar para entrar</Link>
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
