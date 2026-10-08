/**
 * Grupos da corrente (AM-23) na tela Médiuns: etiquetas na lista e o campo "Grupos" do
 * cadastro do médium. Tudo só aparece com `can('area_medium')` (quem chama decide) e usa a
 * mesma API da tela de grupos (`/api/v1/admin/corrente-grupos`, grupo de permissão `mediuns`):
 * ler = view; o campo grava com `PUT /corrente-grupos/mediuns/{id}` (edit).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/services/api_client';
import { MultiCombobox } from '@/components/fields';
import { GrupoChip } from '@/components/grupos/GrupoChip';
import { corDoGrupo, type GrupoResumo } from '@/constants/correnteGrupos';

const API = '/api/v1/admin/corrente-grupos';

interface GrupoComMembros extends GrupoResumo {
  membros: { medium_id: string }[];
}

/** Grupos ativos do terreiro e, para cada médium, os grupos em que ele está. */
export function useGruposDaCorrente(enabled: boolean) {
  const [grupos, setGrupos] = useState<GrupoComMembros[]>([]);

  const recarregar = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiClient.get<GrupoComMembros[]>(API);
      setGrupos(Array.isArray(res.data) ? res.data : []);
    } catch {
      setGrupos([]);
    }
  }, [enabled]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const porMedium = useMemo(() => {
    const out = new Map<string, GrupoResumo[]>();
    for (const g of grupos) {
      for (const m of g.membros ?? []) {
        const lista = out.get(m.medium_id) ?? [];
        lista.push({ id: g.id, nome: g.nome, cor: g.cor });
        out.set(m.medium_id, lista);
      }
    }
    return out;
  }, [grupos]);

  return { grupos, porMedium, recarregar };
}

export async function salvarGruposDoMedium(mediumId: string, grupoIds: string[]): Promise<void> {
  await apiClient.put(`${API}/mediuns/${mediumId}`, { grupo_ids: grupoIds });
}

export function mesmosGrupos(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Etiquetas dos grupos do médium (lista e cartão). */
export function GruposDoMediumChips({ grupos }: { grupos?: GrupoResumo[] }) {
  if (!grupos || grupos.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" aria-label="Grupos da corrente">
      {grupos.map((g) => (
        <GrupoChip key={g.id} grupo={g} size="sm" />
      ))}
    </span>
  );
}

/** Campo "Grupos" do cadastro do médium. */
export function GruposDoMediumField({
  grupos,
  value,
  onChange,
}: {
  grupos: GrupoResumo[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const opcoes = useMemo(() => grupos.map((g) => ({ value: g.id, label: g.nome, dot: corDoGrupo(g.cor) })), [grupos]);
  if (grupos.length === 0) {
    return (
      <p className="rounded-md border p-3 text-sm text-muted-foreground">
        Nenhum grupo da corrente ainda.{' '}
        <Link href="/admin/mediuns/grupos" className="font-semibold text-brand underline underline-offset-2">
          Criar grupos
        </Link>
      </p>
    );
  }
  return (
    <MultiCombobox
      label="Grupos"
      options={opcoes}
      value={value}
      onChange={onChange}
      placeholder="Nenhum grupo"
      searchPlaceholder="Buscar grupo..."
      emptyText="Nenhum grupo encontrado."
      countLabel={(n) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`}
      helperText="Os avisos feitos para o grupo chegam a este médium."
    />
  );
}
