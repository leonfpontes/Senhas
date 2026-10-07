/**
 * /medium/perfil — Perfil da Área do Médium (AM-06). Nome, "Ícone na tela inicial" (passo
 * guiado, D-23), "Trocar de área" (só com as duas áreas) e "Sair". "Meus dados" e "Minhas
 * presenças" entram com o AM-13 e o AM-17.
 */
import React from 'react';
import { ArrowLeftRight, ChevronRight, LogOut, Smartphone, type LucideIcon } from 'lucide-react';
import { MediumLayout, useMediumShell } from '@/components/medium/MediumLayout';
import { useMedium } from '@/components/medium/MediumProvider';
import { GiraHubLogo } from '@/components/landing/GiraHubLogo';
import { cn } from '@/lib/utils';

export default function MediumPerfilPage() {
  return (
    <MediumLayout title="Perfil">
      <Perfil />
    </MediumLayout>
  );
}

function Item({
  icon: Icon,
  title,
  description,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-base leading-snug">{title}</strong>
          {description && <span className="text-sm text-muted-foreground">{description}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

function Perfil() {
  const { me } = useMedium();
  const { openInstall, goToPainel, sair } = useMediumShell();
  const nome = me?.nome ?? '';
  const iniciais =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '·';

  return (
    <>
      <section className="relative flex items-center gap-4 bg-cafe-950 px-4 pt-6 pb-7 text-areia-100">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary font-display text-2xl font-bold text-primary-foreground ring-[3px] ring-ouro-400"
        >
          {iniciais}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-bold text-white">{nome}</h1>
          <p className="text-base text-areia-200">
            Médium da corrente{me ? ` · ${me.terreiro.nome}` : ''}
          </p>
        </div>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary to-ouro-400"
        />
      </section>

      <div className="flex flex-col gap-6 px-4 pt-5 pb-8">
        <ul
          className={cn(
            'overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm',
          )}
        >
          <Item
            icon={Smartphone}
            title="Ícone na tela inicial"
            description="Abrir a Área com um toque"
            onClick={openInstall}
            testId="perfil-instalar"
          />
          {goToPainel && (
            <Item
              icon={ArrowLeftRight}
              title="Trocar de área"
              description="Ir para o painel do terreiro"
              onClick={goToPainel}
              testId="perfil-trocar-area"
            />
          )}
          <Item icon={LogOut} title="Sair" onClick={sair} testId="perfil-sair" />
        </ul>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          Área do Médium no <GiraHubLogo size="sm" className="text-muted-foreground" />
        </p>
      </div>
    </>
  );
}
