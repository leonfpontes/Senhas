/**
 * Configurações › Laboratório (beta) — jornadas v2, decisão do dono 01/11/2026.
 *
 * Só aparece para terreiro marcado como beta tester pela plataforma (o GET responde 403 sem isso).
 * A casa liga ou desliga cada beta do catálogo (`backend/src/services/laboratorio.py`); desligar não
 * apaga o que foi registrado com ela. Cada beta mostra a sua nota em "Notas da versão · Beta testers"
 * (`BETA_RELEASE_NOTES`) e tem documentação em `docs/betas/`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { BETA_RELEASE_NOTES } from '@/constants/releaseNotes';
import { minPlanFor, type PlanFeatureKey } from '@/constants/plans';
import { BetaNoteBody } from '@/components/admin/BetaNoteBody';
import { useSubscription } from '@/hooks/useSubscription';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BetaDoLaboratorio {
  chave: string;
  nome: string;
  descricao: string;
  grupo: string;
  nota: string;
  ligada: boolean;
  /** Recurso do plano que a beta também exige (ex.: `area_medium`) e se o plano da casa tem. */
  plano?: string | null;
  no_plano?: boolean;
}

interface Props {
  canEdit: boolean;
  tenantName?: string | null;
}

export function LaboratorioSection({ canEdit, tenantName }: Props) {
  const [betas, setBetas] = useState<BetaDoLaboratorio[] | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [notaAberta, setNotaAberta] = useState<string | null>(null);
  const { showSuccess, showError } = useSnackbar();
  // As betas ligadas chegam ao painel pela assinatura (`beta(...)`, `features.area_medium`): recarrega
  // depois de mudar, para a aba Área do Médium e as telas com beta aparecerem ou sumirem na hora.
  const { refresh } = useSubscription();

  useEffect(() => {
    apiClient
      .get<{ betas: BetaDoLaboratorio[] }>('/api/v1/admin/config/laboratorio')
      .then((r) => setBetas(r.data.betas))
      .catch(() => setBetas([]));
  }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, BetaDoLaboratorio[]>();
    (betas ?? []).forEach((b) => m.set(b.grupo, [...(m.get(b.grupo) ?? []), b]));
    return [...m.entries()];
  }, [betas]);

  const alternar = async (b: BetaDoLaboratorio, ligada: boolean) => {
    setSalvando(b.chave);
    try {
      const r = await apiClient.put<{ betas: BetaDoLaboratorio[] }>('/api/v1/admin/config/laboratorio', { chave: b.chave, ligada });
      setBetas(r.data.betas);
      refresh();
      showSuccess(ligada ? `"${b.nome}" ligada.` : `"${b.nome}" desligada. Nada do que foi registrado foi apagado.`);
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível mudar a beta.'));
    } finally {
      setSalvando(null);
    }
  };

  if (betas === null) return <Skeleton className="h-64 w-full" />;

  return (
    <section aria-labelledby="lab-titulo" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="lab-titulo" className="font-display text-3xl font-semibold">
            O <em className="text-(color:--primary-text)">laboratório</em> da casa
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            Funcionalidades em teste na sua casa. Ligue e desligue quando quiser: elas podem mudar antes de virarem de todos, e o que a
            casa registrou não se perde ao desligar.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <p className="text-sm font-semibold text-(color:--primary-text)">
            {tenantName ? `A ${tenantName} é beta tester do GiraHub.` : 'Esta casa é beta tester do GiraHub.'}
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto gap-1 px-0 text-sm font-semibold text-foreground underline underline-offset-4"
            onClick={() => window.dispatchEvent(new CustomEvent('girahub:abrir-novidades', { detail: { modo: 'beta' } }))}
          >
            Notas da versão · Beta testers <ArrowRight aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      {grupos.map(([grupo, lista]) => (
        <div key={grupo} className="flex flex-col">
          <h3 className="mb-1 font-display text-xl font-semibold">{grupo}</h3>
          {lista.map((b) => {
            const nota = BETA_RELEASE_NOTES.find((n) => n.chave === b.chave);
            return (
              <div key={b.chave} className="flex flex-col gap-2 border-t border-border py-3">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`beta-${b.chave}`} className="text-base font-semibold">{b.nome}</Label>
                    <p className="text-sm text-muted-foreground">{b.descricao}</p>
                    {b.plano && b.no_plano === false && (
                      <p className="mt-1 text-sm font-semibold">
                        Precisa do plano {minPlanFor(b.plano as PlanFeatureKey).label} ou superior. Dá para ligar agora: passa a
                        valer quando a casa estiver nesse plano.
                      </p>
                    )}
                  </div>
                  {nota && (
                    <button
                      type="button"
                      className="text-sm font-semibold underline underline-offset-4"
                      aria-expanded={notaAberta === b.chave}
                      onClick={() => setNotaAberta(notaAberta === b.chave ? null : b.chave)}
                    >
                      Nota da versão
                    </button>
                  )}
                  <div className="flex w-28 items-center justify-end gap-2">
                    <Switch
                      id={`beta-${b.chave}`}
                      checked={b.ligada}
                      onCheckedChange={(v) => alternar(b, v)}
                      disabled={!canEdit || salvando === b.chave}
                    />
                    <span className="text-sm text-muted-foreground">{b.ligada ? 'Ligada' : 'Desligada'}</span>
                  </div>
                </div>
                {nota && notaAberta === b.chave && (
                  <BetaNoteBody note={nota} className="rounded-lg bg-muted px-4 py-3" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

export default LaboratorioSection;
