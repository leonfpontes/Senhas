/**
 * AttendModal — chamar uma senha (registra médium, cambone e observações) ou editar o
 * atendimento de uma senha já atendida. Dialog do kit com Combobox para médium/cambone
 * (quando o terreiro tem médiuns cadastrados; senão campo livre).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox, TextField } from '@/components/fields';

interface MediumOption {
  id: string;
  nome: string;
}

interface AttendModalProps {
  open: boolean;
  ticketNumero: number;
  consulenteNome: string;
  onConfirm: (data: { medium_nome: string; cambone_nome?: string; atendimento_descricao?: string }) => void;
  onClose: () => void;
  loading?: boolean;
  /** Pré-preenche os campos no modo de edição. */
  initialValues?: {
    medium_nome?: string;
    cambone_nome?: string;
    atendimento_descricao?: string;
  };
  /** Editando uma senha já atendida. */
  editMode?: boolean;
  /** Médiuns de atendimento (is_atendimento=true). */
  mediumOptions?: MediumOption[];
  /** Todos os ativos (médiuns + cambones). */
  camboneOptions?: MediumOption[];
}

const OUTRO = '__outro__';

function NameField({
  label,
  required,
  options,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  label: string;
  required?: boolean;
  options: MediumOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const names = useMemo(() => Array.from(new Set(options.map((o) => o.nome))), [options]);
  const [outro, setOutro] = useState(false);

  useEffect(() => {
    // Valor que não está na lista (ex.: edição de nome antigo) → campo livre.
    setOutro(Boolean(value) && names.length > 0 && !names.includes(value));
  }, [value, names]);

  if (names.length === 0 || outro) {
    return (
      <TextField
        label={label}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        helperText={names.length > 0 ? 'Digite o nome.' : undefined}
      />
    );
  }

  return (
    <Combobox
      label={label}
      required={required}
      disabled={disabled}
      options={[...names.map((n) => ({ value: n, label: n })), { value: OUTRO, label: 'Outro nome…' }]}
      value={value || null}
      onChange={(v) => {
        if (v === OUTRO) {
          setOutro(true);
          onChange('');
        } else {
          onChange(v ?? '');
        }
      }}
      placeholder="Escolher…"
      searchPlaceholder="Buscar pelo nome…"
      clearable
    />
  );
}

export default function AttendModal({
  open,
  ticketNumero,
  consulenteNome,
  onConfirm,
  onClose,
  loading = false,
  initialValues,
  editMode = false,
  mediumOptions = [],
  camboneOptions = [],
}: AttendModalProps) {
  const [mediumNome, setMediumNome] = useState('');
  const [camboneNome, setCamboneNome] = useState('');
  const [descricao, setDescricao] = useState('');

  useEffect(() => {
    if (open) {
      setMediumNome(initialValues?.medium_nome || '');
      setCamboneNome(initialValues?.cambone_nome || '');
      setDescricao(initialValues?.atendimento_descricao || '');
    }
  }, [open, initialValues]);

  const handleConfirm = () => {
    if (!mediumNome.trim()) return;
    onConfirm({
      medium_nome: mediumNome.trim(),
      cambone_nome: camboneNome.trim() || undefined,
      atendimento_descricao: descricao.trim() || undefined,
    });
  };

  const numero = String(ticketNumero).padStart(4, '0');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="attend-modal">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Editar atendimento' : `Chamar senha ${numero}`}</DialogTitle>
          <DialogDescription>
            Senha <strong className="font-mono text-foreground">{numero}</strong> — {consulenteNome}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <NameField
            label="Médium"
            required
            options={mediumOptions}
            value={mediumNome}
            onChange={setMediumNome}
            disabled={loading}
            autoFocus
          />
          <NameField label="Cambone" options={camboneOptions} value={camboneNome} onChange={setCamboneNome} disabled={loading} />
          <TextField
            label="Observações"
            multiline
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" size="touch" onClick={handleConfirm} disabled={!mediumNome.trim() || loading}>
            {loading ? 'Salvando…' : editMode ? 'Salvar' : 'Atendido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
