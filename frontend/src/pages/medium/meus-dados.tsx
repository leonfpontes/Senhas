/**
 * /medium/meus-dados — Meus dados e privacidade (AM-14), aberto pelo Perfil.
 *
 * - "Quem vê o quê": a direção da casa, os outros médiuns (nada; só o aniversário se o médium
 *   ligou o AM-20) e ninguém de fora da casa — curto, no jeito da casa.
 * - "Baixar meus dados": `GET /api/v1/medium/meus-dados/exportar` → arquivo JSON e PDF legível
 *   (`lib/pdf/meusDadosPdf`, com a logo e a cor do terreiro), os dois montados no aparelho.
 * - "Encerrar meu acesso": `EncerrarAcessoDrawer` (confirma com a senha). Conta só da Área →
 *   login com aviso; quem também usa o painel → painel.
 * Impersonando, a tela é só leitura: baixar e encerrar não aparecem (as rotas recusam, §6.9).
 * Só chama `/api/v1/medium/*`.
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, DoorOpen, FileDown, FileJson, Loader2, ShieldCheck } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { EncerrarAcessoDrawer } from '@/components/medium/meusDados/EncerrarAcessoDrawer';
import {
  EXPORTAR_URL,
  aposEncerrar,
  baixarJson,
  ehExport,
  quemVeOQue,
  type EncerrarResposta,
  type MeusDadosExport,
} from '@/components/medium/meusDados/meusDados';
import { PERFIL_URL, erroDaApi, type MediumPerfil } from '@/components/medium/perfil/perfil';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';
import { apiClient } from '@/services/api_client';

export default function MediumMeusDadosPage() {
  return (
    <MediumLayout title="Meus dados e privacidade">
      <MeusDados />
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

function MeusDados() {
  const router = useRouter();
  const { me } = useMedium();
  const { profile } = useProfile();
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [aniversarioLigado, setAniversarioLigado] = useState(false);
  const [baixando, setBaixando] = useState<null | 'json' | 'pdf'>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [encerrar, setEncerrar] = useState(false);

  useEffect(() => setSomenteLeitura(impersonando()), []);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<MediumPerfil>(PERFIL_URL)
      .then((res) => vivo && setAniversarioLigado(Boolean(res.data?.mostrar_aniversario)))
      .catch(() => {
        /* o texto fica no modo "desligado" */
      });
    return () => {
      vivo = false;
    };
  }, []);

  const casa = me?.terreiro.nome ?? '';
  const temPainel = Boolean(me?.areas?.admin);

  const baixar = async (formato: 'json' | 'pdf') => {
    setErro(null);
    setBaixando(formato);
    try {
      const res = await apiClient.get<MeusDadosExport>(EXPORTAR_URL);
      if (!ehExport(res.data)) throw new Error('resposta inesperada');
      if (formato === 'json') {
        baixarJson(res.data);
      } else {
        const { gerarMeusDadosPdf } = await import('@/lib/pdf/meusDadosPdf');
        await gerarMeusDadosPdf(res.data, {
          nome: casa || res.data.terreiro,
          logoUrl: me?.marca.logo_url ?? undefined,
          primaryColor: me?.marca.primary_color ?? '#5b3a29',
        });
      }
    } catch (err) {
      setErro(erroDaApi(err, 'Não foi possível baixar os seus dados agora. Tente de novo.').message);
    } finally {
      setBaixando(null);
    }
  };

  const encerrado = (resp: EncerrarResposta) => {
    const destino = aposEncerrar(resp, profile?.id);
    // Recarga completa: os providers remontam sem a Área (ou sem sessão).
    window.location.href = destino;
  };

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
      <button
        type="button"
        onClick={() => void router.push('/medium/perfil')}
        className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold text-brand outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden /> Perfil
      </button>

      <h1 className="flex items-center gap-2 font-display text-2xl leading-tight font-bold">
        <ShieldCheck className="size-6 text-brand" aria-hidden /> Meus dados e privacidade
      </h1>

      {somenteLeitura && (
        <Alert variant="warning" role="status" data-testid="meus-dados-somente-leitura">
          <AlertDescription>Acesso assistido: baixar os dados e encerrar o acesso ficam só com o médium.</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="titulo-quem-ve" data-testid="quem-ve-o-que">
        <h2 id="titulo-quem-ve" className="px-1 font-display text-xl font-bold">
          Quem vê o quê
        </h2>
        <dl className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
          {quemVeOQue(casa, aniversarioLigado).map((q) => (
            <div key={q.titulo} className="flex flex-col gap-0.5 border-b border-border px-4 py-3 last:border-b-0">
              <dt className="text-base font-bold">{q.titulo}</dt>
              <dd className="text-sm text-muted-foreground">{q.texto}</dd>
            </div>
          ))}
        </dl>
      </section>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!somenteLeitura && (
        <>
          <section className="flex flex-col gap-2" aria-labelledby="titulo-baixar" data-testid="baixar-meus-dados">
            <h2 id="titulo-baixar" className="px-1 font-display text-xl font-bold">
              Baixar meus dados
            </h2>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
              <p className="text-sm text-muted-foreground">
                Tudo o que a casa guarda sobre você na Área: cadastro, mensalidades, avisos lidos, escalas e presenças.
              </p>
              <Button
                type="button"
                size="touch"
                className="w-full font-bold"
                onClick={() => void baixar('pdf')}
                disabled={baixando !== null}
                data-testid="baixar-pdf"
              >
                {baixando === 'pdf' ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                Baixar em PDF
              </Button>
              <Button
                type="button"
                size="touch"
                variant="outline"
                className="w-full font-bold"
                onClick={() => void baixar('json')}
                disabled={baixando !== null}
                data-testid="baixar-json"
              >
                {baixando === 'json' ? <Loader2 className="animate-spin" aria-hidden /> : <FileJson aria-hidden />}
                Baixar arquivo de dados (JSON)
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="titulo-encerrar" data-testid="encerrar-acesso">
            <h2 id="titulo-encerrar" className="px-1 font-display text-xl font-bold">
              Encerrar meu acesso
            </h2>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
              <p className="text-sm text-muted-foreground">
                {temPainel
                  ? 'Você sai da Área do Médium. O painel do terreiro continua como está.'
                  : 'Você sai da Área do Médium e a sua conta da Área é desativada.'}{' '}
                O seu cadastro continua com a casa.
              </p>
              <Button
                type="button"
                size="touch"
                variant="outline"
                className="w-full font-bold text-destructive-strong"
                onClick={() => setEncerrar(true)}
                data-testid="abrir-encerrar"
              >
                <DoorOpen aria-hidden />
                Encerrar meu acesso
              </Button>
            </div>
          </section>

          <EncerrarAcessoDrawer
            open={encerrar}
            casa={casa}
            temPainel={temPainel}
            onClose={() => setEncerrar(false)}
            onDone={encerrado}
          />
        </>
      )}
    </div>
  );
}
