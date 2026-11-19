/**
 * /convite-equipe/[token] — convite da casa para entrar no painel do terreiro (11/2026).
 *
 * Quem cadastra não define mais a senha de ninguém: o admin convida pelo e-mail e a pessoa
 * aceita aqui. Passo 1 ("Convite da casa"): logo e nome do terreiro, quem convidou, o tipo de
 * acesso em palavras simples e o e-mail mascarado; "Aceitar convite" e "Não é para mim" no
 * mesmo tamanho. Passo 2 depende de quem a pessoa já é no GiraHub (`situacao` da API):
 * - `nova` → cria a senha;
 * - `outra_casa` → usa a senha de sempre (padrão) ou cria uma só para esta casa — com a mesma
 *   senha, o login mostra as duas casas juntas na escolha de terreiro;
 * - `medium_da_casa` → a senha que já usa na Área do Médium (a mesma conta ganha o painel);
 * - `ja_tem_acesso` → só manda para o login.
 * Aceite dos Termos e da Privacidade sempre desmarcado (consentimento ativo). Deu certo → já
 * entra com a sessão aberta pelo backend (cookies): painel, ou a escolha de área.
 *
 * Identidade das telas de conta (`AuthShell`, `.auth-terra`).
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, ArrowRight, CircleAlert, KeyRound, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { AuthShell, AUTH_INPUT, AUTH_LINK, ChoiceCards, PasswordRules } from '@/components/auth';
import { PasswordField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/admin';
import { apiClient, type ApiRequestConfig } from '@/services/api_client';
import { passwordError } from '@/constants/passwordPolicy';

type Situacao = 'nova' | 'outra_casa' | 'medium_da_casa' | 'ja_tem_acesso';
type Modo = 'senha_existente' | 'senha_nova';

export interface ConviteEquipePublico {
  terreiro: { nome: string; slug: string };
  marca: { logo_url?: string | null; primary_color: string };
  primeiro_nome: string;
  convidou?: string | null;
  role: 'admin' | 'operator' | string;
  email_mascarado: string;
  situacao: Situacao;
  expira_em: string;
}

interface AceiteResposta {
  redirect: string;
  user: Record<string, unknown>;
}

// Rota pública: 4xx aqui é regra de negócio, nunca "sessão expirada".
const PUBLICO: ApiRequestConfig = { skipAutoLogout: true };
const ERRO_GENERICO = 'Não foi possível aceitar agora. Tente de novo em instantes.';

const O_QUE_FAZ: Record<string, { titulo: string; texto: string }> = {
  admin: { titulo: 'Administrador', texto: 'Vê e muda tudo no terreiro, inclusive pessoas e plano.' },
  operator: { titulo: 'Operador', texto: 'Ajuda no dia a dia da casa, com o que o seu perfil de acesso permitir.' },
};

export function erroDoConvite(err: unknown): { code?: string; message: string } {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> } } | undefined;
  const data = e?.response?.data;
  if (e?.response?.status === 429) return { code: 'RATE_LIMIT', message: 'Muitas tentativas. Espere um minuto e tente de novo.' };
  const detail = data?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as { error_code?: string; message?: string };
    return { code: d.error_code, message: d.message || ERRO_GENERICO };
  }
  if (typeof detail === 'string') return { message: detail };
  if (data && typeof data.message === 'string') {
    return { code: typeof data.error_code === 'string' ? data.error_code : undefined, message: data.message };
  }
  return { message: ERRO_GENERICO };
}

function temSessaoAberta(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.includes('auth_state=1') || !!localStorage.getItem('user');
  } catch {
    return false;
  }
}

function LogoDaCasa({ convite }: { convite: ConviteEquipePublico }) {
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
          className="flex size-24 items-center justify-center rounded-full border border-areia-200 bg-areia-100 font-display text-4xl font-bold text-tinta shadow-sm"
        >
          {inicial || '•'}
        </span>
      )}
      <p className="font-display text-2xl leading-tight font-bold text-tinta">{convite.terreiro.nome}</p>
    </div>
  );
}

function SemConvite({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <AuthShell headTitle="Convite da casa — GiraHub" eyebrow="Convite da casa" title={titulo}>
      <div className="flex flex-col gap-6">
        <p role="alert" className="text-sm text-tinta-suave">
          {texto}
        </p>
        <Link href="/login" className={`${AUTH_LINK} inline-flex min-h-12 items-center justify-center gap-2 self-center text-sm`}>
          <ArrowRight className="size-4" aria-hidden /> Ir para o login
        </Link>
      </div>
    </AuthShell>
  );
}

export default function ConviteEquipePage() {
  const router = useRouter();
  const token = router.isReady ? (router.query.token as string | undefined) : undefined;

  const [convite, setConvite] = useState<ConviteEquipePublico | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [passo, setPasso] = useState<'convite' | 'senha' | 'recusado'>('convite');
  const [modo, setModo] = useState<Modo>('senha_existente');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRecusa, setConfirmarRecusa] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [sessaoAberta, setSessaoAberta] = useState(false);

  useEffect(() => setSessaoAberta(temSessaoAberta()), []);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setErroCarga('Peça um novo convite à casa.');
      return;
    }
    let ativo = true;
    apiClient
      .get<ConviteEquipePublico>(`/api/v1/public/convite-equipe/${encodeURIComponent(token)}`, PUBLICO)
      .then((res) => {
        if (!ativo) return;
        setConvite(res.data);
        setModo(res.data.situacao === 'nova' ? 'senha_nova' : 'senha_existente');
      })
      .catch((err) => {
        if (ativo) setErroCarga(erroDoConvite(err).message.replace(/^Este convite não vale mais\.\s*/, ''));
      });
    return () => {
      ativo = false;
    };
  }, [router.isReady, token]);

  if (erroCarga) {
    return (
      <SemConvite
        titulo="Este convite não vale mais"
        texto={`${erroCarga} Por segurança, cada convite vale por um tempo e só uma vez.`}
      />
    );
  }

  if (passo === 'recusado') {
    return (
      <SemConvite
        titulo="Convite recusado"
        texto="Pronto. O link deixou de valer e a casa vai ver que você recusou. Se mudar de ideia, peça um novo convite."
      />
    );
  }

  if (!convite) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-areia-50 px-4" aria-busy="true">
        <Skeleton className="h-96 w-full max-w-md" />
      </main>
    );
  }

  if (convite.situacao === 'ja_tem_acesso') {
    return (
      <SemConvite
        titulo="Você já tem acesso"
        texto={`Este e-mail já entra no painel de ${convite.terreiro.nome}. Entre com o seu e-mail e a sua senha.`}
      />
    );
  }

  const casa = convite.terreiro.nome;
  const acesso = O_QUE_FAZ[convite.role] ?? O_QUE_FAZ.operator;
  const senhaDeSempre = convite.situacao === 'medium_da_casa' || modo === 'senha_existente';
  const senhaMsg = senhaDeSempre ? (senha ? null : 'Digite a sua senha.') : passwordError(senha);

  const recusar = async () => {
    if (!token) return;
    setRecusando(true);
    try {
      await apiClient.post(`/api/v1/public/convite-equipe/${encodeURIComponent(token)}/recusar`, {}, PUBLICO);
      setConfirmarRecusa(false);
      setPasso('recusado');
    } catch (err) {
      setConfirmarRecusa(false);
      setErroCarga(erroDoConvite(err).message.replace(/^Este convite não vale mais\.\s*/, ''));
    } finally {
      setRecusando(false);
    }
  };

  const aceitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    setErro(null);
    if (senhaMsg || !aceite || !token) return;
    setEnviando(true);
    try {
      const res = await apiClient.post<AceiteResposta>(
        `/api/v1/public/convite-equipe/${encodeURIComponent(token)}/aceitar`,
        { modo: convite.situacao === 'medium_da_casa' ? 'senha_existente' : modo, senha, aceite_termos: true },
        PUBLICO,
      );
      // A sessão já veio nos cookies HttpOnly; o `user` fica no localStorage como no /login.
      try {
        localStorage.setItem('user', JSON.stringify(res.data.user));
      } catch {
        /* navegador sem localStorage: a sessão (cookies) basta */
      }
      window.location.href = res.data.redirect || '/admin';
    } catch (err) {
      setErro(erroDoConvite(err).message);
      setEnviando(false);
    }
  };

  if (passo === 'convite') {
    const nome = convite.primeiro_nome;
    const quem = convite.convidou ? `${convite.convidou} convidou você` : 'A casa convidou você';
    return (
      <AuthShell
        headTitle="Convite da casa — GiraHub"
        eyebrow="Convite da casa"
        title={nome ? `Olá, ${nome}! Você foi convidado(a) para ${casa}.` : `Você foi convidado(a) para ${casa}`}
        subtitle={`${quem} para entrar no GiraHub, o sistema que a casa usa para giras, senhas e o dia a dia.`}
      >
        <div className="flex flex-col gap-6">
          <LogoDaCasa convite={convite} />
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-areia-100 px-3.5 py-3 text-sm text-tinta">
              <span className="flex items-center gap-2 text-xs font-semibold text-tinta-suave">
                <UserRound className="size-4 shrink-0" aria-hidden /> Seu acesso: {acesso.titulo}
              </span>
              <span className="mt-0.5 block text-base">{acesso.texto}</span>
            </div>
            <div className="rounded-xl bg-areia-100 px-3.5 py-3 text-sm text-tinta">
              <span className="flex items-center gap-2 text-xs font-semibold text-tinta-suave">
                <Mail className="size-4 shrink-0" aria-hidden /> Seu e-mail de acesso
              </span>
              <strong className="mt-0.5 block text-base break-all">{convite.email_mascarado}</strong>
            </div>
          </div>
          {sessaoAberta && (
            <Alert role="status">
              <ShieldCheck aria-hidden />
              <AlertDescription>
                Você está com outra conta aberta neste navegador. Ao aceitar, ela fecha e entra a conta deste convite.
              </AlertDescription>
            </Alert>
          )}
          {/* Aceitar e recusar com o mesmo tamanho e destaque legível (design ético, regra 2). */}
          <div className="flex flex-col gap-3">
            <Button type="button" size="touch" className="w-full font-bold" onClick={() => setPasso('senha')}>
              Aceitar convite <ArrowRight aria-hidden />
            </Button>
            <Button
              type="button"
              size="touch"
              variant="outline"
              className="w-full border-tinta/40 font-bold text-tinta"
              onClick={() => setConfirmarRecusa(true)}
            >
              Não é para mim
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmarRecusa}
          title="Recusar o convite?"
          message={<>O link deixa de valer e {casa} vai ver que você recusou.</>}
          confirmText="Recusar convite"
          cancelText="Voltar"
          loading={recusando}
          onConfirm={recusar}
          onCancel={() => setConfirmarRecusa(false)}
        />
      </AuthShell>
    );
  }

  const titulo =
    convite.situacao === 'medium_da_casa'
      ? 'Entre com a sua senha'
      : convite.situacao === 'outra_casa'
        ? 'Qual senha você quer usar?'
        : 'Crie sua senha';
  const subtitulo =
    convite.situacao === 'medium_da_casa'
      ? `Você já usa a Área do Médium de ${casa}. Use a mesma senha: a sua conta passa a abrir também o painel.`
      : convite.situacao === 'outra_casa'
        ? 'Este e-mail já usa o GiraHub em outra casa.'
        : `É com o seu e-mail e esta senha que você entra em ${casa}.`;

  return (
    <AuthShell headTitle={`${titulo} — GiraHub`} eyebrow="Passo 2 de 2" title={titulo} subtitle={subtitulo}>
      <form onSubmit={aceitar} className="flex flex-col gap-6" noValidate>
        {erro && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {convite.situacao === 'outra_casa' && (
          <div className="flex flex-col gap-2">
            <ChoiceCards
              label="Senha"
              estilo="lista"
              value={modo}
              onChange={(v) => {
                setModo(v as Modo);
                setSenha('');
                setTentou(false);
              }}
              options={[
                { value: 'senha_existente', label: 'Usar a senha que já uso no GiraHub' },
                { value: 'senha_nova', label: 'Criar uma senha só para esta casa' },
              ]}
            />
            <p className="text-sm text-tinta-suave">
              {modo === 'senha_existente'
                ? 'Com a mesma senha, ao entrar você escolhe a casa, e troca de casa sem digitar a senha de novo.'
                : 'Com senhas diferentes, cada senha abre só a casa dela na hora de entrar.'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <PasswordField
            label={senhaDeSempre ? 'Sua senha do GiraHub' : 'Nova senha'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete={senhaDeSempre ? 'current-password' : 'new-password'}
            inputClassName={AUTH_INPUT}
            error={tentou && senhaMsg ? senhaMsg : undefined}
          />
          {!senhaDeSempre && <PasswordRules value={senha} />}
          {senhaDeSempre && (
            <Link href="/forgot-password" className={`${AUTH_LINK} inline-flex min-h-12 items-center gap-2 self-start text-sm`}>
              <KeyRound className="size-4" aria-hidden /> Esqueci minha senha
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <Checkbox
              id="aceite-termos"
              checked={aceite}
              onCheckedChange={(v) => setAceite(v === true)}
              aria-invalid={(tentou && !aceite) || undefined}
              aria-describedby={tentou && !aceite ? 'aceite-termos-erro' : undefined}
              className="mt-0.5 size-5 bg-white"
            />
            <Label htmlFor="aceite-termos" className="block cursor-pointer text-sm leading-relaxed font-normal">
              Li e aceito os{' '}
              <a href="/termos" target="_blank" rel="noopener noreferrer" className={AUTH_LINK}>
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className={AUTH_LINK}>
                Política de Privacidade
              </a>
            </Label>
          </div>
          {tentou && !aceite && (
            <p id="aceite-termos-erro" className="ml-8 text-sm text-destructive-strong">
              Para aceitar, marque que você leu os termos.
            </p>
          )}
        </div>

        <Button type="submit" size="touch" className="w-full font-bold" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {enviando ? 'Entrando…' : `Entrar em ${casa}`}
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
    </AuthShell>
  );
}
