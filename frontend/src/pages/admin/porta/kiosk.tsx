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
 * Presença (AM-28): com o modo "Cheguei com QR" e a janela aberta, o QR do dia aparece no canto
 * (`QrPresenca` → `GET /admin/atividades/da-gira/{id}/qr`): só um link da Área com o código curto,
 * nenhum dado de médium. Precisa da Área liberada e da presença no plano.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api_client';
import { pickTodayGira } from '@/components/admin/GiraContext';
import { PermissionDenied } from '@/components/gates';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/useSubscription';
import { QrPresenca } from '@/components/admin/presenca/QrPresenca';

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
}
export interface DoorTv {
  gira_nome: string;
  atual: TvSenha | null;
  proximas: string[];
  ultima_chamada: TvSenha | null;
}

function horaCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
      className="absolute right-4 bottom-16 w-[min(34vw,320px)] md:right-8"
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
      setTv(res.data ?? null);
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
  useEffect(() => {
    if (!giraId) return;
    const t = setInterval(loadQueue, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [giraId, loadQueue]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
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
      <main
        data-testid="kiosk"
        className="flex min-h-screen flex-col items-center justify-center bg-[#05070f] px-6 py-10 text-white md:px-12"
      >
        <header className="absolute inset-x-0 top-0 flex items-start justify-between px-6 py-5 text-lg text-white/60 md:px-10 md:text-2xl">
          <span className="truncate pr-4">{giraNome}</span>
          <span className="tabular-nums" aria-label="Hora atual">
            {clock}
          </span>
        </header>

        {loading ? (
          <Loader2 className="size-12 animate-spin text-white/80" aria-label="Carregando" />
        ) : !giraId ? (
          <p className="text-3xl text-white/70">Nenhuma gira hoje.</p>
        ) : (
          <>
            <p className="mb-2 text-xl tracking-[0.35em] text-white/70 uppercase md:text-3xl">Senha</p>
            <p
              data-testid="kiosk-numero"
              className="font-mono text-[6.5rem] leading-none font-black text-[#c7d2fe] tabular-nums sm:text-[10rem] md:text-[16rem]"
              aria-live="polite"
            >
              {numeroAtual ?? '—'}
            </p>
            {atual?.nome && (
              <p className="mt-4 max-w-[90vw] truncate text-3xl font-bold md:text-6xl" data-testid="kiosk-nome">
                {atual.nome}
              </p>
            )}
            {!atual && (
              <p className="mt-4 text-2xl text-white/60 md:text-4xl">Aguardando a próxima pessoa chegar</p>
            )}

            {upcoming.length > 0 && (
              <section className="mt-12 flex flex-col items-center gap-3 md:mt-20" aria-label="Próximas senhas">
                <p className="text-lg tracking-[0.3em] text-white/50 uppercase md:text-2xl">Próximas</p>
                <ol className="flex flex-wrap justify-center gap-6 md:gap-12">
                  {upcoming.map((numero) => (
                    <li
                      key={numero}
                      className="font-mono text-4xl font-bold text-white/70 tabular-nums md:text-7xl"
                      data-testid="kiosk-proxima"
                    >
                      {numero}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <QrDaPresencaNaTv giraId={giraId} />

            {ultima && (
              <p
                className="absolute inset-x-0 bottom-0 px-6 py-5 text-center text-lg text-white/50 md:text-2xl"
                data-testid="kiosk-ultima"
              >
                Última chamada: <span className="font-mono font-bold tabular-nums">{ultima.numero_formatado}</span>
                {horaCurta(ultima.chamado_em) && ` às ${horaCurta(ultima.chamado_em)}`}
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
