/**
 * SessaoNoSite — o cabeçalho do site reconhece quem já está logado (pedido do Leonardo, 04/11/2026).
 *
 * - Deslogado: "Entrar" e "Criar conta grátis", como sempre.
 * - Logado com uma conta e um papel: o botão principal leva ao lugar certo — "Abrir o <terreiro>" (admin ou
 *   operador), "Abrir minha Área" (médium) ou "Abrir a plataforma" (super admin).
 * - Mais de um terreiro (outras contas do mesmo e-mail) ou mais de um papel (painel e Área): "Escolher onde
 *   entrar", que usa a desambiguação que já existe — o diálogo de trocar de terreiro (GET /auth/minhas-contas)
 *   ou /escolher-area.
 * - "Sair" à vista, ao lado do botão (e no menu do celular): POST /api/v1/auth/logout, limpa o `user` local e o
 *   cabeçalho volta a "Entrar" sem recarregar. Sob impersonação, "Sair" encerra a impersonação e o site não
 *   mostra o nome de quem é operado.
 *
 * A sessão é conferida no servidor (GET /api/v1/auth/profile, com skipAutoLogout): sessão vencida volta ao
 * estado deslogado, sem erro e sem mandar para o login. Enquanto confere, um espaço do mesmo tamanho (sem
 * piscar). O nome do terreiro vem da marca (/admin/tenant/branding) só para quem tem o painel; o médium puro
 * usa /medium/me e nunca chama /api/v1/admin/*.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, endImpersonation, type ApiRequestConfig } from '@/services/api_client';
import { hasAdminArea, hasMediumArea, ESCOLHER_AREA_PATH } from '@/lib/areas';
import type { UserProfile } from '@/hooks/useProfile';
import { useMinhasContas } from '@/hooks/useMinhasContas';
import { areasHint } from '@/components/auth/AccountChoiceList';
import { TrocarTerreiroDialog } from '@/components/auth/TrocarTerreiroDialog';

const SEM_AUTO_LOGOUT = { skipAutoLogout: true } as ApiRequestConfig;

function lerSessao(chave: string): string | null {
  try {
    return window.sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function temSessao(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(lerSessao('access_token')) || document.cookie.includes('auth_state=1') || Boolean(window.localStorage.getItem('user'));
  } catch {
    return false;
  }
}

/** Nome do terreiro guardado no login (o /auth/profile não traz o nome). */
function nomeDoTerreiro(): string | null {
  try {
    const u = JSON.parse(window.localStorage.getItem('user') || 'null') as { tenant_name?: string; tenantName?: string } | null;
    return u?.tenant_name || u?.tenantName || null;
  } catch {
    return null;
  }
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

type Estado =
  | { tipo: 'conferindo' }
  | { tipo: 'deslogado' }
  | { tipo: 'suporte' }
  | { tipo: 'logado'; perfil: UserProfile; terreiro: string | null };

export interface Destino {
  rotulo: string;
  href?: string;
  /** Mais de um terreiro: abre o diálogo de escolha. */
  escolherTerreiro?: boolean;
}

/** Para onde o botão principal leva, pelas áreas e pelas outras contas do mesmo e-mail. */
export function destinoDoBotao(perfil: UserProfile, terreiro: string | null, outrasContas: number): Destino {
  if (perfil.role === 'super_admin') return { rotulo: 'Abrir a plataforma', href: '/platform' };
  const admin = hasAdminArea(perfil);
  const medium = hasMediumArea(perfil);
  if (outrasContas > 0) return { rotulo: 'Escolher onde entrar', escolherTerreiro: true };
  if (admin && medium) return { rotulo: 'Escolher onde entrar', href: ESCOLHER_AREA_PATH };
  if (admin) return { rotulo: terreiro ? `Abrir o ${terreiro}` : 'Abrir o painel do terreiro', href: '/admin/dashboard' };
  return { rotulo: 'Abrir minha Área', href: '/medium' };
}

export function SessaoNoSite({ celular = false, aoNavegar }: { celular?: boolean; aoNavegar?: () => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'conferindo' });
  const [escolher, setEscolher] = useState(false);

  useEffect(() => {
    if (!temSessao()) {
      setEstado({ tipo: 'deslogado' });
      return;
    }
    if (lerSessao('impersonating')) {
      setEstado({ tipo: 'suporte' });
      return;
    }
    let vivo = true;
    apiClient
      .get<UserProfile>('/api/v1/auth/profile', SEM_AUTO_LOGOUT)
      .then(async (res) => {
        const perfil = res?.data;
        if (!perfil?.id) {
          if (vivo) setEstado({ tipo: 'deslogado' });
          return;
        }
        // O nome do terreiro: o painel lê da marca do terreiro; o médium puro, da própria Área (nunca
        // /api/v1/admin/* para quem não tem o painel). Sem resposta, vale o nome guardado no login.
        let terreiro = nomeDoTerreiro();
        try {
          if (perfil.role !== 'super_admin' && hasAdminArea(perfil)) {
            const b = await apiClient.get<{ tenant_nome?: string | null }>('/api/v1/admin/tenant/branding', SEM_AUTO_LOGOUT);
            terreiro = b?.data?.tenant_nome || terreiro;
          } else if (hasMediumArea(perfil)) {
            const m = await apiClient.get<{ terreiro?: { nome?: string } }>('/api/v1/medium/me', SEM_AUTO_LOGOUT);
            terreiro = m?.data?.terreiro?.nome || terreiro;
          }
        } catch {
          /* o nome é só um rótulo: segue com o que houver */
        }
        if (vivo) setEstado({ tipo: 'logado', perfil, terreiro });
      })
      .catch(() => vivo && setEstado({ tipo: 'deslogado' }));
    return () => {
      vivo = false;
    };
  }, []);

  const perfil = estado.tipo === 'logado' ? estado.perfil : null;
  const contas = useMinhasContas(perfil?.id, Boolean(perfil?.tenant_id) && perfil?.role !== 'super_admin');

  const sair = async () => {
    if (lerSessao('impersonating')) {
      endImpersonation();
      return;
    }
    try {
      await apiClient.post('/api/v1/auth/logout', undefined, SEM_AUTO_LOGOUT);
    } catch {
      /* os cookies podem já ter vencido: o cabeçalho volta a "Entrar" mesmo assim */
    }
    try {
      window.localStorage.removeItem('user');
    } catch {
      /* navegador sem localStorage */
    }
    setEstado({ tipo: 'deslogado' });
    aoNavegar?.();
  };

  const tam = celular ? 'touch' : 'default';
  const claro = 'border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white';
  const principal = 'bg-folha-600 font-bold text-white hover:bg-folha-700';
  const caixa = cn('flex items-center gap-2', celular && 'flex-col items-stretch');

  if (estado.tipo === 'conferindo') {
    return (
      <div className={caixa} aria-hidden data-testid="sessao-conferindo">
        <Skeleton className={cn('bg-white/10', celular ? 'h-12 w-full' : 'h-9 w-20')} />
        <Skeleton className={cn('bg-white/10', celular ? 'h-12 w-full' : 'h-9 w-40')} />
      </div>
    );
  }

  if (estado.tipo === 'deslogado') {
    return (
      <div className={caixa}>
        <Button asChild variant={celular ? 'outline' : 'ghost'} size={tam} className={celular ? claro : 'text-areia-100 hover:bg-white/10 hover:text-white'}>
          <Link href="/login" onClick={aoNavegar}>
            Entrar
          </Link>
        </Button>
        <Button asChild size={tam} className={principal}>
          <Link href="/cadastro" onClick={aoNavegar}>
            Criar conta grátis
          </Link>
        </Button>
      </div>
    );
  }

  const botaoSair = (
    <Button type="button" variant={celular ? 'outline' : 'ghost'} size={tam} className={celular ? claro : 'text-areia-100 hover:bg-white/10 hover:text-white'} onClick={() => void sair()}>
      Sair <LogOut aria-hidden />
    </Button>
  );

  // Impersonação: o site não mostra quem é operado; "Sair" encerra a impersonação.
  if (estado.tipo === 'suporte') {
    return (
      <div className={caixa}>
        {botaoSair}
        <Button asChild size={tam} className={principal}>
          <Link href="/admin/dashboard" onClick={aoNavegar}>
            Voltar ao painel (suporte)
          </Link>
        </Button>
      </div>
    );
  }

  const nome = estado.perfil.full_name || estado.perfil.username || estado.perfil.email;
  const destino = destinoDoBotao(estado.perfil, estado.terreiro, contas.length);
  const hint = areasHint({ admin: hasAdminArea(estado.perfil), medium: hasMediumArea(estado.perfil) });

  return (
    <div className={caixa} data-testid="sessao-logada">
      {!celular && (
        <span
          aria-hidden
          title={`${nome} · ${estado.perfil.email}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ouro-300 text-xs font-bold text-cafe-950"
        >
          {iniciais(nome)}
        </span>
      )}
      {celular && (
        <p className="text-sm text-areia-200">
          Entrou como <strong className="text-white">{nome}</strong>
        </p>
      )}
      {botaoSair}
      {destino.escolherTerreiro ? (
        <Button type="button" size={tam} className={principal} onClick={() => setEscolher(true)}>
          {destino.rotulo}
        </Button>
      ) : (
        <Button asChild size={tam} className={principal}>
          <Link href={destino.href ?? '/'} onClick={aoNavegar}>
            {destino.rotulo}
          </Link>
        </Button>
      )}
      {destino.escolherTerreiro && (
        <TrocarTerreiroDialog
          open={escolher}
          onOpenChange={setEscolher}
          contas={contas}
          atual={{
            nome: estado.terreiro ?? 'Seu terreiro',
            hint,
            href: hasAdminArea(estado.perfil) && hasMediumArea(estado.perfil) ? ESCOLHER_AREA_PATH : hasAdminArea(estado.perfil) ? '/admin/dashboard' : '/medium',
          }}
        />
      )}
    </div>
  );
}

export default SessaoNoSite;
