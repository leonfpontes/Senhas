/**
 * PermissionMatrix — o que um grupo pode fazer em cada módulo (Ver / Criar / Editar / Excluir).
 *
 * - Uma tabela por área (Operacional, Cadastros...) dentro de um `Collapsible`; cabe em 375px
 *   sem rolagem lateral (rótulo quebra linha, 4 colunas de checkbox estreitas).
 * - Marcar Criar/Editar/Excluir liga Ver; desligar Ver desliga o resto (o backend exige ver para
 *   fazer qualquer outra coisa).
 * - Atalhos: Nada, Só ver, Operação do dia, Tudo. Módulos sensíveis (`SENSITIVE_FEATURES`, hoje a
 *   ficha espiritual — dado religioso, F-05) ficam de fora dos atalhos e do "Tudo" da área: só a
 *   marcação à mão liga (os atalhos "Nada" e desmarcar a área desligam).
 *
 * Mesma API de antes: `value`, `onChange`, `disabled`.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FEATURE_LABELS,
  SENSITIVE_FEATURES,
  SENSITIVE_FEATURE_HINT,
  type FeatureMeta,
  type PermissionFeature,
} from '@/constants/permissionFeatures';
import type { GroupPermission } from '@/services/permissionGroupsService';

export interface PermissionMatrixProps {
  value: GroupPermission[];
  onChange: (newValue: GroupPermission[]) => void;
  disabled?: boolean;
}

export type PermissionAction = 'can_view' | 'can_insert' | 'can_edit' | 'can_delete';

export const PERMISSION_ACTIONS: readonly PermissionAction[] = ['can_view', 'can_insert', 'can_edit', 'can_delete'];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  can_view: 'Ver',
  can_insert: 'Criar',
  can_edit: 'Editar',
  can_delete: 'Excluir',
};

const AREAS = ['Operacional', 'Cadastros', 'Corrente', 'Financeiro', 'Administração', 'Relatórios'];

// Módulos do dia a dia de uma gira: no atalho "Operação do dia" ganham Criar.
const DAY_TO_DAY: PermissionFeature[] = ['giras', 'tickets', 'porta', 'estoque'];

export type PresetKey = 'nenhum' | 'leitura' | 'operacional' | 'completo';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'nenhum', label: 'Nada' },
  { key: 'leitura', label: 'Só ver' },
  { key: 'operacional', label: 'Operação do dia' },
  { key: 'completo', label: 'Tudo' },
];

const emptyPermission = (feature: PermissionFeature): GroupPermission => ({
  feature,
  can_view: false,
  can_insert: false,
  can_edit: false,
  can_delete: false,
});

/** Lista completa (todos os módulos), na ordem de `FEATURE_LABELS`. */
export function normalizePermissions(value: GroupPermission[]): GroupPermission[] {
  const byFeature = new Map(value.map((p) => [p.feature, p]));
  return (Object.keys(FEATURE_LABELS) as PermissionFeature[]).map((f) => byFeature.get(f) ?? emptyPermission(f));
}

/** Aplica uma marcação respeitando "fazer qualquer coisa exige ver". */
export function togglePermission(perm: GroupPermission, action: PermissionAction, checked: boolean): GroupPermission {
  const next = { ...perm, [action]: checked };
  if (checked && action !== 'can_view') next.can_view = true;
  if (!checked && action === 'can_view') {
    next.can_insert = false;
    next.can_edit = false;
    next.can_delete = false;
  }
  return next;
}

const isSensitive = (feature: PermissionFeature) => SENSITIVE_FEATURES.includes(feature);

export function applyPreset(value: GroupPermission[], preset: PresetKey): GroupPermission[] {
  return normalizePermissions(value).map((p) => {
    // Dado religioso (F-05): atalho nunca liga; "Nada" desliga.
    if (isSensitive(p.feature) && preset !== 'nenhum') return p;
    switch (preset) {
      case 'nenhum':
        return emptyPermission(p.feature);
      case 'completo':
        return { feature: p.feature, can_view: true, can_insert: true, can_edit: true, can_delete: true };
      case 'leitura':
        return { feature: p.feature, can_view: true, can_insert: false, can_edit: false, can_delete: false };
      case 'operacional':
        return {
          feature: p.feature,
          can_view: true,
          can_insert: DAY_TO_DAY.includes(p.feature),
          can_edit: false,
          can_delete: false,
        };
      default:
        return p;
    }
  });
}

export default function PermissionMatrix({ value, onChange, disabled = false }: PermissionMatrixProps) {
  const permissions = useMemo(() => normalizePermissions(value), [value]);
  const byFeature = useMemo(() => new Map(permissions.map((p) => [p.feature, p])), [permissions]);

  const areas = useMemo(() => {
    const out: Record<string, { feature: PermissionFeature; meta: FeatureMeta }[]> = {};
    AREAS.forEach((a) => (out[a] = []));
    (Object.entries(FEATURE_LABELS) as [PermissionFeature, FeatureMeta][]).forEach(([feature, meta]) => {
      (out[meta.group] ??= []).push({ feature, meta });
    });
    return out;
  }, []);

  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(AREAS.map((a) => [a, true])));

  const replace = (feature: PermissionFeature, next: GroupPermission) => {
    onChange(permissions.map((p) => (p.feature === feature ? next : p)));
  };

  const setAction = (feature: PermissionFeature, action: PermissionAction, checked: boolean) => {
    if (disabled) return;
    replace(feature, togglePermission(byFeature.get(feature)!, action, checked));
  };

  const setArea = (area: string, checked: boolean) => {
    if (disabled) return;
    const features = new Set(areas[area].map((f) => f.feature));
    onChange(
      permissions.map((p) =>
        features.has(p.feature) && !(checked && isSensitive(p.feature))
          ? { feature: p.feature, can_view: checked, can_insert: checked, can_edit: checked, can_delete: checked }
          : p,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Atalhos:</span>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(applyPreset(permissions, p.key))}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {AREAS.map((area) => {
        const items = areas[area];
        if (!items?.length) return null;
        const withAccess = items.filter(({ feature }) => byFeature.get(feature)?.can_view).length;
        // O "Tudo" da área não liga módulo sensível — então ele também não conta para "tudo marcado".
        const regulares = items.filter(({ feature }) => !isSensitive(feature));
        const allChecked =
          regulares.length > 0 &&
          regulares.every(({ feature }) => PERMISSION_ACTIONS.every((a) => byFeature.get(feature)?.[a]));
        const someChecked = items.some(({ feature }) => PERMISSION_ACTIONS.some((a) => byFeature.get(feature)?.[a]));

        return (
          <Collapsible
            key={area}
            open={open[area]}
            onOpenChange={(o) => setOpen((prev) => ({ ...prev, [area]: o }))}
            className="rounded-lg border"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <ChevronDown
                    className={cn('size-4 shrink-0 transition-transform motion-reduce:transition-none', !open[area] && '-rotate-90')}
                    aria-hidden
                  />
                  <span className="font-semibold">{area}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {withAccess} de {items.length} com acesso
                  </span>
                </button>
              </CollapsibleTrigger>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                  disabled={disabled}
                  onCheckedChange={(c) => setArea(area, c === true)}
                  aria-label={`Tudo em ${area}`}
                />
                Tudo
              </label>
            </div>
            <CollapsibleContent>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-3">Módulo</TableHead>
                    {PERMISSION_ACTIONS.map((a) => (
                      <TableHead key={a} className="w-12 px-1 text-center sm:w-20">
                        {ACTION_LABELS[a]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(({ feature, meta }) => {
                    const perm = byFeature.get(feature)!;
                    return (
                      <TableRow key={feature} data-state={perm.can_view ? 'selected' : undefined}>
                        <TableCell className="pl-3 whitespace-normal font-medium">
                          {meta.label}
                          {isSensitive(feature) && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {SENSITIVE_FEATURE_HINT}
                            </span>
                          )}
                        </TableCell>
                        {PERMISSION_ACTIONS.map((a) => (
                          <TableCell key={a} className="px-1 text-center">
                            <Checkbox
                              checked={perm[a]}
                              disabled={disabled}
                              onCheckedChange={(c) => setAction(feature, a, c === true)}
                              aria-label={`${meta.label}: ${ACTION_LABELS[a]}`}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
