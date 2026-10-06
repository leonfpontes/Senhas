/**
 * MovimentacaoDrawer — Sheet de registro/edição de movimentação de estoque, compartilhado por
 * `/admin/estoque/itens` (ação "Movimentar" na linha, pré-preenchido) e `/admin/estoque/movimentacoes`.
 *
 *   <MovimentacaoDrawer open={open} onClose={close} items={items} initial={{ item_id }} onSaved={reload} />
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { Combobox, DateTimeField, TextField } from '@/components/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

export interface EstoqueItemRef {
  id: string;
  nome: string;
  saldo: number;
  estoque_minimo: number;
  unidade_medida: string;
}

export type TipoMovimentacao = 'entrada' | 'saida';

export interface MovimentacaoFormValues {
  item_id: string;
  tipo: TipoMovimentacao;
  quantidade: string;
  /** ISO local "YYYY-MM-DDTHH:mm". */
  data_movimentacao: string | null;
  motivo: string;
  requisitante: string;
}

export interface MovimentacaoDrawerProps {
  open: boolean;
  onClose: () => void;
  items: EstoqueItemRef[];
  /** Valores iniciais (criação pré-preenchida ou edição). */
  initial?: Partial<MovimentacaoFormValues>;
  /** Id da movimentação em edição; ausente = criação. */
  editId?: string | null;
  /** Trava o item (edição — a API não permite trocar o item). */
  lockItem?: boolean;
  onSaved?: (mode: 'create' | 'edit') => void | Promise<void>;
}

/** Agora em ISO local "YYYY-MM-DDTHH:mm" (formato do `DateTimeField`). */
export function nowLocalIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EMPTY: MovimentacaoFormValues = {
  item_id: '',
  tipo: 'entrada',
  quantidade: '',
  data_movimentacao: null,
  motivo: '',
  requisitante: '',
};

export function MovimentacaoDrawer({ open, onClose, items, initial, editId, lockItem, onSaved }: MovimentacaoDrawerProps) {
  const [form, setForm] = useState<MovimentacaoFormValues>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, data_movimentacao: nowLocalIso(), ...initial });
    setTouched({});
    setError(null);
    // `initial` é um objeto novo a cada render do pai; sincroniza só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof MovimentacaoFormValues>(k: K, v: MovimentacaoFormValues[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  const item = useMemo(() => items.find((i) => i.id === form.item_id) ?? null, [items, form.item_id]);
  const qtd = parseInt(form.quantidade, 10);
  const saldoApos = item && !Number.isNaN(qtd) ? (form.tipo === 'saida' ? item.saldo - qtd : item.saldo + qtd) : null;
  const saldoNegativo = form.tipo === 'saida' && saldoApos !== null && saldoApos < 0;

  const options = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: i.nome,
        description: `Saldo: ${i.saldo} ${i.unidade_medida}`,
      })),
    [items],
  );

  const isDirty = form.quantidade !== '' || form.motivo !== '' || form.requisitante !== '';
  const mode: 'create' | 'edit' = editId ? 'edit' : 'create';

  const handleSave = async () => {
    setTouched({ item_id: true, quantidade: true });
    if (!form.item_id || Number.isNaN(qtd) || qtd <= 0) {
      setError('Preencha o item e uma quantidade maior que zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data_movimentacao = form.data_movimentacao ? new Date(form.data_movimentacao).toISOString() : new Date().toISOString();
      const body = {
        tipo: form.tipo,
        quantidade: qtd,
        data_movimentacao,
        motivo: form.motivo.trim() || null,
        requisitante: form.requisitante.trim() || null,
      };
      if (editId) await apiClient.put(`/api/v1/admin/estoque/movimentacoes/${editId}`, body);
      else await apiClient.post('/api/v1/admin/estoque/movimentacoes', { item_id: form.item_id, ...body });
      onClose();
      await onSaved?.(mode);
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Erro ao salvar movimentação.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Editar movimentação' : 'Registrar movimentação'}
      subtitle={item ? `${item.nome} — saldo atual ${item.saldo} ${item.unidade_medida}` : 'Entrada ou saída de material'}
      icon={form.tipo === 'entrada' ? <ArrowDownToLine /> : <ArrowUpFromLine />}
      onSave={handleSave}
      saving={saving}
      saveLabel={mode === 'edit' ? 'Salvar' : 'Registrar'}
      isDirty={isDirty}
      error={error}
    >
      <div className="flex flex-col gap-4">
        <Combobox
          label="Item"
          options={options}
          value={form.item_id || null}
          onChange={(v) => set('item_id', v ?? '')}
          placeholder="Selecione o item..."
          searchPlaceholder="Buscar item..."
          required
          disabled={lockItem}
          error={touched.item_id && !form.item_id && 'Obrigatório'}
        />

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Tipo</legend>
          <ToggleGroup
            type="single"
            variant="outline"
            value={form.tipo}
            onValueChange={(v) => v && set('tipo', v as TipoMovimentacao)}
            className="grid w-full grid-cols-2"
            aria-label="Tipo de movimentação"
          >
            <ToggleGroupItem value="entrada">
              <ArrowDownToLine className="text-success" />
              Entrada
            </ToggleGroupItem>
            <ToggleGroupItem value="saida">
              <ArrowUpFromLine className="text-destructive" />
              Saída
            </ToggleGroupItem>
          </ToggleGroup>
        </fieldset>

        <TextField
          label={`Quantidade${item ? ` (${item.unidade_medida})` : ''}`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={form.quantidade}
          onChange={(e) => set('quantidade', e.target.value)}
          required
          error={touched.quantidade && (Number.isNaN(qtd) || qtd <= 0) && 'Informe uma quantidade maior que zero'}
          helperText={saldoApos !== null && !saldoNegativo ? `Saldo após a movimentação: ${saldoApos} ${item?.unidade_medida}` : undefined}
        />

        {saldoNegativo && (
          <Alert variant="warning">
            <AlertDescription>
              Esta saída deixa o saldo negativo ({saldoApos} {item?.unidade_medida}). Confira a quantidade antes de registrar.
            </AlertDescription>
          </Alert>
        )}

        <DateTimeField label="Data e hora" value={form.data_movimentacao} onChange={(v) => set('data_movimentacao', v)} />

        <TextField
          label="Requisitante"
          value={form.requisitante}
          onChange={(e) => set('requisitante', e.target.value)}
          helperText="Quem retirou ou entregou o material (opcional)"
        />
        <TextField
          label="Motivo"
          value={form.motivo}
          onChange={(e) => set('motivo', e.target.value)}
          multiline
          rows={2}
          helperText="Opcional — ex.: gira de sexta, doação recebida"
        />
      </div>
    </CrudDrawer>
  );
}

export default MovimentacaoDrawer;
