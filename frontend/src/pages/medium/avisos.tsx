/**
 * /medium/avisos — Avisos da casa na Área do Médium (AM-09; "Avisos" na tela, D-16).
 *
 * Lista o que a direção publicou para o público do médium: fixados primeiro, depois do mais novo
 * para o mais antigo, com o ponto de "não lido" e a etiqueta "Fixado". Tocar abre o aviso
 * (`/medium/avisos/[id]`), que marca como lido. Só chama `GET /api/v1/medium/avisos`.
 * Módulo desligado pela casa (AM-10) → aviso neutro, sem chamar a API.
 */
import React, { useEffect, useState } from 'react';
import { Megaphone, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { IconTile, MediumList, MediumListItem, MediumPage, MediumPageHeader } from '@/components/medium/ui';
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
    <MediumPage className="flex-1">
      <MediumPageHeader
        title="Avisos"
        description={
          data && data.nao_lidos > 0
            ? data.nao_lidos === 1
              ? '1 aviso que você ainda não leu.'
              : `${data.nao_lidos} avisos que você ainda não leu.`
            : 'Recados e orientações da casa.'
        }
      />
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
            <Button type="button" size="touch" className="font-semibold" onClick={() => setNonce((n) => n + 1)}>
              Tentar de novo
            </Button>
          }
        />
      ) : estado === 'carregando' || !data ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando os avisos">
          <Skeleton className="h-56 w-full rounded-xl" />
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
          <MediumList aria-label="Avisos da casa">
            {data.itens.map((a) => (
              <MediumListItem
                key={a.id}
                href={`/medium/avisos/${a.id}`}
                data-testid="aviso-item"
                className="items-start"
                media={
                  <span className="relative">
                    <IconTile icon={Megaphone} tom={a.lido ? 'neutro' : 'marca'} />
                    {!a.lido && (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card"
                        role="img"
                        aria-label="Não lido"
                        data-testid="aviso-nao-lido"
                      />
                    )}
                  </span>
                }
                title={<strong className={cn(a.lido ? 'font-medium' : 'font-semibold')}>{a.titulo}</strong>}
                description={a.resumo ? <span className="line-clamp-2">{a.resumo}</span> : undefined}
                meta={
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {a.fixado && <FixadoBadge />}
                    Publicado em {dataCurtaBr(a.publicado_em)}
                  </span>
                }
              />
            ))}
          </MediumList>
          <p className="text-sm text-muted-foreground">
            Os avisos são da direção da casa e só aparecem para a corrente.
          </p>
        </>
      )}
    </MediumPage>
  );
}
