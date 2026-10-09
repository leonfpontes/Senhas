/**
 * /medium/estudos — Estudos e documentos da casa na Área do Médium (AM-21).
 *
 * `GET /api/v1/medium/materiais`: o que a direção liberou para o público do médium, por categoria
 * (na ordem da casa), com busca por título, categoria ou resumo. Link comum (Drive, site) abre em
 * outra aba sem passar a página de origem; texto, ponto cantado e vídeo do YouTube abrem a tela
 * do material (`/medium/estudos/[id]`). "Cursos da casa": cursos presenciais abertos com o link
 * da inscrição pública.
 *
 * Entrada no menu da Área (cabeçalho e Perfil) só com `me.estudos` (plano `biblioteca_medium`).
 * Sem ele, ou 403 da API → aviso neutro, sem oferta de plano ao médium. Só chama `/api/v1/medium/*`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Music,
  PlayCircle,
  Search,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { MediumLayout } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { MediumList, MediumPage, MediumPageHeader, MediumSection } from '@/components/medium/ui';
import { dataCurtaBr } from '@/components/avisos/AvisoLeitura';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ESTUDOS_INDISPONIVEIS,
  FONTE_LABEL,
  TIPO_LABEL,
  linkSeguro,
  type MaterialFonte,
  type MaterialTipo,
} from '@/constants/materiais';
import { apiClient } from '@/services/api_client';

export interface MaterialItem {
  id: string;
  titulo: string;
  tipo: MaterialTipo;
  categoria: string;
  resumo: string;
  url?: string | null;
  fonte?: MaterialFonte | null;
  youtube_id?: string | null;
}

export interface CursoAberto {
  id: string;
  titulo: string;
  resumo: string;
  data_inicio: string;
  data_fim?: string | null;
  local?: string | null;
  vagas_restantes?: number | null;
  inscricao_path: string;
}

export interface MateriaisResponse {
  itens: MaterialItem[];
  categorias: string[];
  cursos: CursoAberto[];
}

export default function MediumEstudosPage() {
  return (
    <MediumLayout title="Estudos">
      <Estudos />
    </MediumLayout>
  );
}

/** Sem acento e minúsculo, para a busca. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Abre em outra aba (link comum) ou na tela do material (texto, ponto, vídeo). */
function abreDireto(m: MaterialItem): boolean {
  return m.tipo === 'link' && !m.youtube_id && Boolean(linkSeguro(m.url));
}

function iconeDo(m: MaterialItem): LucideIcon {
  if (m.tipo === 'ponto') return Music;
  if (m.youtube_id) return PlayCircle;
  if (m.tipo === 'texto') return FileText;
  return ExternalLink;
}

function detalheDo(m: MaterialItem): string {
  if (m.tipo === 'link') return m.fonte ? FONTE_LABEL[m.fonte] : TIPO_LABEL.link;
  return TIPO_LABEL[m.tipo];
}

const ITEM_CLASS =
  'flex min-h-16 items-center gap-3.5 px-4 py-3.5 outline-none hover:bg-accent/50 active:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset';

function Item({ m }: { m: MaterialItem }) {
  const Icon = iconeDo(m);
  const corpo = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-base leading-snug font-semibold">{m.titulo}</strong>
        {m.resumo && <span className="line-clamp-2 text-sm text-muted-foreground">{m.resumo}</span>}
        <span className="text-sm text-muted-foreground">{detalheDo(m)}</span>
      </span>
    </>
  );
  const href = linkSeguro(m.url);
  if (abreDireto(m) && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={ITEM_CLASS}
        data-testid="material-item"
        aria-label={`${m.titulo} (abre em outra aba)`}
      >
        {corpo}
        <ExternalLink className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </a>
    );
  }
  return (
    <Link href={`/medium/estudos/${m.id}`} className={ITEM_CLASS} data-testid="material-item">
      {corpo}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Cursos({ cursos }: { cursos: CursoAberto[] }) {
  if (cursos.length === 0) return null;
  return (
    <MediumSection id="cursos-da-casa" title="Cursos da casa">
      <ul className="flex flex-col gap-3">
        {cursos.map((c) => {
          const esgotado = c.vagas_restantes === 0;
          return (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs"
              data-testid="curso-item"
            >
              <span className="flex items-start gap-3">
                <GraduationCap className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span className="flex min-w-0 flex-col gap-1">
                  <strong className="text-base leading-snug font-semibold">{c.titulo}</strong>
                  {c.resumo && <span className="text-sm text-muted-foreground">{c.resumo}</span>}
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden />
                    {c.data_fim
                      ? `De ${dataCurtaBr(c.data_inicio)} a ${dataCurtaBr(c.data_fim)}`
                      : `Começa em ${dataCurtaBr(c.data_inicio)}`}
                    {c.local ? ` · ${c.local}` : ''}
                  </span>
                  {typeof c.vagas_restantes === 'number' && (
                    <span className="text-sm font-semibold">
                      {esgotado
                        ? 'Vagas esgotadas'
                        : c.vagas_restantes === 1
                          ? 'Resta 1 vaga'
                          : `Restam ${c.vagas_restantes} vagas`}
                    </span>
                  )}
                </span>
              </span>
              {!esgotado && (
                <Button asChild size="touch" className="self-start font-semibold">
                  <a href={c.inscricao_path} target="_blank" rel="noopener noreferrer">
                    Fazer a inscrição
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </MediumSection>
  );
}

function Estudos() {
  const { me } = useMedium();
  const liberado = !me || me.estudos === true;
  const [data, setData] = useState<MateriaisResponse | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'indisponivel'>('carregando');
  const [nonce, setNonce] = useState(0);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!liberado) return;
    let alive = true;
    setEstado('carregando');
    apiClient
      .get<MateriaisResponse>('/api/v1/medium/materiais')
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setEstado('ok');
      })
      .catch((err: { status?: number }) => {
        if (!alive) return;
        setEstado(err?.status === 403 || err?.status === 402 ? 'indisponivel' : 'erro');
      });
    return () => {
      alive = false;
    };
  }, [liberado, nonce]);

  const porCategoria = useMemo(() => {
    if (!data) return [];
    const termo = normalizar(busca.trim());
    const itens = termo
      ? data.itens.filter((m) => normalizar(`${m.titulo} ${m.categoria} ${m.resumo}`).includes(termo))
      : data.itens;
    return data.categorias
      .map((categoria) => ({ categoria, itens: itens.filter((m) => m.categoria === categoria) }))
      .filter((g) => g.itens.length > 0);
  }, [data, busca]);

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
  } else if (estado === 'erro') {
    conteudo = (
      <EmptyState
        className="flex-1"
        icon={<TriangleAlert />}
        title="Não conseguimos carregar os estudos"
        description="Confira a internet e tente de novo."
        action={
          <Button type="button" size="touch" className="font-semibold" onClick={() => setNonce((n) => n + 1)}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (estado === 'carregando' || !data) {
    conteudo = (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando os estudos">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  } else {
    conteudo = (
      <>
        {data.itens.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="Nenhum estudo por enquanto"
            description={
              <span className="text-base">Quando a direção da casa liberar um estudo ou ponto, ele aparece aqui.</span>
            }
          />
        ) : (
          <>
            <label className="relative block">
              <span className="sr-only">Buscar nos estudos</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título ou categoria"
                className="h-12 pl-10 text-base"
                data-testid="estudos-busca"
              />
            </label>
            {porCategoria.length === 0 ? (
              <p className="text-base text-muted-foreground" role="status">
                Nada encontrado para &ldquo;{busca.trim()}&rdquo;.
              </p>
            ) : (
              porCategoria.map((g, i) => (
                <MediumSection key={g.categoria} id={`estudos-cat-${i}`} title={g.categoria}>
                  <MediumList aria-label={g.categoria}>
                    {g.itens.map((m) => (
                      <Item key={m.id} m={m} />
                    ))}
                  </MediumList>
                </MediumSection>
              ))
            )}
          </>
        )}
        <Cursos cursos={data.cursos ?? []} />
        <p className="text-sm text-muted-foreground">Os estudos são da direção da casa e só aparecem para a corrente.</p>
      </>
    );
  }

  return (
    <MediumPage className="flex-1">
      <MediumPageHeader title="Estudos" />
      {conteudo}
    </MediumPage>
  );
}
