/**
 * /confirmar-email/[token] — confirmação do novo e-mail de acesso (AM-13, Perfil do médium).
 *
 * O link chega só no endereço NOVO. A página pede um toque em "Confirmar meu novo e-mail" antes de
 * chamar `POST /api/v1/public/email/confirmar` — leitor de link de e-mail que abre a página não
 * gasta o token. Deu certo → "Pronto!" com o novo e-mail e "Entrar". Link vencido, usado ou
 * trocado → resposta genérica do servidor ("Este link não vale mais...").
 *
 * Identidade das telas de conta (`AuthShell`, `.auth-terra`), como o convite e o reset de senha.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CircleAlert, CircleCheck, Loader2, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { erroDaApi } from '@/components/medium/perfil/perfil';

// Rota pública: 4xx aqui é regra de negócio, nunca "sessão expirada".
const PUBLICO: ApiRequestConfig = { skipAutoLogout: true };

interface Confirmado {
  email: string;
  terreiro_nome?: string | null;
}

export default function ConfirmarEmailPage() {
  const router = useRouter();
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;
  const [loading, setLoading] = useState(false);
  const [feito, setFeito] = useState<Confirmado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    if (!token) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await apiClient.post<Confirmado>('/api/v1/public/email/confirmar', { token }, PUBLICO);
      setFeito(res.data);
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível confirmar agora. Tente de novo em instantes.').message);
    } finally {
      setLoading(false);
    }
  };

  if (!router.isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-areia-50 px-4">
        <Skeleton className="h-72 w-full max-w-md" />
      </main>
    );
  }

  return (
    <AuthShell
      headTitle="Confirmar novo e-mail — GiraHub"
      title={feito ? 'Pronto!' : 'Confirmar novo e-mail'}
      subtitle={
        feito
          ? undefined
          : 'Toque no botão para usar este e-mail para entrar na sua conta.'
      }
    >
      {feito ? (
        <div className="flex flex-col gap-6">
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription className="block">
              Seu e-mail de acesso{feito.terreiro_nome ? ` em ${feito.terreiro_nome}` : ''} agora é{' '}
              <strong className="break-all">{feito.email}</strong>. Use este e-mail para entrar.
            </AlertDescription>
          </Alert>
          <Button asChild size="touch" className="w-full font-bold">
            <Link href="/login?email_confirmado=1">Entrar</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {erro && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="touch"
            className="w-full font-bold"
            onClick={() => void confirmar()}
            disabled={loading || !token}
            data-testid="confirmar-email"
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <MailCheck aria-hidden />}
            {loading ? 'Confirmando…' : 'Confirmar meu novo e-mail'}
          </Button>
          <p className="text-sm text-tinta-suave">
            Não pediu esta troca? É só fechar esta página: nada muda na sua conta.
          </p>
          <Button asChild variant="ghost" size="touch" className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta">
            <Link href="/login">Ir para o login</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
