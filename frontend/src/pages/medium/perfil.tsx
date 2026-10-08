/**
 * /medium/perfil — Perfil da Área do Médium (AM-06 + AM-13).
 *
 * - Cabeçalho: foto (ou iniciais), nome e terreiro; tocar em "Trocar foto" escolhe uma imagem,
 *   reduzida no navegador antes de enviar (`prepararFotoPerfil`).
 * - "Meus dados" (`GET /api/v1/medium/perfil`): telefone, endereço e nascimento, com "Editar meus
 *   dados" em `CrudDrawer` (tela cheia no celular).
 * - "Dados da casa": nome no cadastro, entrada, tipo e mensalidade — travados ("Só a direção da
 *   casa altera estes dados").
 * - "Conta de acesso": e-mail de login (troca com confirmação no endereço novo; aviso do pedido
 *   pendente) e "Trocar senha" (derruba as sessões → login).
 * - Itens de sempre: Ícone na tela inicial, Trocar de área (só com as duas áreas) e Sair.
 * Impersonando, a Área é só leitura (§6.9): as ações de alterar somem.
 * "Minhas presenças" entra com o AM-17.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowLeftRight,
  AtSign,
  Camera,
  ChevronRight,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MailCheck,
  Pencil,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { MediumLayout, useMediumShell } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { MeusGrupos } from '@/components/medium/MeusGrupos';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';
import { MeusDadosDrawer } from '@/components/medium/perfil/MeusDadosDrawer';
import { TrocarEmailDrawer } from '@/components/medium/perfil/TrocarEmailDrawer';
import { TrocarSenhaDrawer } from '@/components/medium/perfil/TrocarSenhaDrawer';
import {
  ArquivoInvalido,
  MSG_EMAIL_ENVIADO,
  PERFIL_URL,
  enderecoLegivel,
  erroDaApi,
  nascimentoLegivel,
  prepararFotoPerfil,
  telefoneLegivel,
  tipoLegivel,
  type MediumPerfil,
} from '@/components/medium/perfil/perfil';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient } from '@/services/api_client';
import { logout } from '@/services/authSession';
import { isoToBrDate } from '@/lib/dateIso';
import { cn } from '@/lib/utils';

export default function MediumPerfilPage() {
  return (
    <MediumLayout title="Perfil">
      <Perfil />
    </MediumLayout>
  );
}

function impersonando(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem('impersonating'));
  } catch {
    return false;
  }
}

function Item({
  icon: Icon,
  title,
  description,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base leading-snug">{title}</strong>
          {description && <span className="text-sm break-words text-muted-foreground">{description}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

function Linha({ rotulo, valor, testId }: { rotulo: string; valor: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-base break-words" data-testid={testId}>
        {valor}
      </dd>
    </div>
  );
}

function Secao({
  titulo,
  icone: Icone,
  children,
  acao,
  testId,
}: {
  titulo: string;
  icone?: LucideIcon;
  children: React.ReactNode;
  acao?: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId} aria-label={titulo}>
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          {Icone && <Icone className="size-4 text-muted-foreground" aria-hidden />}
          {titulo}
        </h2>
        {acao}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Perfil() {
  const router = useRouter();
  const { me, refresh } = useMedium();
  const { openInstall, goToPainel, sair } = useMediumShell();
  const { showSuccess } = useSnackbar();
  const [perfil, setPerfil] = useState<MediumPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | 'dados' | 'senha' | 'email'>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [foto, setFoto] = useState<{ enviando: boolean; erro?: string }>({ enviando: false });
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSomenteLeitura(impersonando()), []);

  const carregar = useCallback(() => {
    setErro(null);
    apiClient
      .get<MediumPerfil>(PERFIL_URL)
      .then((res) => {
        if (res.data && res.data.casa) setPerfil(res.data);
        else setErro('Não foi possível carregar seus dados agora.');
      })
      .catch((err) => setErro(erroDaApi(err, 'Não foi possível carregar seus dados agora.').message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nome = perfil?.casa.nome || me?.nome || '';
  const fotoUrl = perfil?.foto_url ?? me?.foto_url ?? null;
  const iniciais =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '·';

  const escolherFoto = async (file: File | undefined) => {
    if (!file) return;
    setFoto({ enviando: true });
    try {
      const pronta = await prepararFotoPerfil(file);
      const fd = new FormData();
      fd.append('file', pronta);
      const res = await apiClient.post<{ foto_url?: string | null }>(`${PERFIL_URL}/foto`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPerfil((p) => (p ? { ...p, foto_url: res.data?.foto_url ?? p.foto_url } : p));
      setFoto({ enviando: false });
      refresh();
      showSuccess('Foto atualizada.');
    } catch (err) {
      const msg =
        err instanceof ArquivoInvalido
          ? err.message
          : erroDaApi(err, 'Não foi possível enviar a foto. Tente de novo.').message;
      setFoto({ enviando: false, erro: msg });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const desistirDoEmail = async () => {
    try {
      await apiClient.delete(`${PERFIL_URL}/email`);
      setEmailEnviado(false);
      setPerfil((p) => (p ? { ...p, email_pendente: null, email_pendente_expira_em: null } : p));
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível cancelar a troca agora.').message);
    }
  };

  const senhaTrocada = () => {
    // O servidor já derrubou todas as sessões (esta inclusive): limpa o navegador e vai ao login.
    void logout(() => router.push('/login?senha_alterada=1'));
  };

  return (
    <>
      <section className="relative flex items-center gap-4 bg-cafe-950 px-4 pt-6 pb-7 text-areia-100">
        <div className="relative shrink-0">
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoUrl}
              alt=""
              data-testid="perfil-foto"
              className="size-16 rounded-full object-cover ring-[3px] ring-ouro-400"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-primary-foreground ring-[3px] ring-ouro-400"
            >
              {iniciais}
            </span>
          )}
          {!somenteLeitura && perfil && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={foto.enviando}
              aria-label="Trocar foto"
              data-testid="perfil-trocar-foto"
              className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-ouro-300 text-cafe-950 shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ouro-300/60"
            >
              {foto.enviando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-4" aria-hidden />
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="perfil-foto-input"
            onChange={(e) => void escolherFoto(e.target.files?.[0])}
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-bold text-white">{nome}</h1>
          <p className="text-base text-areia-200">
            Médium da corrente{me ? ` · ${me.terreiro.nome}` : ''}
          </p>
          <MeusGrupos grupos={me?.grupos} className="mt-1 text-areia-200" />
        </div>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary to-ouro-400"
        />
      </section>

      <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
        {foto.erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{foto.erro}</AlertDescription>
          </Alert>
        )}
        {somenteLeitura && (
          <Alert variant="warning" role="status" data-testid="perfil-somente-leitura">
            <AlertDescription>Acesso assistido: os dados aparecem só para leitura.</AlertDescription>
          </Alert>
        )}
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="flex flex-col items-start gap-2">
              {erro}
              <Button type="button" variant="outline" size="sm" onClick={carregar}>
                Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {perfil && (
          <>
            <Secao
              titulo="Meus dados"
              testId="perfil-meus-dados"
              acao={
                !somenteLeitura && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDrawer('dados')}
                    data-testid="perfil-editar-dados"
                  >
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                )
              }
            >
              <dl>
                <Linha rotulo="Telefone" valor={telefoneLegivel(perfil)} testId="perfil-valor-telefone" />
                <Linha rotulo="Endereço" valor={enderecoLegivel(perfil)} testId="perfil-valor-endereco" />
                <Linha rotulo="Data de nascimento" valor={nascimentoLegivel(perfil)} testId="perfil-valor-nascimento" />
              </dl>
            </Secao>

            <Secao titulo="Dados da casa" icone={Lock} testId="perfil-dados-casa">
              <dl>
                <Linha rotulo="Nome no cadastro da casa" valor={perfil.casa.nome} />
                <Linha
                  rotulo="Entrada na casa"
                  valor={perfil.casa.data_entrada ? isoToBrDate(perfil.casa.data_entrada) : 'Não informado'}
                />
                <Linha rotulo="Na corrente" valor={tipoLegivel(perfil.casa.tipo)} />
                <Linha
                  rotulo="Mensalidade"
                  valor={perfil.casa.isento_mensalidade ? 'Isento de mensalidade' : 'Paga mensalidade'}
                />
              </dl>
              <p className="border-t border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Só a direção da casa altera estes dados. Viu algo errado? Fale com a casa.
              </p>
            </Secao>

            <Secao titulo="Conta de acesso" testId="perfil-conta">
              {(emailEnviado || perfil.email_pendente) && (
                <div className="flex flex-col gap-2 border-b border-border px-4 py-3" role="status" data-testid="perfil-email-pendente">
                  <p className="flex items-start gap-2 text-sm">
                    <MailCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    <span>
                      {MSG_EMAIL_ENVIADO}
                      {perfil.email_pendente && (
                        <>
                          {' '}
                          Novo e-mail: <strong className="break-all">{perfil.email_pendente}</strong>.
                        </>
                      )}
                    </span>
                  </p>
                  {!somenteLeitura && perfil.email_pendente && (
                    <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void desistirDoEmail()}>
                      Desistir da troca
                    </Button>
                  )}
                </div>
              )}
              <ul>
                {somenteLeitura ? (
                  <li className="px-4 py-3">
                    <p className="text-sm text-muted-foreground">E-mail de acesso</p>
                    <p className="text-base break-all">{perfil.email}</p>
                  </li>
                ) : (
                  <>
                    <Item
                      icon={AtSign}
                      title="E-mail de acesso"
                      description={perfil.email}
                      onClick={() => setDrawer('email')}
                      testId="perfil-trocar-email"
                    />
                    <Item
                      icon={KeyRound}
                      title="Trocar senha"
                      description="Você entra de novo com a nova senha"
                      onClick={() => setDrawer('senha')}
                      testId="perfil-trocar-senha"
                    />
                  </>
                )}
              </ul>
            </Secao>
          </>
        )}

        <ul
          className={cn(
            'overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm',
          )}
        >
          <Item
            icon={Smartphone}
            title="Ícone na tela inicial"
            description="Abrir a Área com um toque"
            onClick={openInstall}
            testId="perfil-instalar"
          />
          {goToPainel && (
            <Item
              icon={ArrowLeftRight}
              title="Trocar de área"
              description="Ir para o painel do terreiro"
              onClick={goToPainel}
              testId="perfil-trocar-area"
            />
          )}
          <Item icon={LogOut} title="Sair" onClick={sair} testId="perfil-sair" />
        </ul>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          Área do Médium no <GiraHubLogo size="sm" className="text-muted-foreground" />
        </p>
      </div>

      {perfil && !somenteLeitura && (
        <>
          <MeusDadosDrawer
            open={drawer === 'dados'}
            perfil={perfil}
            onClose={() => setDrawer(null)}
            onSaved={(p) => {
              setPerfil(p);
              setDrawer(null);
              showSuccess('Seus dados foram atualizados.');
            }}
          />
          <TrocarEmailDrawer
            open={drawer === 'email'}
            emailAtual={perfil.email}
            onClose={() => setDrawer(null)}
            onSent={(resp) => {
              setPerfil((p) =>
                p ? { ...p, email_pendente: resp.email_pendente, email_pendente_expira_em: resp.email_pendente_expira_em } : p,
              );
              setEmailEnviado(true);
              setDrawer(null);
            }}
          />
          <TrocarSenhaDrawer open={drawer === 'senha'} onClose={() => setDrawer(null)} onDone={senhaTrocada} />
        </>
      )}
    </>
  );
}
