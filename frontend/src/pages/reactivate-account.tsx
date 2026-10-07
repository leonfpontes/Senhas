/**
 * /reactivate-account — volta com um terreiro desativado pelo próprio admin
 * (fluxo "Desativar conta" em /admin/profile; link do e-mail de desativação). O e-mail pode
 * vir na query (`?email=`), lido só depois de `router.isReady`.
 *
 * Mostra o resultado real (senha errada, conta que não está desativada) e, ao reativar,
 * já entra — o backend abre a sessão com os mesmos cookies do login. Quem chega pelo /login
 * nem passa por aqui: lá o botão "Reativar e entrar" usa a senha já digitada.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { AuthShell, AUTH_INPUT } from '@/components/auth';
import { TextField, PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, extractApiErrorMessage, ApiRequestConfig } from '@/services/api_client';
import { completeLogin, type SessionUser } from '@/services/authSession';

export default function ReactivateAccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await apiClient.post(
        '/api/v1/auth/reactivate-account',
        { email, password },
        // 401 aqui é "senha errada", não sessão expirada — não deslogar/redirecionar.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      completeLogin(res.data.user as SessionUser);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível reativar a conta. Tente novamente.'));
      setLoading(false);
    }
  };

  return (
    <AuthShell headTitle="Reativar conta — GiraHub" title="Reativar conta e terreiro">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <p className="text-base text-tinta-suave">
          Informe o e-mail e a senha da conta que você desativou. Giras, senhas, médiuns e
          associados foram preservados; a assinatura volta no plano gratuito.
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
          inputClassName={AUTH_INPUT}
          inputMode="email"
        />

        <PasswordField
          label="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          inputClassName={AUTH_INPUT}
        />

        <Button
          type="submit"
          size="touch"
          className="w-full font-bold"
          disabled={loading || !email || !password}
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {loading ? 'Reativando…' : 'Reativar conta'}
        </Button>

        <Button asChild variant="ghost" size="touch" className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta">
          <Link href="/login">Voltar para entrar</Link>
        </Button>
      </form>
    </AuthShell>
  );
}
