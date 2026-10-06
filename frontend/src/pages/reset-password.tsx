/**
 * /reset-password?token=… — define a nova senha a partir do link do e-mail.
 * Regra de senha visível antes de digitar (`constants/passwordPolicy.ts`, igual ao backend).
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { AuthShell, PasswordRules } from '@/components/auth';
import { PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/services/api_client';
import { passwordError } from '@/constants/passwordPolicy';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Só lê a query depois da hidratação do router.
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;

  useEffect(() => {
    if (router.isReady && !token) {
      router.replace('/forgot-password');
    }
  }, [router.isReady, token, router]);

  const passwordMessage = passwordError(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = !passwordMessage && newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    setError(null);
    setErrorCode(null);
    if (!canSubmit) return;

    setLoading(true);
    try {
      await apiClient.post('/api/v1/auth/reset-password', { token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown; errors?: unknown } } } | undefined;
      const detail = e?.response?.data?.detail;
      const code = detail && typeof detail === 'object' ? (detail as { error_code?: string }).error_code : null;
      const message =
        detail && typeof detail === 'object'
          ? (detail as { message?: string }).message || 'Não foi possível redefinir a senha.'
          : (typeof detail === 'string' && detail) || 'Não foi possível redefinir a senha.';
      const validationErrors = e?.response?.data?.errors;
      if (code) setErrorCode(code);
      setError(Array.isArray(validationErrors) ? validationErrors.join(', ') : message);
    } finally {
      setLoading(false);
    }
  };

  if (!router.isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Skeleton className="h-72 w-full max-w-md" />
      </main>
    );
  }

  return (
    <AuthShell headTitle="Redefinir senha — GiraHub" title="Criar nova senha">
      {success ? (
        <div className="flex flex-col gap-4">
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription>Senha redefinida. Agora é só entrar com a nova senha.</AlertDescription>
          </Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/login?reset=1">Entrar</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && errorCode === 'EXPIRED_TOKEN' ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription className="block">
                Este link expirou.{' '}
                <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
                  Peça um novo link
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : error ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              required
              autoComplete="new-password"
              error={touched.password && passwordMessage ? passwordMessage : undefined}
            />
            <PasswordRules value={newPassword} />
          </div>

          <PasswordField
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            required
            autoComplete="new-password"
            error={touched.confirm && mismatch ? 'As senhas não são iguais.' : undefined}
          />

          <Button type="submit" size="lg" className="w-full" disabled={loading || !newPassword || !confirmPassword}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {loading ? 'Salvando…' : 'Redefinir senha'}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Voltar para entrar</Link>
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
