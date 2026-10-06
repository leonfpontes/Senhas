/**
 * WalkInModal — "Sem senha": cadastra quem chegou ao terreiro sem pegar senha pelo link
 * (ou edita esses dados). Dialog do kit, alvos de 48px (uso na Porta, em pé, no celular).
 */
import React, { useEffect, useState } from 'react';
import { PRIORITY_CATEGORY_LABELS, PRIORITY_ORDER } from 'shared-types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MaskedInput, TextField } from '@/components/fields';

interface WalkInModalProps {
  open: boolean;
  mode?: 'create' | 'edit';
  ticketNumero?: string;
  initialValues?: {
    nome?: string;
    email?: string;
    telefone?: string;
    priority_category?: string | null;
  };
  onConfirm: (data: { nome: string; email?: string; telefone?: string; priority_category: string | null }) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function WalkInModal({
  open,
  mode = 'create',
  ticketNumero,
  initialValues,
  onConfirm,
  onClose,
  loading = false,
}: WalkInModalProps) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [priorityCategory, setPriorityCategory] = useState<string>('none');

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome || '');
    setEmail(initialValues?.email || '');
    setTelefone(initialValues?.telefone || '');
    setPriorityCategory(initialValues?.priority_category || 'none');
  }, [open, initialValues]);

  const handleConfirm = () => {
    if (!nome.trim()) return;
    onConfirm({
      nome: nome.trim(),
      email: email.trim() || undefined,
      telefone: telefone.trim() || undefined,
      priority_category: priorityCategory === 'none' ? null : priorityCategory,
    });
  };

  const isEdit = mode === 'edit';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="z-[1300] sm:max-w-md" data-testid="walk-in-modal">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar sem senha' : 'Sem senha'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Atualize os dados do consulente${ticketNumero ? ` (${ticketNumero.replace(/^#/, '')})` : ''}.`
              : 'Quem chegou sem pegar senha pelo link entra na fila daqui mesmo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <TextField
            autoFocus
            label="Nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={loading}
          />
          <MaskedInput
            mask="telefone"
            label="Telefone"
            value={telefone}
            onChange={setTelefone}
            disabled={loading}
            inputMode="tel"
          />
          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <fieldset className="flex flex-col gap-2" disabled={loading}>
            <legend className="text-sm font-medium">Atendimento preferencial</legend>
            <RadioGroup value={priorityCategory} onValueChange={setPriorityCategory} className="gap-2">
              <div className="flex min-h-10 items-center gap-3">
                <RadioGroupItem value="none" id="walk-in-priority-none" />
                <Label htmlFor="walk-in-priority-none" className="font-normal">
                  Não é de grupo prioritário
                </Label>
              </div>
              {PRIORITY_ORDER.map((cat) => (
                <div key={cat} className="flex min-h-10 items-center gap-3">
                  <RadioGroupItem value={cat} id={`walk-in-priority-${cat}`} />
                  <Label htmlFor={`walk-in-priority-${cat}`} className="font-normal">
                    {PRIORITY_CATEGORY_LABELS[cat]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" size="touch" onClick={handleConfirm} disabled={!nome.trim() || loading}>
            {loading ? 'Salvando…' : isEdit ? 'Salvar' : 'Emitir senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
