/**
 * TrialSummaryCard — "Seu mês no Premium": o que o terreiro já fez no teste, o que trava
 * no gratuito e um plano recomendado pelo uso, com "Manter tudo por R$ X/mês".
 */
import React from 'react';
import { CalendarDays, Flower2, Loader2, Lock, Sparkles, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatPricePerMonth, lostOnFree, planHighlights, type PlanDef, type UsageSnapshot } from '@/constants/plans';

export interface TrialUsage extends UsageSnapshot {
  /** Senhas emitidas no período (omitido quando o painel não devolve). */
  senhas?: number | null;
}

export interface TrialSummaryCardProps {
  plan: PlanDef;
  trialEndsAt: string | null;
  usage: TrialUsage;
  recommended: PlanDef;
  onKeep: (plan: PlanDef) => void;
  loading?: boolean;
  disabled?: boolean;
  'data-tour'?: string;
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-brand [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-none">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function TrialSummaryCard({ plan, trialEndsAt, usage, recommended, onKeep, loading, disabled, ...rest }: TrialSummaryCardProps) {
  const dias = daysLeft(trialEndsAt);
  const perdas = lostOnFree(usage);
  const recommendedIsFree = recommended.price === 0;

  return (
    <Card data-tour={rest['data-tour']} className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Sparkles className="size-5 text-brand" aria-hidden /> Seu mês no {plan.label}
            </h2>
            <p className="text-sm text-muted-foreground">
              {dias === null
                ? 'Você está testando o plano completo, sem cobrança.'
                : dias === 0
                  ? 'O teste termina hoje.'
                  : `Faltam ${dias === 1 ? '1 dia' : `${dias} dias`} de teste, sem cobrança.`}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {typeof usage.senhas === 'number' && <Stat icon={<Ticket />} label="senhas emitidas" value={usage.senhas} />}
          <Stat icon={<CalendarDays />} label="giras este mês" value={usage.girasPerMonth} />
          <Stat icon={<Flower2 />} label="médiuns cadastrados" value={usage.mediuns} />
          {typeof usage.users === 'number' && <Stat icon={<Users />} label="usuários no painel" value={usage.users} />}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-background p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Lock className="size-4 text-muted-foreground" aria-hidden /> O que trava no gratuito
            </p>
            {perdas.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {perdas.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
                <li>• Relatório da gira, financeiro, estoque e site</li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pelo seu uso até agora, o gratuito dá conta das giras. Médiuns, relatório da gira e os outros módulos ficam
                para quando você precisar.
              </p>
            )}
          </div>

          <div className="flex flex-col rounded-lg border-2 bg-background p-4" style={{ borderColor: recommended.color }}>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Recomendado pelo seu uso</p>
            <p className="text-lg font-extrabold" style={{ color: recommended.color }}>
              {recommended.label} — {formatPricePerMonth(recommended.price)}
            </p>
            <ul className="mt-2 flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
              {planHighlights(recommended.key)
                .slice(0, 4)
                .map((f) => (
                  <li key={f}>• {f}</li>
                ))}
            </ul>
            {recommendedIsFree ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Nada a fazer: no fim do teste a conta continua no gratuito. Se quiser mais, escolha um plano na aba
                &quot;Comparar planos&quot;.
              </p>
            ) : (
              <Button className="mt-3 w-full font-semibold" onClick={() => onKeep(recommended)} disabled={disabled || loading}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Manter tudo por {formatPricePerMonth(recommended.price)}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TrialSummaryCard;
