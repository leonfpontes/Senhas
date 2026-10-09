/**
 * AccountChoiceList — passo "Em qual terreiro você quer entrar?" do /login (AM-05).
 *
 * Aparece quando a senha conferiu em mais de uma conta com o mesmo e-mail: um cartão grande
 * por terreiro (logo ou inicial, nome e um lembrete das áreas da conta — "Painel e Área do
 * Médium"), alvo ≥ 64px, na paleta terra do `AuthShell`. Só lista os terreiros que o backend
 * mandou (os que a senha abriu). Tocar num cartão chama `onSelect`; enquanto entra, o cartão
 * mostra o carregando e os outros ficam travados.
 */
import React from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { TerreiroEmblem } from '@/components/medium/TerreiroEmblem';
import { cn } from '@/lib/utils';
import type { AccountOption } from '@/services/authSession';

/** Lembrete curto do que a conta abre naquele terreiro. */
export function areasHint(areas: AccountOption['areas']): string {
  if (areas.admin && areas.medium) return 'Painel e Área do Médium';
  if (areas.admin) return 'Painel do terreiro';
  if (areas.medium) return 'Área do Médium';
  return 'Entrar neste terreiro';
}

/**
 * Miolo do cartão de terreiro (logo ou inicial, nome e lembrete das áreas). Usado pelo login e
 * pelo "Trocar de terreiro" dos menus (`TrocarTerreiroDialog`), que só muda a casca e as cores.
 */
export function AccountCardBody({
  nome,
  logoUrl,
  hint,
  hintClassName = 'text-tinta-suave',
}: {
  nome: string;
  logoUrl?: string | null;
  hint: string;
  hintClassName?: string;
}) {
  return (
    <>
      <TerreiroEmblem nome={nome} logoUrl={logoUrl} className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate font-display text-lg leading-tight font-semibold">{nome}</strong>
        <span className={cn('text-sm', hintClassName)}>{hint}</span>
      </span>
    </>
  );
}

export interface AccountChoiceListProps {
  options: ReadonlyArray<AccountOption>;
  onSelect: (userId: string) => void;
  /** `user_id` do cartão que está entrando (os demais ficam travados). */
  selectingId?: string | null;
}

export function AccountChoiceList({ options, onSelect, selectingId }: AccountChoiceListProps) {
  const busy = Boolean(selectingId);
  return (
    <ul className="flex flex-col gap-3" aria-label="Terreiros">
      {options.map((o) => {
        const entrando = selectingId === o.user_id;
        const hint = areasHint(o.areas);
        return (
          <li key={o.user_id}>
            <button
              type="button"
              onClick={() => onSelect(o.user_id)}
              disabled={busy}
              aria-busy={entrando || undefined}
              aria-label={`${o.terreiro_nome} — ${hint}`}
              className={cn(
                'flex min-h-16 w-full items-center gap-3.5 rounded-xl border border-areia-300 bg-white px-4 py-3 text-left text-tinta outline-none transition-colors',
                'hover:border-barro-500 hover:bg-areia-50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-60',
                entrando && 'border-barro-600 bg-barro-600/10 disabled:opacity-100',
              )}
            >
              <AccountCardBody nome={o.terreiro_nome} logoUrl={o.logo_url} hint={hint} />
              {entrando ? (
                <Loader2 className="size-5 shrink-0 animate-spin text-barro-700" aria-hidden />
              ) : (
                <ChevronRight className="size-5 shrink-0 text-tinta-suave" aria-hidden />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default AccountChoiceList;
