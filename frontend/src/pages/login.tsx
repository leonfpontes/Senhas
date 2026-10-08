/**
 * /login — entrada de admins, operadores, médiuns (Área do Médium) e da plataforma.
 * Sessão em cookie HttpOnly; o frontend só guarda `user` (com as `areas`) no localStorage (ver
 * CLAUDE.md). Para onde vai depois decide `completeLogin` pelas áreas da conta (AM-04).
 * Mesmo e-mail com conta em mais de um terreiro (AM-05): se a senha abrir mais de uma, o login
 * devolve `choose_account` (sem cookies) e a tela pergunta "Em qual terreiro você quer entrar?";
 * o cartão tocado chama `/auth/login/select` e segue o mesmo `completeLogin`.
 */
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, CircleCheck, Info, Loader2, Mail, TriangleAlert, CircleAlert } from 'lucide-react';
import { AccountChoiceList, AuthShell, AUTH_INPUT, AUTH_LINK } from '@/components/auth';
import { cn } from '@/lib/utils';
import { TextField, PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, extractApiErrorMessage, type ApiRequestConfig } from '@/services/api_client';
import {
  completeLogin,
  isAccountChoice,
  selectAccount,
  type AccountChoice,
  type SessionUser,
} from '@/services/authSession';
import { SouMediumPassos } from '@/components/landing/SouMedium';
import { AREA_MEDIUM_DIVULGADA, SOU_MEDIUM_LABEL } from '@/constants/areaMedium';

type Notice = { key: string; variant: 'success' | 'info'; text: string };

const SELECTION_EXPIRED = 'O tempo para escolher o terreiro acabou. Entre de novo com seu e-mail e senha.';

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
  // Perfil do médium (AM-13): trocar a senha derruba todas as sessões; o novo e-mail vale depois do link.
  senha_alterada: { key: 'senha_alterada', variant: 'success', text: 'Senha alterada. Entre com a nova senha.' },
  email_confirmado: { key: 'email_confirmado', variant: 'success', text: 'E-mail confirmado. Entre com o novo e-mail.' },
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
  // AM-05: a senha abriu mais de um terreiro — passo de escolha (sem sessão aberta ainda).
  const [choice, setChoice] = useState<AccountChoice | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);

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

      if (isAccountChoice(response.data)) {
        setChoiceError(null);
        setChoice(response.data);
        return;
      }

      // "Lembrar-me" desmarcado: o backend devolve cookies de sessão (somem ao fechar o navegador).
      // `areas` (AM-02) decide a rota: painel, Área do Médium ou a escolha entre as duas (AM-04).
      completeLogin({ ...(response.data.user as SessionUser), areas: response.data.areas });
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

  // Escolha do terreiro (AM-05). Escolha recusada (expirou em 5 min, a conta deixou de estar
  // ativa) → volta ao e-mail e senha com o motivo; falha de rede → fica no passo para tentar de novo.
  const handleSelect = async (userId: string) => {
    if (!choice) return;
    setSelectingId(userId);
    setChoiceError(null);
    try {
      completeLogin(await selectAccount(choice, userId));
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { detail?: unknown } } } | undefined)?.response;
      if (res?.status === 401 || res?.status === 422) {
        const detail = res.data?.detail;
        const message =
          detail && typeof detail === 'object' ? (detail as { message?: unknown }).message : undefined;
        setChoice(null);
        setPassword('');
        setErrorCode(null);
        setError(typeof message === 'string' && message ? message : SELECTION_EXPIRED);
      } else {
        setChoiceError('Não foi possível entrar agora. Confira a internet e tente de novo.');
      }
    } finally {
      setSelectingId(null);
    }
  };

  const backToForm = () => {
    setChoice(null);
    setChoiceError(null);
    setPassword('');
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
      completeLogin({ ...(res.data.user as SessionUser), areas: res.data.areas });
    } catch (err) {
      setErrorCode(null);
      setError(extractApiErrorMessage(err, 'Não foi possível reativar a conta. Tente novamente.'));
    } finally {
      setReactivating(false);
    }
  };

  if (choice) {
    return (
      <AuthShell
        headTitle="Escolha o terreiro — GiraHub"
        title="Em qual terreiro você quer entrar?"
        subtitle="Seu e-mail tem acesso a mais de um terreiro. Escolha onde entrar agora."
        footer={
          <div className="text-center">
            <button
              type="button"
              onClick={backToForm}
              className={cn(
                'inline-flex min-h-12 items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                AUTH_LINK,
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Entrar com outro e-mail
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {choiceError ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{choiceError}</AlertDescription>
            </Alert>
          ) : null}
          <p className="truncate text-sm text-tinta-suave">
            Entrando como <strong className="font-semibold text-tinta">{email}</strong>
          </p>
          <AccountChoiceList options={choice.options} onSelect={handleSelect} selectingId={selectingId} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headTitle="Entrar — GiraHub"
      title="Que bom ver você de novo"
      subtitle="Entre para cuidar das giras, da porta e da casa."
      headerAction={{ label: 'Criar conta grátis', href: '/cadastro' }}
      footer={
        <div className="text-center">
          <p className="mb-3 text-sm text-tinta-suave">Ainda não tem conta? Comece grátis, sem cartão.</p>
          <Button
            asChild
            variant="outline"
            size="touch"
            className="w-full border-barro-600 bg-transparent font-bold text-barro-700 hover:bg-areia-100 hover:text-barro-700"
          >
            <Link href="/cadastro">Criar conta grátis</Link>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        {notices.map((n) => (
          <Alert key={n.key} variant={n.variant}>
            {n.variant === 'success' ? <CircleCheck aria-hidden /> : <Info aria-hidden />}
            <AlertDescription className="flex items-start justify-between gap-3">
              <span>{n.text}</span>
              <button
                type="button"
                onClick={() => dismissNotice(n.key)}
                className="-my-2 inline-flex min-h-10 shrink-0 items-center rounded-md px-1 text-xs font-semibold underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Fechar
              </button>
            </AlertDescription>
          </Alert>
        ))}

        {error && errorCode === 'TENANT_DEACTIVATED' ? (
          <Alert variant="warning" role="alert">
            <TriangleAlert aria-hidden />
            <AlertDescription className="flex flex-col gap-3">
              <span>{error}</span>
              <Button
                type="button"
                size="touch"
                className="w-full font-bold sm:w-auto"
                onClick={handleReactivate}
                disabled={reactivating}
                aria-busy={reactivating}
              >
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
          inputClassName={AUTH_INPUT}
        />

        <PasswordField
          label="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          inputClassName={AUTH_INPUT}
        />

        <div className="-my-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex min-h-12 items-center gap-2.5">
            <Checkbox
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={(v) => setRememberMe(v === true)}
              className="size-5 bg-white"
            />
            <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal">
              Lembrar-me
            </Label>
          </div>
          <Link
            href="/forgot-password"
            className={cn('inline-flex min-h-12 items-center rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', AUTH_LINK)}
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" size="touch" className="w-full font-bold" disabled={loading || !email || !password}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>

        <ConviteDaCasa />
      </form>
    </AuthShell>
  );
}

/**
 * "Recebi um convite da casa" (AM-04): o médium não cria conta aqui — o primeiro acesso começa
 * pelo link do convite que a casa mandou (WhatsApp ou e-mail, AM-03). Depois disso, entra aqui.
 * Com a chave de divulgação da Área (AM-24, `AREA_MEDIUM_DIVULGADA`) o link vira "Sou médium /
 * Recebi um convite" e abre a explicação completa (os mesmos passos do topo da landing).
 */
function ConviteDaCasa() {
  const [aberto, setAberto] = useState(false);
  const divulgada = AREA_MEDIUM_DIVULGADA;
  return (
    <div className="-mt-2 flex flex-col">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="convite-da-casa"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'inline-flex min-h-12 items-center gap-2 self-center rounded-md text-center text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          AUTH_LINK,
        )}
      >
        <Mail className="size-4 shrink-0" aria-hidden />
        {divulgada ? SOU_MEDIUM_LABEL : 'Recebi um convite da casa'}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>
      {aberto &&
        (divulgada ? (
          <div id="convite-da-casa" className="rounded-xl bg-areia-100 px-4 py-3">
            <SouMediumPassos entrar="Já criou o seu login? É só entrar acima com o seu e-mail e senha." />
          </div>
        ) : (
          <div id="convite-da-casa" className="rounded-xl bg-areia-100 px-4 py-3 text-sm text-tinta">
            <p className="font-bold">O primeiro acesso começa pelo link da casa.</p>
            <p className="mt-1 text-tinta-suave">
              Toque no link do convite que a casa mandou no WhatsApp ou no e-mail e crie sua senha de acesso. Depois,
              é só entrar aqui com seu e-mail e essa senha.
            </p>
          </div>
        ))}
    </div>
  );
}
