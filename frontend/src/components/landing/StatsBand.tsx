/**
 * V-02 — faixa com números reais de uso (GET /api/v1/public/stats). Sem número acima do mínimo,
 * ou com a API fora, a faixa simplesmente não aparece.
 */
import React, { useEffect, useState } from 'react';
import { apiClient } from '@/services/api_client';
import { Reveal } from '@/components/landing/Reveal';
import { visibleStats, type PublicStats } from '@/constants/landingStats';

export function StatsBand({ initial = null }: { initial?: PublicStats | null }) {
  const [stats, setStats] = useState<PublicStats | null>(initial);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    apiClient
      .get<PublicStats>('/api/v1/public/stats')
      .then((res) => alive && setStats(res.data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [initial]);

  const items = visibleStats(stats);
  if (items.length === 0) return null;

  return (
    <section aria-label="O GiraHub em números" className="border-y border-areia-200 bg-white py-12">
      <Reveal className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-16 gap-y-8 px-4 text-center sm:px-6">
        {items.map((s) => (
          <p key={s.label} className="flex flex-col">
            <span className="font-display text-4xl font-bold text-barro-700 sm:text-5xl">{s.value}</span>
            <span className="mt-1 text-tinta-suave">{s.label}</span>
          </p>
        ))}
      </Reveal>
    </section>
  );
}

export default StatsBand;
