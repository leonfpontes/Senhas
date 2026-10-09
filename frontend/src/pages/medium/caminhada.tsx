/**
 * /medium/caminhada — "Minha ficha e minha caminhada" (AM-19, aberta pelo Perfil).
 *
 * `GET /api/v1/medium/ficha`: só os campos da ficha espiritual que a casa liberou ao médium (com o
 * valor dele) e os marcos visíveis da linha do tempo (entrada, batismo, obrigações...).
 * - Sem autorização: explica o termo (LGPD art. 11) e o médium autoriza (caixa + botão). Sem ela,
 *   nada da ficha aparece nem é gravado.
 * - Com autorização: ficha + caminhada; "Sugerir" nos campos em que a casa aceita sugestão — a
 *   sugestão fica "aguardando a direção" e só entra depois de aceita no painel.
 * - "Retirar autorização": os dados deixam de aparecer e a direção da casa é avisada para apagá-los.
 * Impersonando, só leitura (os botões somem; a API também recusa). Plano da casa sem a ficha →
 * aviso neutro (a entrada nem aparece no Perfil). Cores só por tokens (`text-brand`, `bg-card`...).
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Flag, Loader2, MessageSquarePlus, ScrollText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { MediumPage, MediumPageHeader, MediumSection } from '@/components/medium/ui';
import { useMedium } from '@/components/medium/MediumProvider';
import { MediumSheet } from '@/components/medium/mensalidade/MediumSheet';
import { erroDaApi } from '@/components/medium/perfil/perfil';
import { estaImpersonando } from '@/components/medium/presenca/presencaApi';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSnackbar } from '@/contexts/SnackbarContext';
import {
  API_FICHA_AREA,
  FICHA_CONSENTIMENTO_VERSAO,
  TERMO_FICHA_RODAPE,
  rotuloTipoMarco,
  termoFichaParagrafos,
  valorLegivel,
  type ConsentimentoFicha,
  type TipoCampoFicha,
  type TipoMarco,
} from '@/constants/fichaEspiritual';
import { isoToBrDate } from '@/lib/dateIso';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

const VALOR_MAX = 500;

interface MeuCampo {
  id: string;
  rotulo: string;
  tipo: TipoCampoFicha;
  opcoes?: string[] | null;
  valor?: string | null;
  pode_sugerir: boolean;
  sugestao_pendente?: { valor: string; criado_em: string } | null;
}

interface MeuMarco {
  id: string;
  tipo: TipoMarco;
  titulo: string;
  data: string;
  observacao?: string | null;
}

interface MinhaFicha {
  consentimento: ConsentimentoFicha;
  campos: MeuCampo[];
  marcos: MeuMarco[];
}

export default function MediumCaminhadaPage() {
  return (
    <MediumLayout title="Minha caminhada">
      <Caminhada />
    </MediumLayout>
  );
}

function SugerirSheet({
  campo,
  onOpenChange,
  onEnviado,
}: {
  campo: MeuCampo | null;
  onOpenChange: (open: boolean) => void;
  onEnviado: (f: MinhaFicha) => void;
}) {
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setValor(campo?.sugestao_pendente?.valor ?? campo?.valor ?? '');
    setErro(null);
  }, [campo]);

  if (!campo) return null;
  const opcoes =
    campo.tipo === 'sim_nao'
      ? [
          { value: 'sim', label: 'Sim' },
          { value: 'nao', label: 'Não' },
        ]
      : campo.tipo === 'lista'
        ? (campo.opcoes ?? []).map((o) => ({ value: o, label: o }))
        : null;

  const enviar = async () => {
    if (!valor.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await apiClient.post<MinhaFicha>(`${API_FICHA_AREA}/sugestoes`, { campo_id: campo.id, valor: valor.trim() });
      onEnviado(res.data);
      onOpenChange(false);
    } catch (err) {
      setErro(erroDaApi(err, 'Não conseguimos enviar. Confira a internet e tente de novo.').message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MediumSheet
      open
      onOpenChange={onOpenChange}
      title={`Sugerir: ${campo.rotulo}`}
      description="A direção da casa confere. Só entra na sua ficha depois que ela aceitar."
      data-testid="sugerir-sheet"
    >
      {opcoes ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={campo.rotulo}>
          {opcoes.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={valor === o.value}
              onClick={() => setValor(o.value)}
              className={cn(
                'min-h-12 rounded-xl border px-4 text-left text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                valor === o.value ? 'border-primary bg-primary/10 font-semibold text-brand' : 'border-border bg-card',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : campo.tipo === 'data' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sugestao-data" className="text-base font-semibold">
            Data
          </Label>
          <Input id="sugestao-data" type="date" value={valor} onChange={(e) => setValor(e.target.value)} className="h-12 text-base" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sugestao-texto" className="text-base font-semibold">
            Sua sugestão
          </Label>
          <Textarea
            id="sugestao-texto"
            value={valor}
            maxLength={VALOR_MAX}
            rows={3}
            onChange={(e) => setValor(e.target.value.slice(0, VALOR_MAX))}
            className="min-h-24 text-base"
          />
        </div>
      )}
      {erro && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-strong" role="alert">
          {erro}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button type="button" size="touch" className="w-full font-semibold" disabled={enviando || !valor.trim()} onClick={() => void enviar()}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Enviar para a casa
        </Button>
        <Button type="button" variant="outline" size="touch" className="w-full font-semibold" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </div>
    </MediumSheet>
  );
}

function Autorizar({ revogadoEm, somenteLeitura, onAutorizado }: { revogadoEm?: string | null; somenteLeitura: boolean; onAutorizado: (f: MinhaFicha) => void }) {
  const { me } = useMedium();
  const casa = me?.terreiro.nome || 'a casa';
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const autorizar = async () => {
    if (!aceito) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await apiClient.post<MinhaFicha>(`${API_FICHA_AREA}/consentimento`, {
        confirmo: true,
        versao: FICHA_CONSENTIMENTO_VERSAO,
      });
      onAutorizado(res.data);
    } catch (err) {
      setErro(erroDaApi(err, 'Não conseguimos registrar. Confira a internet e tente de novo.').message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
      data-testid="caminhada-autorizar"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5 text-brand" aria-hidden />
        Sua ficha espiritual
      </h2>
      {revogadoEm && (
        <p className="text-base">
          Você retirou a autorização em {isoToBrDate(revogadoEm)}. A direção da casa foi avisada para apagar os dados.
        </p>
      )}
      <div className="flex flex-col gap-2 text-base">
        {termoFichaParagrafos(casa).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="text-sm text-muted-foreground">{TERMO_FICHA_RODAPE}</p>
      </div>
      {somenteLeitura ? (
        <p className="text-sm text-muted-foreground">Só o próprio médium pode autorizar.</p>
      ) : (
        <>
          <label className="flex min-h-12 items-start gap-3 text-base">
            <Checkbox
              checked={aceito}
              onCheckedChange={(c) => setAceito(c === true)}
              className="mt-1 size-5"
              aria-label="Autorizo a casa a guardar minha ficha espiritual"
            />
            <span>Li e autorizo {casa} a guardar minha ficha espiritual.</span>
          </label>
          {erro && (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-strong" role="alert">
              {erro}
            </p>
          )}
          <Button type="button" size="touch" className="w-full font-semibold" disabled={!aceito || enviando} onClick={() => void autorizar()}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            Autorizar
          </Button>
        </>
      )}
    </article>
  );
}

function Caminhada() {
  const { showSuccess, showError } = useSnackbar();
  const [data, setData] = useState<MinhaFicha | null>(null);
  const [erro, setErro] = useState<'rede' | 'indisponivel' | null>(null);
  const [nonce, setNonce] = useState(0);
  const [sugerir, setSugerir] = useState<MeuCampo | null>(null);
  const [retirar, setRetirar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const somenteLeitura = estaImpersonando();
  const recarregar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setErro(null);
    apiClient
      .get<MinhaFicha>(API_FICHA_AREA)
      .then((res) => alive && setData(res.data))
      .catch((err: { status?: number; response?: { status?: number } }) => {
        if (!alive) return;
        const status = err?.status ?? err?.response?.status;
        setErro(status === 403 ? 'indisponivel' : 'rede');
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const retirarAutorizacao = async () => {
    setRetirando(true);
    try {
      const res = await apiClient.delete<MinhaFicha>(`${API_FICHA_AREA}/consentimento`);
      setData(res.data);
      showSuccess('Autorização retirada. A direção da casa foi avisada.');
    } catch (err) {
      showError(erroDaApi(err, 'Não conseguimos retirar agora. Tente de novo.').message);
    } finally {
      setRetirando(false);
      setRetirar(false);
    }
  };

  const consentido = data?.consentimento.dado ?? false;

  return (
    <MediumPage>
      <Link
        href="/medium/perfil"
        className="-my-2 inline-flex min-h-12 items-center gap-1.5 self-start text-sm font-semibold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden /> Voltar para o perfil
      </Link>
      <MediumPageHeader title="Minha caminhada" description="Sua ficha espiritual e os marcos da sua história na casa" />

      {erro === 'indisponivel' ? (
        <EmptyState
          icon={<ScrollText />}
          title="Caminhada indisponível"
          description={<span className="text-base">A casa ainda não usa a ficha espiritual pela Área do Médium.</span>}
        />
      ) : erro === 'rede' ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Não conseguimos carregar sua caminhada"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" size="touch" className="font-semibold" onClick={recarregar}>
              Tentar de novo
            </Button>
          }
        />
      ) : !data ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando sua caminhada">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !consentido ? (
        <Autorizar
          revogadoEm={data.consentimento.revogado_em}
          somenteLeitura={somenteLeitura}
          onAutorizado={(f) => {
            setData(f);
            showSuccess('Autorização registrada.');
          }}
        />
      ) : (
        <>
          <MediumSection id="titulo-ficha" title="Minha ficha">
            {data.campos.length === 0 ? (
              <p className="text-base text-muted-foreground">A casa ainda não liberou nenhum campo da ficha para você.</p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
                {data.campos.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0" data-testid="caminhada-campo">
                    <span className="text-sm text-muted-foreground">{c.rotulo}</span>
                    <span className="text-base break-words">
                      {c.valor ? valorLegivel(c.tipo, c.valor) : <span className="text-muted-foreground">A casa ainda não preencheu</span>}
                    </span>
                    {c.sugestao_pendente && (
                      <span className="text-sm text-muted-foreground" data-testid="sugestao-pendente">
                        Sua sugestão “{valorLegivel(c.tipo, c.sugestao_pendente.valor)}” está com a direção da casa.
                      </span>
                    )}
                    {c.pode_sugerir && !somenteLeitura && (
                      <button
                        type="button"
                        onClick={() => setSugerir(c)}
                        className="inline-flex min-h-12 items-center gap-1.5 self-start text-sm font-semibold text-brand underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <MessageSquarePlus className="size-4" aria-hidden />
                        {c.sugestao_pendente ? 'Mudar a sugestão' : 'Sugerir'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </MediumSection>

          <MediumSection id="titulo-marcos" title="Minha caminhada">
            {data.marcos.length === 0 ? (
              <p className="text-base text-muted-foreground">Quando a casa registrar os marcos da sua caminhada, eles aparecem aqui.</p>
            ) : (
              <ol className="flex flex-col gap-3 border-l-2 border-border pl-5" aria-label="Linha do tempo">
                {data.marcos.map((m) => (
                  <li key={m.id} className="relative" data-testid="caminhada-marco">
                    <span aria-hidden className="absolute top-2 -left-[27px] size-3 rounded-full bg-primary ring-4 ring-background" />
                    <article className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xs">
                      <span className="text-sm text-muted-foreground tabular-nums">{isoToBrDate(m.data)}</span>
                      <span className="text-base leading-snug font-semibold">{m.titulo}</span>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Flag className="size-3.5" aria-hidden />
                        {rotuloTipoMarco(m.tipo)}
                      </span>
                      {m.observacao && <p className="text-base">{m.observacao}</p>}
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </MediumSection>

          <p className="text-sm text-muted-foreground">
            Só você e a direção da casa veem estes dados. Os outros médiuns não veem nada seu.
          </p>
          {!somenteLeitura && (
            <Button type="button" variant="outline" size="touch" className="w-full font-semibold" onClick={() => setRetirar(true)}>
              Retirar autorização
            </Button>
          )}
        </>
      )}

      <SugerirSheet
        campo={sugerir}
        onOpenChange={(open) => !open && setSugerir(null)}
        onEnviado={(f) => {
          setData(f);
          showSuccess('Sugestão enviada para a casa.');
        }}
      />
      <ConfirmDialog
        open={retirar}
        title="Retirar a autorização?"
        message="Os dados da sua ficha e da sua caminhada deixam de aparecer, e a direção da casa será avisada para apagá-los. Você pode autorizar de novo depois."
        confirmText="Retirar autorização"
        destructive
        loading={retirando}
        onConfirm={() => void retirarAutorizacao()}
        onCancel={() => setRetirar(false)}
        className="medium-terra"
      />
    </MediumPage>
  );
}
