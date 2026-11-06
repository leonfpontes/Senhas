/**
 * AssistenteDePlano — "Responda três perguntas e a gente indica o plano" (J1 v2 · 03).
 *
 * A regra mora em `constants/assistentePlano.ts` (limites dos planos, `recommendPlan` e o plano
 * mínimo dos recursos). Design ético (ADR 0010): nenhuma resposta vem marcada, o plano só aparece
 * depois das três respostas, o Gratuito é indicado quando dá conta, o preço é o da tabela de
 * planos e não há contagem regressiva nem "oferta".
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PLANS, featuresUnlockedAt, formatPrice } from '@/constants/plans';
import { opcoesDeGiras, opcoesDeMediuns, planoIndicado, resumoDosLimites } from '@/constants/assistentePlano';

function Pergunta({
  id,
  titulo,
  opcoes,
  valor,
  onChange,
  className,
}: {
  id: string;
  titulo: string;
  opcoes: { valor: string; rotulo: string }[];
  valor: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p id={id} className="font-semibold text-tinta">
        {titulo}
      </p>
      <ToggleGroup
        type="single"
        aria-labelledby={id}
        value={valor}
        onValueChange={(v) => v && onChange(v)}
        className={cn('grid w-full rounded-xl border border-areia-200 bg-white p-1', className)}
      >
        {opcoes.map((o) => (
          <ToggleGroupItem
            key={o.valor}
            value={o.valor}
            className="h-11 rounded-lg text-[0.9375rem] text-tinta data-[state=on]:bg-cafe-950 data-[state=on]:font-semibold data-[state=on]:text-white"
          >
            {o.rotulo}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function AssistenteDePlano() {
  const giras = opcoesDeGiras();
  const mediuns = opcoesDeMediuns();
  const [g, setG] = useState('');
  const [m, setM] = useState('');
  const [rec, setRec] = useState('');
  const respondeu = g !== '' && m !== '' && rec !== '';
  const plano = respondeu ? PLANS[planoIndicado({ girasPorMes: Number(g), mediuns: Number(m), precisaDosRecursos: rec === 'sim' })] : null;
  // Só a primeira letra vira minúscula ("Ficha espiritual" → "ficha espiritual"; PIX segue PIX).
  const destaques = plano
    ? featuresUnlockedAt(plano.key)
        .slice(0, 3)
        .map((f) => (/^[A-ZÀ-Ú][a-zà-ú]/.test(f.label) ? f.label.charAt(0).toLowerCase() + f.label.slice(1) : f.label))
    : [];

  return (
    <section aria-labelledby="assistente-titulo" className="pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 rounded-3xl bg-areia-100 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col gap-6">
            <div>
              <h2 id="assistente-titulo" className="font-display text-2xl font-bold text-tinta sm:text-3xl">
                Qual plano é o da sua casa?
              </h2>
              <p className="mt-1 text-tinta-suave">Responda três perguntas e a gente indica o plano.</p>
            </div>
            <Pergunta
              id="assistente-giras"
              titulo="Quantas giras a casa faz por mês?"
              opcoes={giras.map((o) => ({ valor: String(o.valor), rotulo: o.rotulo }))}
              valor={g}
              onChange={setG}
              className="grid-cols-2 sm:grid-cols-4"
            />
            <Pergunta
              id="assistente-mediuns"
              titulo="Quantos médiuns tem a corrente?"
              opcoes={mediuns.map((o) => ({ valor: String(o.valor), rotulo: o.rotulo }))}
              valor={m}
              onChange={setM}
              className="grid-cols-2 sm:grid-cols-4"
            />
            <Pergunta
              id="assistente-recursos"
              titulo="Precisa de financeiro, estoque ou fila de espera?"
              opcoes={[
                { valor: 'nao', rotulo: 'Agora não' },
                { valor: 'sim', rotulo: 'Sim' },
              ]}
              valor={rec}
              onChange={setRec}
              className="max-w-xs grid-cols-2"
            />
          </div>

          <div aria-live="polite" className="flex flex-col justify-between gap-6 rounded-2xl bg-cafe-950 p-6 text-white sm:p-8">
            {plano ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-ouro-300">Para a sua casa</p>
                  <div className="mt-2 flex items-start justify-between gap-4">
                    <p className="font-display text-5xl font-bold">{plano.label}</p>
                    <p className="text-right">
                      <span className="block font-display text-3xl font-bold">{formatPrice(plano.price)}</span>
                      {plano.price > 0 && <span className="text-sm font-semibold text-areia-200">por mês</span>}
                    </p>
                  </div>
                  <p className="mt-4 text-areia-100">
                    {resumoDosLimites(plano.key).charAt(0).toUpperCase() + resumoDosLimites(plano.key).slice(1)}.
                    {destaques.length > 0 && <> Vem com {destaques.join(', ')}.</>}
                    {plano.price === 0 && <> Dá conta do que a casa faz hoje, e você muda de plano quando precisar.</>}
                  </p>
                </div>
                <Button asChild size="touch" className="bg-folha-600 text-base font-bold text-white hover:bg-folha-700">
                  <Link href={plano.price === 0 ? '/cadastro' : `/cadastro?plan=${plano.key}`}>
                    {plano.price === 0 ? 'Criar a conta da casa' : 'Começar com 30 dias grátis'} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </>
            ) : (
              <div className="flex h-full flex-col justify-center">
                <p className="text-sm font-semibold text-ouro-300">Para a sua casa</p>
                <p className="mt-2 font-display text-2xl">Responda as três perguntas para ver o plano.</p>
                <p className="mt-2 text-sm text-areia-200">A indicação usa os limites de cada plano; nada é guardado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AssistenteDePlano;
