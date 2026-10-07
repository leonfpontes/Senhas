/**
 * /convite/[token] — convite da casa para a Área do Médium (AM-03).
 *
 * Passo 1 ("Convite da casa"): logo e nome do terreiro em destaque, o e-mail de acesso
 * mascarado e a promessa de privacidade. Passo 2 ("Crie sua senha de acesso"): senha com
 * mostrar/ocultar, regra visível, caixa de consentimento + "Ler o termo". Quem já tem conta
 * do painel com o mesmo e-mail entra com a senha que já usa. Deu certo → já entra na Área
 * (`/medium`) com a sessão aberta pelo backend (cookies).
 *
 * Identidade das telas de conta (`AuthShell`, `.auth-terra`). Textos do glossário da Área
 * (docs/estudo-ux-area-do-medium.md §6): "Convite da casa", "Crie sua senha de acesso".
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, CircleAlert, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { AuthShell, AUTH_INPUT, AUTH_LINK, PasswordRules } from '@/components/auth';
import { PasswordField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { passwordError } from '@/constants/passwordPolicy';
import {
  AREA_MEDIUM_HOME,
  TERMO_AREA_RODAPE,
  consentimentoAreaLabel,
  termoAreaParagrafos,
} from '@/constants/areaMedium';

export interface ConvitePublico {
  terreiro: { nome: string; slug: string };
  marca: { logo_url?: string | null; primary_color: string; secondary_color: string; font_color?: string | null };
  medium_primeiro_nome: string;
  email_mascarado: string;
  conta_existente: boolean;
  expira_em: string;
  consentimento_versao: string;
}

interface AceiteResposta {
  redirect: string;
  user: Record<string, unknown>;
}

// Rota pública: 4xx aqui é regra de negócio, nunca "sessão expirada".
const PUBLICO: ApiRequestConfig = { skipAutoLogout: true };

const ERRO_GENERICO = 'Não foi possível ativar agora. Tente de novo em instantes.';

export function mensagemDoErro(err: unknown): { code?: string; message: string } {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> } } | undefined;
  const data = e?.response?.data;
  if (e?.response?.status === 429) return { code: 'RATE_LIMIT', message: 'Muitas tentativas. Espere um minuto e tente de novo.' };
  const detail = data?.detail;
  if (detail && typeof detail === 'object') {
    const d = detail as { error_code?: string; message?: string };
    return { code: d.error_code, message: d.message || ERRO_GENERICO };
  }
  if (typeof detail === 'string') return { message: detail };
  if (data && typeof data.message === 'string') {
    const erros = (data.details as { errors?: unknown } | null | undefined)?.errors;
    return {
      code: typeof data.error_code === 'string' ? data.error_code : undefined,
      message: Array.isArray(erros) && erros.length ? `${data.message}: ${erros.join(', ')}` : data.message,
    };
  }
  return { message: ERRO_GENERICO };
}

function LogoDaCasa({ convite }: { convite: ConvitePublico }) {
  const [falhou, setFalhou] = useState(false);
  const logo = convite.marca.logo_url;
  const inicial = convite.terreiro.nome.trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {logo && !falhou ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo do terreiro vem de host não allow-listado; onError cai na inicial
        <img
          src={logo}
          alt={`Logo de ${convite.terreiro.nome}`}
          width={96}
          height={96}
          className="size-24 rounded-full border border-areia-200 bg-white object-cover shadow-sm"
          onError={() => setFalhou(true)}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-24 items-center justify-center rounded-full bg-cafe-950 font-display text-4xl font-bold text-white"
        >
          {inicial || '•'}
        </span>
      )}
      <p className="font-display text-2xl leading-tight font-bold text-tinta">{convite.terreiro.nome}</p>
    </div>
  );
}

function TermoDialog({ open, onOpenChange, casa }: { open: boolean; onOpenChange: (v: boolean) => void; casa: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-terra bg-white text-tinta sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Termo de uso dos seus dados</DialogTitle>
          <DialogDescription className="sr-only">Como a casa usa os seus dados na Área do Médium.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-base leading-relaxed text-tinta">
          {termoAreaParagrafos(casa).map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="text-sm text-tinta-suave">{TERMO_AREA_RODAPE}</p>
        </div>
        <DialogFooter>
          <Button type="button" size="touch" className="w-full font-bold" onClick={() => onOpenChange(false)}>
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConvitePage() {
  const router = useRouter();
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;

  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [passo, setPasso] = useState<'convite' | 'senha'>('convite');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [termoAberto, setTermoAberto] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setErroCarga('Este convite não vale mais. Peça um novo convite à casa.');
      return;
    }
    let ativo = true;
    apiClient
      .get<ConvitePublico>(`/api/v1/public/convite/${encodeURIComponent(token)}`, PUBLICO)
      .then((res) => {
        if (ativo) setConvite(res.data);
      })
      .catch((err) => {
        if (ativo) setErroCarga(mensagemDoErro(err).message);
      });
    return () => {
      ativo = false;
    };
  }, [router.isReady, token]);

  if (erroCarga) {
    return (
      <AuthShell headTitle="Convite da casa — GiraHub" title="Convite da casa">
        <div className="flex flex-col gap-6">
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{erroCarga}</AlertDescription>
          </Alert>
          <p className="text-sm text-tinta-suave">
            Já ativou seu acesso antes?{' '}
            <Link href="/login" className={AUTH_LINK}>
              Entrar
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  if (!convite) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-areia-50 px-4" aria-busy="true">
        <Skeleton className="h-96 w-full max-w-md" />
      </main>
    );
  }

  const casa = convite.terreiro.nome;
  const contaExistente = convite.conta_existente;
  const senhaMsg = contaExistente ? (senha ? null : 'Digite a sua senha.') : passwordError(senha);

  const ativar = async (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    setErro(null);
    if (senhaMsg || !aceite || !token) return;
    setEnviando(true);
    try {
      const res = await apiClient.post<AceiteResposta>(
        `/api/v1/public/convite/${encodeURIComponent(token)}/aceitar`,
        { senha, aceite_termo: true },
        PUBLICO,
      );
      // A sessão já veio nos cookies HttpOnly; o `user` fica no localStorage como no /login.
      try {
        localStorage.setItem('user', JSON.stringify(res.data.user));
      } catch {
        /* navegador sem localStorage: a sessão (cookies) basta */
      }
      window.location.href = res.data.redirect || AREA_MEDIUM_HOME;
    } catch (err) {
      setErro(mensagemDoErro(err).message);
      setEnviando(false);
    }
  };

  if (passo === 'convite') {
    const nome = convite.medium_primeiro_nome;
    return (
      <AuthShell
        headTitle="Convite da casa — GiraHub"
        title={nome ? `Olá, ${nome}! ${casa} convidou você.` : `${casa} convidou você.`}
        subtitle="A Área do Médium junta a agenda da casa, os avisos e a sua mensalidade num lugar só, no seu celular."
      >
        <div className="flex flex-col gap-6">
          <p className="text-center text-xs font-bold tracking-[0.2em] text-barro-700 uppercase">Convite da casa</p>
          <LogoDaCasa convite={convite} />
          <ul className="flex flex-col gap-4 rounded-2xl bg-areia-50 p-4 text-sm text-tinta">
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-barro-700" aria-hidden />
              <span>
                Seu e-mail de acesso
                <br />
                <strong className="text-base break-all">{convite.email_mascarado}</strong>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-barro-700" aria-hidden />
              <span>Só a direção da casa vê seus dados. Os outros médiuns não veem nada seu.</span>
            </li>
          </ul>
          <Button type="button" size="touch" className="w-full font-bold" onClick={() => setPasso('senha')}>
            Continuar
          </Button>
          <p className="text-center text-sm text-tinta-suave">Não é você? Avise a casa.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headTitle="Crie sua senha de acesso — GiraHub"
      title={contaExistente ? 'Entre com a sua senha' : 'Crie sua senha de acesso'}
      subtitle={
        contaExistente
          ? `Você já usa o GiraHub com este e-mail em ${casa}. Use a mesma senha de sempre.`
          : 'É com o seu e-mail e esta senha que você entra na Área do Médium.'
      }
    >
      <form onSubmit={ativar} className="flex flex-col gap-6" noValidate>
        <p className="text-xs font-bold tracking-[0.2em] text-barro-700 uppercase">Passo 2 de 2</p>

        {erro && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <PasswordField
            label="Senha de acesso"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete={contaExistente ? 'current-password' : 'new-password'}
            inputClassName={AUTH_INPUT}
            error={tentou && senhaMsg ? senhaMsg : undefined}
          />
          {!contaExistente && <PasswordRules value={senha} />}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <Checkbox
              id="aceite-area"
              checked={aceite}
              onCheckedChange={(v) => setAceite(v === true)}
              aria-invalid={(tentou && !aceite) || undefined}
              aria-describedby={tentou && !aceite ? 'aceite-area-erro' : undefined}
              className="mt-0.5 size-5 bg-white"
            />
            <Label htmlFor="aceite-area" className="block cursor-pointer text-sm leading-relaxed font-normal">
              {consentimentoAreaLabel(casa)}
            </Label>
          </div>
          <button type="button" className={`${AUTH_LINK} ml-8 min-h-12 self-start text-sm`} onClick={() => setTermoAberto(true)}>
            Ler o termo
          </button>
          {tentou && !aceite && (
            <p id="aceite-area-erro" className="ml-8 text-sm text-destructive-strong">
              Para ativar, marque a autorização acima.
            </p>
          )}
        </div>

        <Button type="submit" size="touch" className="w-full font-bold" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {enviando ? 'Ativando…' : 'Ativar meu acesso'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta"
          onClick={() => setPasso('convite')}
          disabled={enviando}
        >
          <ArrowLeft aria-hidden /> Voltar
        </Button>
      </form>
      <TermoDialog open={termoAberto} onOpenChange={setTermoAberto} casa={casa} />
    </AuthShell>
  );
}
