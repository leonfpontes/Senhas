/**
 * Empty state da tela de giras (terreiro sem nenhuma gira cadastrada).
 *
 * Explica o ciclo em três passos e oferece o botão de criar a primeira gira, respeitando
 * permissão de grupo (`giras:insert`) e limite/assinatura do plano.
 */
import React from 'react';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import { trackEvent } from '@/services/analytics';
import { Button } from '@/components/ui/button';

export interface GirasEmptyStateProps {
  /** Permissão de grupo para criar gira. */
  canInsert: boolean;
  /** Plano/assinatura permite criar gira agora. */
  canCreateGira: boolean;
  /** Motivo do bloqueio por plano (limite atingido, sem assinatura). */
  blockedReason?: string;
  onCreate: () => void;
}

const STEPS = [
  'Crie a gira com a data e quantas senhas liberar.',
  'Compartilhe o link do terreiro no grupo de WhatsApp — os consulentes pegam a senha pelo celular.',
  'No dia da gira, use a Porta para marcar quem chegou e chamar as senhas.',
];

export default function GirasEmptyState({ canInsert, canCreateGira, blockedReason, onCreate }: GirasEmptyStateProps) {
  return (
    <div
      data-testid="giras-empty-state"
      role="status"
      className="flex flex-col items-center px-6 py-10 text-center sm:py-14"
    >
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
        <CalendarDays className="size-7" />
      </span>
      <h2 className="text-lg font-bold">Nenhuma gira cadastrada ainda</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Crie a primeira gira para começar a liberar senhas. É assim que funciona:
      </p>

      <ol className="mt-5 mb-6 flex max-w-md list-none flex-col gap-2 p-0 text-left">
        {STEPS.map((text, i) => (
          <li key={text} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >
              {i + 1}
            </span>
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ol>

      {canInsert && canCreateGira && (
        <Button
          size="lg"
          onClick={() => {
            trackEvent('giras_empty_create');
            onCreate();
          }}
        >
          <Plus aria-hidden /> Criar primeira gira
        </Button>
      )}

      {canInsert && !canCreateGira && (
        <div className="flex flex-col items-center gap-2">
          {blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
          <Button asChild variant="outline">
            <Link href="/admin/billing">Ver planos</Link>
          </Button>
        </div>
      )}

      {!canInsert && (
        <p className="text-sm text-muted-foreground">Peça a um administrador do terreiro para criar a gira.</p>
      )}
    </div>
  );
}
