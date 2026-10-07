/**
 * /medium/avisos — Avisos da casa na Área do Médium (AM-09; "Avisos" na tela, D-16).
 *
 * Lista o que a direção publicou para o público do médium: fixados primeiro, depois do mais novo
 * para o mais antigo, com o ponto de "não lido" e a etiqueta "Fixado". Tocar abre o aviso
 * (`/medium/avisos/[id]`), que marca como lido. Só chama `GET /api/v1/medium/avisos`.
 * Módulo desligado pela casa (AM-10) → aviso neutro, sem chamar a API.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Megaphone, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { AVISOS_INDISPONIVEIS, FixadoBadge, dataCurtaBr } from '@/components/avisos/AvisoLeitura';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

export interface AvisoItem {
  id: string;
  titulo: string;
  resumo: string;
  fixado: boolean;
  publicado_em: string;
  lido: boolean;
}

export interface AvisosResponse {
  itens: AvisoItem[];
  nao_lidos: number;
}

export default function MediumAvisosPage() {
  return (
    <MediumLayout title="Avisos">
      <Avisos />
    </MediumLayout>
  );
}

function Avisos() {
  const { me } = useMedium();
  const ligado = !me || me.modulos.includes('avisos');
  const [data, setData] = useState<AvisosResponse | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'indisponivel'>('carregando');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!ligado) return;
    let alive = true;
    setEstado('carregando');
    apiClient
      .get<AvisosResponse>('/api/v1/medium/avisos')
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setEstado('ok');
      })
      .catch((err: { status?: number }) => {
        if (!alive) return;
        setEstado(err?.status === 403 ? 'indisponivel' : 'erro');
      });
    return () => {
      alive = false;
    };
  }, [ligado, nonce]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-6 pb-8">
      <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">Avisos</h1>
      {!ligado || estado === 'indisponivel' ? (
        <EmptyState
          className="flex-1"
          icon={<Megaphone />}
          title="Avisos indisponíveis"
          description={<span className="text-base">{AVISOS_INDISPONIVEIS}</span>}
        />
      ) : estado === 'erro' ? (
        <EmptyState
          className="flex-1"
          icon={<TriangleAlert />}
          title="Não conseguimos carregar os avisos"
          description="Confira a internet e tente de novo."
          action={
            <Button type="button" size="touch" className="font-bold" onClick={() => setNonce((n) => n + 1)}>
              Tentar de novo
            </Button>
          }
        />
      ) : estado === 'carregando' || !data ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando os avisos">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : data.itens.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<Megaphone />}
          title="Nenhum aviso por enquanto"
          description={<span className="text-base">Quando a direção da casa mandar um aviso, ele aparece aqui.</span>}
        />
      ) : (
        <>
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-label="Avisos da casa">
            {data.itens.map((a) => (
              <li key={a.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/medium/avisos/${a.id}`}
                  data-testid="aviso-item"
                  className="flex min-h-[72px] items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  {a.lido ? (
                    <span aria-hidden className="w-2.5 shrink-0" />
                  ) : (
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-primary"
                      role="img"
                      aria-label="Não lido"
                      data-testid="aviso-nao-lido"
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <strong className={cn('text-base leading-snug', a.lido ? 'font-semibold' : 'font-bold')}>
                      {a.titulo}
                    </strong>
                    {a.resumo && <span className="line-clamp-2 text-sm text-muted-foreground">{a.resumo}</span>}
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {a.fixado && <FixadoBadge />}
                      Publicado em {dataCurtaBr(a.publicado_em)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Os avisos são da direção da casa e só aparecem para a corrente.
          </p>
        </>
      )}
    </div>
  );
}
