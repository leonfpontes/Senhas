/**
 * /forgot-password — pede o link de redefinição por e-mail.
 * Nunca revela se o e-mail existe: a tela de sucesso é sempre a mesma.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, Loader2 } from 'lucide-react';
import { AuthShell, AUTH_INPUT } from '@/components/auth';
import { TextField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/services/api_client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/api/v1/auth/forgot-password', { email });
    } catch {
      // resposta igual para e-mail existente ou não
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AuthShell headTitle="Esqueci minha senha — GiraHub" title="Recuperar acesso">
      {submitted ? (
        <div className="flex flex-col gap-6">
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden />
            <AlertDescription>
              Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha em breve.
              Confira também a caixa de spam.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" size="touch" className="w-full">
            <Link href="/login">
              <ArrowLeft aria-hidden /> Voltar para entrar
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <p className="text-base text-tinta-suave">
            Informe o e-mail da sua conta e enviaremos um link para redefinir a senha.
          </p>
          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputClassName={AUTH_INPUT}
            inputMode="email"
            autoFocus
          />
          <Button type="submit" size="touch" className="w-full font-bold" disabled={loading || !email}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {loading ? 'Enviando…' : 'Enviar link'}
          </Button>
          <Button asChild variant="ghost" size="touch" className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta">
            <Link href="/login">
              <ArrowLeft aria-hidden /> Voltar para entrar
            </Link>
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
