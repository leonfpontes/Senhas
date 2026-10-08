/**
 * Campos do "Pôr na escala" (AM-17 + AM-29): médiuns um a um e grupos da corrente inteiros.
 *
 * Usado no painel "Confirmações" (`ConfirmacoesSheet`) e no drawer de criar atividade "só
 * escalados" (`pages/admin/atividades.tsx`). Quem chama decide se mostra (ESCALAS:insert) e faz o
 * `POST /admin/atividades/{id}/convocar` com `{ medium_ids, grupo_ids }`. O grupo entra com os
 * membros ATIVOS naquele momento que o tipo alcança — o backend devolve quem ficou de fora.
 * Grupos: `GET /admin/corrente-grupos/opcoes` (`useGruposDaCorrente`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { MultiCombobox } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { corDoGrupo, type GrupoOpcao } from '@/constants/correnteGrupos';
import type { ResultadoConvocacao } from '@/constants/presenca';
import { apiClient } from '@/services/api_client';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Uma frase para o toast: "2 médiuns postos na escala · 1 já estava · 1 fora de quem pode participar: Beto." */
export function textoResultadoConvocacao(r: ResultadoConvocacao): string {
  const partes = [
    r.novos === 0 ? 'Ninguém novo na escala' : `${plural(r.novos, 'médium posto', 'médiuns postos')} na escala`,
  ];
  if (r.ja_estavam > 0) partes.push(r.ja_estavam === 1 ? '1 já estava' : `${r.ja_estavam} já estavam`);
  if (r.fora_da_elegibilidade > 0) {
    const nomes = r.fora_da_elegibilidade_nomes;
    const lista = nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', ');
    partes.push(`${r.fora_da_elegibilidade} fora de quem pode participar${lista ? `: ${lista}` : ''}`);
  }
  return `${partes.join(' · ')}.`;
}

export const URL_GRUPOS_OPCOES = '/api/v1/admin/corrente-grupos/opcoes';

/** Grupos ativos da corrente (só busca com `ativo`; erro → lista vazia, o campo some). */
export function useGruposDaCorrente(ativo: boolean): GrupoOpcao[] {
  const [grupos, setGrupos] = useState<GrupoOpcao[]>([]);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    apiClient
      .get<GrupoOpcao[]>(URL_GRUPOS_OPCOES)
      .then((res) => vivo && setGrupos(Array.isArray(res.data) ? res.data : []))
      .catch(() => vivo && setGrupos([]));
    return () => {
      vivo = false;
    };
  }, [ativo]);
  return grupos;
}

export function PorNaEscalaCampos({
  mediuns,
  grupos,
  mediumIds,
  grupoIds,
  onMediumIds,
  onGrupoIds,
}: {
  mediuns: { id: string; nome: string }[];
  grupos: GrupoOpcao[];
  mediumIds: string[];
  grupoIds: string[];
  onMediumIds: (ids: string[]) => void;
  onGrupoIds: (ids: string[]) => void;
}) {
  const opcoesGrupos = useMemo(
    () =>
      grupos.map((g) => ({
        value: g.id,
        label: g.nome,
        description: `${g.total_membros} ${g.total_membros === 1 ? 'médium' : 'médiuns'}`,
        dot: corDoGrupo(g.cor),
      })),
    [grupos],
  );
  const escolhidos = grupoIds
    .map((id) => grupos.find((g) => g.id === id))
    .filter((g): g is GrupoOpcao => Boolean(g));

  return (
    <div className="flex flex-col gap-3" data-testid="por-na-escala-campos">
      {grupos.length > 0 && (
        <div className="flex flex-col gap-2">
          <MultiCombobox
            label="Grupos"
            options={opcoesGrupos}
            value={grupoIds}
            onChange={onGrupoIds}
            placeholder="Escolha grupos inteiros"
            searchPlaceholder="Buscar grupo..."
            emptyText="Nenhum grupo encontrado."
            countLabel={(n) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`}
          />
          {escolhidos.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="grupos-escolhidos">
              Entram os médiuns ativos de
              {escolhidos.map((g) => (
                <GrupoChip key={g.id} grupo={g} size="sm" />
              ))}
              que o tipo da atividade alcança.
            </p>
          )}
        </div>
      )}
      {mediuns.length > 0 && (
        <MultiCombobox
          label="Médiuns"
          options={mediuns.map((m) => ({ value: m.id, label: m.nome }))}
          value={mediumIds}
          onChange={onMediumIds}
          placeholder="Escolha os médiuns"
          searchPlaceholder="Buscar médium..."
          emptyText="Ninguém encontrado."
          countLabel={(n) => `${n} ${n === 1 ? 'médium' : 'médiuns'}`}
        />
      )}
    </div>
  );
}

export default PorNaEscalaCampos;
