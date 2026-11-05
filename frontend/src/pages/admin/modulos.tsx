/**
 * /admin/modulos — os módulos da casa (Jornada 1 v2 · 10, barra lateral enxuta).
 *
 * "Ver os N módulos", na barra, abre esta página: cada módulo em uma linha com filete, o que faz,
 * o plano mínimo (`FEATURE_MIN_PLAN`, a matriz do backend) e o estado:
 *   - Sempre no menu: Giras, senhas e Porta;
 *   - No menu: o plano e o perfil liberam (com a beta "Menu que se ajusta ao uso", "Tirar" e
 *     "Pôr no menu" valem para esta pessoa, neste aparelho);
 *   - No <plano> + "Ver o plano": fora do plano, aparece apagado, nunca escondido.
 * Sem permissão, o módulo não aparece (a linha do topo diz isso). Módulo do piloto da Área do
 * Médium só existe com a chave. O nome do módulo leva à tela dele: nada fica a mais de um clique.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminLayout from './admin_layout';
import { useSubscription } from '@/hooks/useSubscription';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { flattenNav, pathOf, useAdminNav } from '@/components/admin/layout/navConfig';
import {
  GRUPOS_DE_MODULO,
  MODULOS,
  estaNoMenu,
  gravarPreferencia,
  lerPreferencia,
  porNoMenu,
  situacaoDoModulo,
  tirarDoMenu,
  type Modulo,
  type PreferenciaDoMenu,
} from '@/constants/modulos';
import { FEATURE_MIN_PLAN, planLabel, type PlanKey } from '@/constants/plans';

type Estado = 'fixo' | 'menu' | 'livre' | 'plano';

function planoMinimo(m: Modulo): PlanKey {
  return m.plano ? FEATURE_MIN_PLAN[m.plano] : 'free';
}

function fraseDoPlano(p: PlanKey): string {
  if (p === 'free') return 'Gratuito';
  if (p === 'premium') return 'Premium';
  return `a partir do ${planLabel(p)}`;
}

export default function ModulosPage() {
  return (
    <AdminLayout title="Módulos da casa">
      <ModulosContent />
    </AdminLayout>
  );
}

function ModulosContent() {
  const { can, beta, planLabel: planoDaCasa, subscription } = useSubscription();
  const comDado = subscription?.modulos_com_dado ?? [];
  const { profile } = useProfile();
  const isOperator = profile?.role === 'operator';
  const tenantId = profile?.tenant_id;
  const ajustavel = Boolean(beta?.('beta_menu_ajustavel'));
  const groups = useAdminNav({ isOperator, tenantId });
  const rotasLiberadas = useMemo(() => new Set(flattenNav(groups).map((l) => pathOf(l.href))), [groups]);

  const [pref, setPref] = useState<PreferenciaDoMenu>(() => lerPreferencia(tenantId));
  useEffect(() => setPref(lerPreferencia(tenantId)), [tenantId]);
  const mudar = (p: PreferenciaDoMenu) => {
    setPref(p);
    gravarPreferencia(tenantId, p);
  };

  // A regra de quem aparece é a mesma do "Ver os N módulos" da barra (situacaoDoModulo).
  const linhas = MODULOS.flatMap((m): { m: Modulo; estado: Estado; entrada: string | null }[] => {
    const sit = situacaoDoModulo(m, rotasLiberadas, can);
    if (!sit) return []; // sem permissão, ou piloto sem a chave: não aparece
    if (sit.tipo === 'fixo') return [{ m, estado: 'fixo', entrada: sit.entrada }];
    if (sit.tipo === 'plano') return [{ m, estado: 'plano', entrada: null }];
    const noMenu = !ajustavel || estaNoMenu(pref, m.key, comDado);
    return [{ m, estado: noMenu ? 'menu' : 'livre', entrada: sit.entrada }];
  });

  return (
    <div className="pb-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[2.5rem] leading-tight font-normal tracking-[-0.03em] text-foreground sm:text-[3.25rem]">
            Módulos da casa
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            O que a casa já usa fica no menu. O resto está aqui, a um clique, e também na busca (Ctrl K).
          </p>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Plano {planoDaCasa} · você vê o que o seu perfil permite
        </p>
      </header>

      {GRUPOS_DE_MODULO.map((grupo) => {
        const doGrupo = linhas.filter((l) => l.m.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <section key={grupo} aria-labelledby={`grupo-${grupo}`} className="mb-6">
            <h2 id={`grupo-${grupo}`} className="mb-1.5 font-display text-2xl font-medium tracking-[-0.01em] text-foreground">
              {grupo}
            </h2>
            <ul className="m-0 list-none border-b border-border p-0">
              {doGrupo.map(({ m, estado, entrada }) => (
                <li
                  key={m.key}
                  data-testid={`modulo-${m.key}`}
                  data-estado={estado}
                  className="grid gap-2 border-t border-border py-3 sm:grid-cols-[250px_1fr_150px_200px] sm:items-center sm:gap-5"
                >
                  {entrada ? (
                    <Link href={entrada} className="text-[1.0625rem] font-semibold text-foreground hover:underline">
                      {m.nome}
                    </Link>
                  ) : (
                    <span className="text-[1.0625rem] font-semibold text-muted-foreground">{m.nome}</span>
                  )}
                  <span className={cn('text-sm', estado === 'plano' ? 'text-muted-foreground/80' : 'text-muted-foreground')}>{m.oque}</span>
                  <span className="text-[0.8125rem] font-medium text-muted-foreground">{fraseDoPlano(planoMinimo(m))}</span>
                  <span className="flex items-center gap-3.5 sm:justify-end">
                    {estado === 'fixo' && <span className="text-sm font-medium text-muted-foreground">Sempre no menu</span>}
                    {estado === 'menu' && (
                      <>
                        <span className="text-sm font-semibold text-success-strong">No menu</span>
                        {ajustavel && (
                          <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={() => mudar(tirarDoMenu(pref, m.key))}>
                            Tirar
                          </Button>
                        )}
                      </>
                    )}
                    {estado === 'livre' && (
                      <Button type="button" variant="outline" className="h-[38px]" onClick={() => mudar(porNoMenu(pref, m.key))}>
                        Pôr no menu
                      </Button>
                    )}
                    {estado === 'plano' && (
                      <>
                        <span className="text-sm font-semibold text-[color:var(--color-barro-700)]">No {planLabel(planoMinimo(m))}</span>
                        {!isOperator && (
                          <Link href={`/admin/billing?plan=${planoMinimo(m)}`} className="text-sm font-semibold text-brand hover:underline">
                            Ver o plano
                          </Link>
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
