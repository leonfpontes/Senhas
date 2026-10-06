/**
 * Unified per-tenant senha link — always resolves to the next/active gira.
 * Used by /public/[tenant] (legacy emission URL, retired to a redirect),
 * /public/[tenant]/senha and /public/[tenant]/associado, which are meant to
 * be shared once and keep working across giras (unlike the per-gira
 * /public/gira/[id] link, which stays pointed at one gira).
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CalendarX2, SearchX } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { apiClient } from '@/services/api_client';
import { Button } from '@/components/ui/button';
import { PublicShell, PublicLoading, PublicNotice } from '@/components/public';

interface UnifiedGiraRedirectProps {
  tipo: 'comum' | 'associado';
}

// next_gira.py emite dois 404 distintos: "Tenant '<slug>' not found" (tenant
// inexistente) e "No active gira scheduled for this tenant" (existe, mas sem
// gira com emissão) — estados diferentes para o visitante. O backend ainda não
// expõe um error_code estável, então distinguimos pela mensagem: só o caso de
// tenant ausente contém "not found". Casar a ausência dessa marca (em vez de um
// startsWith posicional) resiste a mudanças de texto — ver o backend task de
// error codes. Qualquer 404 sem "not found" recai em no-gira, que é o genérico
// seguro (não afirma que o terreiro não existe).
const TENANT_MISSING_RE = /not found/i;
type ErrorKind = 'tenant-missing' | 'no-gira' | 'error';

/** "tenda-pai-joaquim" → "Tenda Pai Joaquim" — só para o texto de carregamento, antes de conhecer o nome real. */
export function humanizeSlug(slug: string | undefined): string {
  if (!slug) return 'terreiro';
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export default function UnifiedGiraRedirect({ tipo }: UnifiedGiraRedirectProps) {
  const router = useRouter();
  const tenantSlug = router.query.tenant as string;

  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);

  const resolveNextGira = useCallback(async () => {
    if (!tenantSlug) return;
    setErrorKind(null);
    try {
      const res = await apiClient.get(
        `/api/v1/public/next-gira?tenant_slug=${encodeURIComponent(tenantSlug)}&tipo=${tipo}`
      );
      const giraId = res.data.id;
      const query = tipo === 'associado' ? '?tipo=associado' : '';
      router.replace(`/public/gira/${giraId}${query}`);
    } catch (err) {
      const { status, detail } =
        err && typeof err === 'object'
          ? (err as { status?: number; detail?: unknown })
          : { status: undefined, detail: undefined };
      if (status === 404) {
        if (typeof detail === 'string' && TENANT_MISSING_RE.test(detail)) {
          setErrorKind('tenant-missing');
        } else {
          setErrorKind('no-gira');
        }
      } else {
        // 500 / timeout / rede: ponto de entrada público sem auth — registrar
        // para o Sentry, senão a falha some sem rastro no cliente
        setErrorKind('error');
        Sentry.captureException(err, {
          tags: { area: 'public-emission', slug: tenantSlug, tipo },
        });
        // eslint-disable-next-line no-console
        console.error('Erro ao resolver a próxima gira:', err);
      }
    }
  }, [tenantSlug, tipo, router]);

  useEffect(() => { resolveNextGira(); }, [resolveNextGira]);

  const nome = humanizeSlug(tenantSlug);

  if (errorKind === 'tenant-missing') {
    return (
      <PublicShell title="Terreiro não encontrado" hideHeader noindex>
        <PublicNotice
          tone="warning"
          icon={<SearchX />}
          title="Terreiro não encontrado"
          description="Não encontramos nenhum terreiro neste endereço. Confira se o link está correto ou fale com quem o enviou."
        />
      </PublicShell>
    );
  }

  if (errorKind === 'no-gira') {
    return (
      <PublicShell title={`Sem emissão aberta · ${nome}`} hideHeader>
        <PublicNotice
          tone="info"
          icon={<CalendarX2 />}
          title="Nenhuma gira com emissão aberta"
          description={`No momento não há emissão de senhas${tipo === 'associado' ? ' de associado' : ''} disponível. A agenda do terreiro mostra as próximas datas.`}
          actions={
            <>
              <Button asChild size="touch" className="w-full">
                <Link href={`/${encodeURIComponent(tenantSlug)}`}>Ver agenda do terreiro</Link>
              </Button>
              <Button type="button" variant="outline" size="touch" className="w-full" onClick={resolveNextGira}>
                Atualizar
              </Button>
            </>
          }
        />
      </PublicShell>
    );
  }

  if (errorKind === 'error') {
    return (
      <PublicShell title="Erro ao carregar" hideHeader>
        <PublicNotice
          tone="error"
          title="Erro ao carregar"
          description="Não foi possível carregar as informações. Verifique sua conexão e tente novamente."
          actions={
            <Button type="button" size="touch" className="w-full" onClick={resolveNextGira}>
              Tentar novamente
            </Button>
          }
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell title={`Buscando a próxima gira · ${nome}`} hideHeader>
      <PublicLoading label={`Buscando a próxima gira de ${nome}…`} />
    </PublicShell>
  );
}
