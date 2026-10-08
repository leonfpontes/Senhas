/**
 * /escolher-area — quem tem as duas áreas escolhe para onde ir depois do login (AM-04, §6.4).
 *
 * Dois cartões grandes ("Área do Médium" e "Painel do terreiro") com o nome e a marca do
 * terreiro (vindos de `GET /api/v1/medium/me`, que essa conta pode chamar), na identidade da
 * Área (paleta terra + cor do terreiro). "Lembrar minha escolha neste aparelho" vem marcado
 * (D-04) e grava `girahub:area:{userId}` no localStorage; os dois menus têm "Trocar de área".
 * Evento `area_escolhida {area, lembrada}`. Quem não tem as duas áreas é mandado para a sua.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { ChevronRight, LayoutDashboard, Loader2, UserRound, type LucideIcon } from 'lucide-react';
import { fraunces } from '@/components/landing/fonts';
import { applyMediumBrand, type MediumMe } from '@/components/medium/MediumProvider';
import { MediumFaixa } from '@/components/medium/MediumFaixa';
import { useAreaClara } from '@/components/medium/MediumLayout';
import { TerreiroEmblem } from '@/components/medium/TerreiroEmblem';
import { primeiroNome } from '@/components/medium/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/hooks/useProfile';
import {
  chooseArea,
  hasAdminArea,
  hasMediumArea,
  routeAfterLogin,
  type AreaChoice,
} from '@/lib/areas';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api_client';

function AreaCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 w-full items-center gap-4 rounded-[1.25rem] border border-border bg-card px-4 py-4 text-left text-card-foreground shadow-sm outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-brand">
        <Icon className="size-7" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="font-display text-xl leading-tight font-semibold">{title}</strong>
        <span className="text-base text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export default function EscolherAreaPage() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [me, setMe] = useState<MediumMe | null>(null);
  const [lembrar, setLembrar] = useState(true);
  useAreaClara();

  const duas = hasAdminArea(profile) && hasMediumArea(profile);
  const destino = !profile
    ? loading
      ? null
      : '/login'
    : profile.areas && !duas
      ? routeAfterLogin(profile)
      : null;

  useEffect(() => {
    if (destino) void router.replace(destino);
  }, [destino, router]);

  useEffect(() => {
    if (!duas) return;
    let alive = true;
    apiClient
      .get<MediumMe>('/api/v1/medium/me')
      .then((res) => {
        if (!alive) return;
        setMe(res.data);
        applyMediumBrand(res.data.marca);
      })
      .catch(() => {
        /* sem a marca, a tela segue com o nome da conta */
      });
    return () => {
      alive = false;
    };
  }, [duas]);

  const escolher = (area: AreaChoice) => {
    void router.push(chooseArea(profile?.id, area, { lembrar, origem: 'escolha' }));
  };

  const terreiro = me?.terreiro.nome ?? profile?.tenant_name ?? '';
  const nome = primeiroNome(profile?.full_name || me?.nome);

  return (
    <div
      className={cn(
        fraunces.variable,
        'medium-terra flex min-h-dvh flex-col bg-background text-foreground',
      )}
    >
      <Head>
        <title>Para onde você quer ir? · GiraHub</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {!duas ? (
        <div
          className="flex flex-1 items-center justify-center"
          role="status"
          aria-label="Carregando"
        >
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <>
          <MediumFaixa className="pt-8 pb-8">
            <div className="mx-auto flex max-w-xl flex-col gap-4">
              <p className="flex items-center gap-2.5 text-base font-bold text-muted-foreground">
                <TerreiroEmblem nome={terreiro} logoUrl={me?.marca.logo_url} className="size-9" />
                <span className="truncate">{terreiro}</span>
              </p>
              <h1 className="font-display text-[1.9rem] leading-[1.1] font-bold tracking-tight">
                {nome ? `Olá, ${nome}. Para onde você quer ir?` : 'Para onde você quer ir?'}
              </h1>
            </div>
          </MediumFaixa>
          <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-10">
            <div className="flex flex-col gap-3">
              <AreaCard
                icon={UserRound}
                title="Área do Médium"
                description="Agenda, avisos e mensalidade"
                onClick={() => escolher('medium')}
              />
              <AreaCard
                icon={LayoutDashboard}
                title="Painel do terreiro"
                description="Giras, senhas e gestão"
                onClick={() => escolher('admin')}
              />
            </div>
            <div className="flex min-h-12 items-center gap-3">
              <Checkbox
                id="lembrar-area"
                checked={lembrar}
                onCheckedChange={(v) => setLembrar(v === true)}
                className="size-6"
              />
              <Label htmlFor="lembrar-area" className="cursor-pointer text-base font-normal">
                Lembrar minha escolha neste aparelho
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Você pode trocar a qualquer hora pelo menu do perfil.
            </p>
          </main>
        </>
      )}
    </div>
  );
}
