/**
 * /medium/estudos/[id] — um estudo, ponto cantado ou vídeo da casa (AM-21).
 *
 * `GET /api/v1/medium/materiais/{id}`. Texto simples com links clicáveis (`AvisoTexto`, nunca
 * HTML). Vídeo do YouTube toca aqui mesmo (`youtube-nocookie`, id validado no backend — o
 * `frame-src` do nginx já libera); outro link (Drive, site, áudio) vira o botão "Abrir" em outra
 * aba. Material inexistente, de outro público, rascunho ou arquivado → 404 com mensagem amigável.
 * Sem os estudos no plano → aviso neutro.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, BookOpen, ExternalLink, TriangleAlert } from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { MediumPage } from '@/components/medium/ui';
import { AvisoTexto } from '@/components/avisos/AvisoLeitura';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ESTUDOS_INDISPONIVEIS,
  FONTE_LABEL,
  TIPO_LABEL,
  linkSeguro,
  youtubeEmbedUrl,
  type MaterialFonte,
  type MaterialTipo,
} from '@/constants/materiais';
import { apiClient } from '@/services/api_client';

interface MaterialDetalhe {
  id: string;
  titulo: string;
  tipo: MaterialTipo;
  categoria: string;
  url?: string | null;
  fonte?: MaterialFonte | null;
  youtube_id?: string | null;
  texto?: string | null;
}

type Estado = 'carregando' | 'ok' | 'nao_encontrado' | 'indisponivel' | 'erro';

export default function MediumEstudoPage() {
  return (
    <MediumLayout title="Estudo">
      <Estudo />
    </MediumLayout>
  );
}

function Estudo() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { me } = useMedium();
  const liberado = !me || me.estudos === true;
  const [material, setMaterial] = useState<MaterialDetalhe | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id || !liberado) return;
    let alive = true;
    setEstado('carregando');
    apiClient
      .get<MaterialDetalhe>(`/api/v1/medium/materiais/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!alive) return;
        setMaterial(res.data);
        setEstado('ok');
      })
      .catch((err: { status?: number }) => {
        if (!alive) return;
        setEstado(
          err?.status === 404 || err?.status === 422
            ? 'nao_encontrado'
            : err?.status === 403 || err?.status === 402
              ? 'indisponivel'
              : 'erro',
        );
      });
    return () => {
      alive = false;
    };
  }, [id, liberado, nonce]);

  const voltar = (
    <Link
      href="/medium/estudos"
      className="-my-2 inline-flex min-h-12 items-center gap-1.5 self-start text-sm font-semibold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar aos estudos
    </Link>
  );

  let conteudo: React.ReactNode;
  if (!liberado || estado === 'indisponivel') {
    conteudo = (
      <EmptyState
        className="flex-1"
        icon={<BookOpen />}
        title="Estudos indisponíveis"
        description={<span className="text-base">{ESTUDOS_INDISPONIVEIS}</span>}
      />
    );
  } else if (estado === 'nao_encontrado') {
    conteudo = (
      <EmptyState
        className="flex-1"
        icon={<BookOpen />}
        title="Este estudo não está mais aqui"
        description={<span className="text-base">A direção da casa pode ter tirado ou trocado. Veja a lista de estudos.</span>}
      />
    );
  } else if (estado === 'erro') {
    conteudo = (
      <EmptyState
        className="flex-1"
        icon={<TriangleAlert />}
        title="Não conseguimos abrir o estudo"
        description="Confira a internet e tente de novo."
        action={
          <Button type="button" size="touch" className="font-semibold" onClick={() => setNonce((n) => n + 1)}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (estado === 'carregando' || !material) {
    conteudo = (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando o estudo">
        <Skeleton className="h-8 w-3/4 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  } else {
    const embed = youtubeEmbedUrl(material.youtube_id);
    const href = linkSeguro(material.url);
    conteudo = (
      <article className="flex flex-col gap-3.5">
        <p className="text-sm font-medium text-muted-foreground">{material.categoria}</p>
        <h1 className="-mt-2 text-2xl leading-tight font-semibold tracking-tight">{material.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {material.tipo === 'link' && material.fonte ? FONTE_LABEL[material.fonte] : TIPO_LABEL[material.tipo]}
        </p>
        {embed && (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
            <iframe
              src={embed}
              title={`Vídeo: ${material.titulo}`}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 size-full border-0"
              data-testid="estudo-video"
            />
          </div>
        )}
        {material.texto && <AvisoTexto texto={material.texto} className="text-[1.0625rem] leading-relaxed" />}
        {href && !embed && (
          <Button asChild size="touch" className="self-start font-semibold">
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" data-testid="estudo-abrir">
              {material.tipo === 'ponto' ? 'Ouvir o ponto' : 'Abrir'}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </article>
    );
  }

  return (
    <MediumPage className="flex-1">
      {voltar}
      {conteudo}
    </MediumPage>
  );
}
