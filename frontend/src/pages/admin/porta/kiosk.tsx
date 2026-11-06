/**
 * Modo TV — exibição em tela cheia da fila da porta, para a televisão da sala de espera.
 * Fonte enorme, alto contraste, o número atual e os três próximos; o título da aba mostra o
 * número chamado. Continua exigindo login (chamadas via apiClient → 401 leva ao /login) e o
 * grupo `porta` (view).
 * Rota: /admin/porta/kiosk?gira=<id>  (gira opcional; sem ela usa a gira de hoje, pela mesma
 * regra do GiraContext — `pickTodayGira`).
 * Privacidade (T-04): a TV é pública na sala de espera. A fila vem de
 * `GET /giras/{id}/door/tv`, que só traz número, nome reduzido no servidor ("Maria S."),
 * próximas senhas e a última chamada — nunca e-mail, telefone, nome completo ou ids. Não usar
 * `/door/queue` aqui.
 * Médium da última chamada: só vem quando a casa liga "Mostrar o médium no Modo TV" em
 * Configurações (`enable_tv_medium`, padrão desligado) — o servidor nem manda o nome sem isso.
 * Presença (AM-28): com o modo "Cheguei com QR" e a janela aberta, o QR do dia aparece no canto
 * (`QrPresenca` → `GET /admin/atividades/da-gira/{id}/qr`): só um link da Área com o código curto,
 * nenhum dado de médium. Precisa da Área liberada e da presença no plano.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { fraunces } from '@/components/landing/fonts';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { pickTodayGira } from '@/components/admin/GiraContext';
import { PermissionDenied } from '@/components/gates';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/useSubscription';
import { QrPresenca } from '@/components/admin/presenca/QrPresenca';
import { cn } from '@/lib/utils';
import { manterSeIgual, useAtualizacaoPeriodica } from '@/lib/polling';

const POLLING_INTERVAL_MS = 8000;

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
  is_active: boolean;
}
/** Payload de `GET /api/v1/admin/giras/{id}/door/tv` (só o que a TV mostra). */
interface TvSenha {
  numero_formatado: string;
  nome: string | null;
  chamado_em: string | null;
  /** Médium que atende (só na última chamada e só com a opção ligada). */
  medium?: string | null;
}
export interface DoorTv {
  gira_nome: string;
  atual: TvSenha | null;
  proximas: string[];
  /** As mesmas próximas com o nome reduzido no servidor (J4 v2 · 08). */
  proximas_detalhe?: TvSenha[];
  /** Nome do terreiro, no canto da TV. */
  casa_nome?: string | null;
  ultima_chamada: TvSenha | null;
}

/** Iniciais da casa no avatar do canto ("Terreiro Filhos de Fé" → "FF"). */
function iniciaisDaCasa(nome: string): string {
  const partes = nome.split(/\s+/).filter((p) => p && !/^(de|da|do|das|dos|e|terreiro|tenda|casa|centro|templo)$/i.test(p));
  return (partes.length ? partes : nome.split(/\s+/)).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
}

function horaCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PortaKioskPage() {
  const { can: canGroup, loading: permLoading } = usePermissions();
  const canView = canGroup('porta', 'view');

  if (!permLoading && !canView) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070f] px-6">
        <PermissionDenied className="max-w-md" />
      </main>
    );
  }
  return <KioskContent canView={canView} />;
}

/** QR do "Cheguei" no canto da TV (AM-28) — só com a Área liberada e a presença no plano. */
function QrDaPresencaNaTv({ giraId }: { giraId: string }) {
  const { can } = useSubscription();
  if (!giraId || !can('area_medium') || !can('atividades_corrente')) return null;
  return (
    <QrPresenca
      url={`/api/v1/admin/atividades/da-gira/${encodeURIComponent(giraId)}/qr`}
      variante="tv"
      className="w-full max-w-[320px]"
    />
  );
}

function KioskContent({ canView }: { canView: boolean }) {
  const router = useRouter();
  const [giraId, setGiraId] = useState<string>('');
  const [giraNome, setGiraNome] = useState<string>('');
  const [tv, setTv] = useState<DoorTv | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState('');
  const prevNextRef = useRef<string | null>(null);

  const loadGiras = useCallback(async () => {
    if (!canView) return;
    try {
      const res = await apiClient.get('/api/v1/admin/giras');
      const all: Gira[] = Array.isArray(res.data) ? res.data : res.data.items || [];
      const queryGira = typeof router.query.gira === 'string' ? router.query.gira : '';
      // Sem ?gira: a gira de hoje (antes pegava a primeira ativa da lista, que vem da mais
      // distante no futuro para a mais antiga).
      const chosen = queryGira ? all.find((g) => g.id === queryGira) : pickTodayGira(all);
      if (chosen) {
        setGiraId(chosen.id);
        setGiraNome(chosen.nome);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [router.query.gira, canView]);

  const loadQueue = useCallback(async () => {
    if (!giraId || !canView) return;
    try {
      const res = await apiClient.get<DoorTv>(`/api/v1/admin/giras/${giraId}/door/tv`);
      const novo: DoorTv | null = res.data ?? null;
      setTv((atual) => manterSeIgual(atual, novo));
      if (res.data?.gira_nome) setGiraNome(res.data.gira_nome);
    } catch {
      /* tenta de novo no próximo ciclo */
    } finally {
      setLoading(false);
    }
  }, [giraId, canView]);

  useEffect(() => {
    if (router.isReady) loadGiras();
  }, [router.isReady, loadGiras]);
  useEffect(() => {
    if (giraId) loadQueue();
  }, [giraId, loadQueue]);
  // Só com a tela visível; ao voltar, atualiza na hora.
  useAtualizacaoPeriodica(loadQueue, POLLING_INTERVAL_MS, !!giraId);

  useEffect(() => {
    // "19h14", como a casa fala (J4 v2 · 08).
    const tick = () => {
      const d = new Date();
      setClock(`${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const atual = tv?.atual ?? null;
  const upcoming = tv?.proximas ?? [];
  const ultima = tv?.ultima_chamada ?? null;

  // Som quando o "próximo" muda (o número formatado é único na gira: "0042" ou "P003").
  useEffect(() => {
    if (atual && prevNextRef.current && prevNextRef.current !== atual.numero_formatado) {
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(() => {});
      } catch {
        /* ambiente sem Audio */
      }
    }
    prevNextRef.current = atual?.numero_formatado ?? null;
    // Depende do número, não do objeto: o som só toca quando o "próximo" realmente muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.numero_formatado]);

  const numeroAtual = atual ? atual.numero_formatado : null;

  return (
    <>
      <Head>
        <title>{numeroAtual ? `${numeroAtual} — Porta` : 'Modo TV — Porta'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {/* PainelModoTV (J4 v2 · 08): a casa, o relógio e a senha à esquerda; as próximas e o QR à direita. */}
      <main
        data-testid="kiosk"
        className={cn(
          fraunces.variable,
          'grid min-h-screen grid-cols-1 bg-[color:var(--color-cafe-950)] text-[color:var(--color-areia-50)] md:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]',
        )}
      >
        <section className="flex min-h-[60vh] flex-col justify-between gap-8 px-[5vw] py-[5vh]" aria-label="Senha chamada">
          <header className="flex items-start justify-between gap-6">
            <div className="flex min-w-0 items-center gap-[1.2vw]">
              {tv?.casa_nome && (
                <span aria-hidden className="flex size-[3.6vw] min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-folha-700)] text-[1.1vw] font-bold text-white">
                  {iniciaisDaCasa(tv.casa_nome)}
                </span>
              )}
              <div className="min-w-0">
                {tv?.casa_nome && <p className="truncate text-[clamp(1rem,1.5vw,2rem)] font-bold">{tv.casa_nome}</p>}
                <p className="truncate text-[clamp(0.875rem,1.2vw,1.5rem)] text-[color:var(--color-ouro-300)]">{giraNome}</p>
              </div>
            </div>
            <span className="text-[clamp(1.25rem,2vw,2.5rem)] font-semibold tabular-nums" aria-label="Hora atual">
              {clock}
            </span>
          </header>

          {loading ? (
            <Loader2 className="size-12 animate-spin text-white/80" aria-label="Carregando" />
          ) : !giraId ? (
            <p className="text-3xl text-white/70">Nenhuma gira hoje.</p>
          ) : (
            <div>
              <p className="text-[clamp(1.25rem,2vw,2.5rem)] font-semibold text-[color:var(--color-areia-200)]">Senha</p>
              <p
                data-testid="kiosk-numero"
                className="font-display text-[clamp(6rem,22vw,26rem)] leading-[0.9] font-normal tracking-[-0.03em] text-[color:var(--color-ouro-300)] tabular-nums"
                aria-live="polite"
              >
                {numeroAtual ?? '—'}
              </p>
              {atual?.nome && (
                <p className="mt-[1vh] truncate text-[clamp(2rem,4.5vw,5.5rem)] font-bold" data-testid="kiosk-nome">
                  {atual.nome}
                </p>
              )}
              {!atual && (
                <p className="mt-[1vh] text-[clamp(1.5rem,3vw,3.5rem)] text-white/70">Aguardando a próxima pessoa chegar</p>
              )}
            </div>
          )}

          {ultima ? (
            <p className={cn('text-white/80', ultima.medium ? 'text-[clamp(1.25rem,2.2vw,2.75rem)]' : 'text-[clamp(1rem,1.6vw,2rem)]')} data-testid="kiosk-ultima">
              Última chamada: <span className="tabular-nums">{ultima.numero_formatado}</span>
              {ultima.medium && (
                <>
                  {' '}
                  com <span className="font-bold text-white" data-testid="kiosk-medium">{ultima.medium}</span>
                </>
              )}
              {horaCurta(ultima.chamado_em) && ` às ${horaCurta(ultima.chamado_em)}`}
            </p>
          ) : (
            <span />
          )}
        </section>

        <aside className="flex flex-col justify-between gap-8 bg-[color:var(--color-cafe-900)] px-[3.5vw] py-[5vh]" aria-label="Próximas senhas">
          <div>
            <p className="text-[clamp(1.25rem,1.8vw,2.25rem)] font-semibold text-[color:var(--color-ouro-300)]">Próximas</p>
            {upcoming.length === 0 ? (
              <p className="mt-6 border-t border-white/10 pt-6 text-[clamp(1rem,1.6vw,2rem)] text-white/60">Ninguém esperando.</p>
            ) : (
              <ol className="m-0 mt-3 list-none p-0">
                {(tv?.proximas_detalhe?.length ? tv.proximas_detalhe : upcoming.map((n) => ({ numero_formatado: n, nome: null }))).map((p) => (
                  <li
                    key={p.numero_formatado}
                    className="flex items-baseline justify-between gap-4 border-t border-white/10 py-[2.2vh]"
                    data-testid="kiosk-proxima"
                  >
                    <span className="font-display text-[clamp(2.5rem,5.5vw,7rem)] leading-none tabular-nums">{p.numero_formatado}</span>
                    {p.nome && <span className="truncate text-[clamp(1rem,1.7vw,2.25rem)] font-semibold">{p.nome}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <QrDaPresencaNaTv giraId={giraId} />
        </aside>
      </main>
    </>
  );
}
