/**
 * /medium/avisos/[id] — um aviso da casa (AM-09).
 *
 * Abrir o aviso marca como lido (`POST /api/v1/medium/avisos/{id}/lido`) e atualiza o selo da
 * aba (o MediumProvider busca o `/medium/me` de novo). Impersonando, o suporte só lê: a marca de
 * leitura não é enviada (o backend também recusaria, D-06). Texto simples com links clicáveis
 * (`AvisoTexto`, sem HTML). Aviso inexistente, de outro público, agendado ou que saiu do ar → 404
 * com mensagem amigável.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Megaphone, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { AVISOS_INDISPONIVEIS, AvisoLeitura, dataCurtaBr } from '@/components/avisos/AvisoLeitura';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/services/api_client';

interface AvisoDetalhe {
  id: string;
  titulo: string;
  corpo: string;
  fixado: boolean;
  publicado_em: string;
  lido: boolean;
  lido_em?: string | null;
}

type Estado = 'carregando' | 'ok' | 'nao_encontrado' | 'indisponivel' | 'erro';

function impersonando(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem('impersonating'));
  } catch {
    return false;
  }
}

export default function MediumAvisoPage() {
  return (
    <MediumLayout title="Aviso">
      <Aviso />
    </MediumLayout>
  );
}

function Aviso() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { me, refresh } = useMedium();
  const ligado = !me || me.modulos.includes('avisos');
  const [aviso, setAviso] = useState<AvisoDetalhe | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id || !ligado) return;
    let alive = true;
    setEstado('carregando');
    apiClient
      .get<AvisoDetalhe>(`/api/v1/medium/avisos/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!alive) return;
        setAviso(res.data);
        setEstado('ok');
        if (!res.data.lido && !impersonando()) {
          apiClient
            .post(`/api/v1/medium/avisos/${encodeURIComponent(id)}/lido`)
            .then(() => refresh())
            .catch(() => {
              /* Sem rede: marca na próxima vez que abrir. */
            });
        }
      })
      .catch((err: { status?: number }) => {
        if (!alive) return;
        setEstado(
          err?.status === 404 || err?.status === 422
            ? 'nao_encontrado'
            : err?.status === 403
              ? 'indisponivel'
              : 'erro',
        );
      });
    return () => {
      alive = false;
    };
    // `refresh` é estável (useCallback no provider).
  }, [id, ligado, nonce, refresh]);

  const voltar = (
    <Link
      href="/medium/avisos"
      className="inline-flex min-h-12 items-center gap-1.5 self-start font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar aos avisos
    </Link>
  );

  let conteudo: React.ReactNode;
  if (!ligado || estado === 'indisponivel') {
    conteudo = (
      <EmptyState
        icon={<Megaphone />}
        title="Avisos indisponíveis"
        description={<span className="text-base">{AVISOS_INDISPONIVEIS}</span>}
      />
    );
  } else if (estado === 'nao_encontrado') {
    conteudo = (
      <EmptyState
        icon={<Megaphone />}
        title="Aviso não encontrado"
        description={<span className="text-base">Ele pode ter saído do ar. Veja os outros avisos da casa.</span>}
      />
    );
  } else if (estado === 'erro') {
    conteudo = (
      <EmptyState
        icon={<TriangleAlert />}
        title="Não conseguimos abrir o aviso"
        description="Confira a internet e tente de novo."
        action={
          <Button type="button" size="touch" className="font-bold" onClick={() => setNonce((n) => n + 1)}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (estado === 'carregando' || !aviso) {
    conteudo = (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando o aviso">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  } else {
    const casa = me?.terreiro.nome;
    conteudo = (
      <AvisoLeitura
        titulo={aviso.titulo}
        corpo={aviso.corpo}
        fixado={aviso.fixado}
        assinatura={`${casa ? `Direção da ${casa}` : 'Direção da casa'} · ${dataCurtaBr(aviso.publicado_em)}`}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-8">
      {voltar}
      {conteudo}
    </div>
  );
}
