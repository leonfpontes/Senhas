/**
 * AttendModal — chamar uma senha (registra médium, cambone e observações) ou editar o
 * atendimento de uma senha já atendida. Dialog do kit com Combobox para médium/cambone
 * (quando o terreiro tem médiuns cadastrados; senão campo livre).
 *
 * Duplas da noite: com `duplas`, o médium vira uma grade de cartões (nome, cambone e quantas
 * senhas já atendeu na noite). Tocar no cartão preenche médium e cambone — o cambone continua
 * editável só para esta senha. "Outro médium…" volta para o campo de antes.
 *
 * Layout: cabeçalho e botões fixos e só o meio rola, limitado à altura da tela — com uma noite
 * cheia de duplas o "Atendido" nunca sai do alcance (iPad em pé). Com duplas a janela alarga
 * para 3 colunas de cartões a partir do `sm`.
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
import { cn } from '@/lib/utils';
import {
  type AtendimentosDoMedium,
  normalizarNome,
  resumoAtendimentos,
} from '@/components/admin/porta/duplas';

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
  /** Duplas da noite (Porta): viram cartões de um toque no lugar da lista de médiuns. */
  duplas?: { medium_nome: string; cambone_nome: string | null }[];
  /** Senhas atendidas na noite por médium (nome normalizado → total e último). */
  atendimentos?: Map<string, AtendimentosDoMedium>;
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
  duplas = [],
  atendimentos,
}: AttendModalProps) {
  const [mediumNome, setMediumNome] = useState('');
  const [camboneNome, setCamboneNome] = useState('');
  const [descricao, setDescricao] = useState('');
  // Com duplas: "Outro médium…" escolhido (ou edição de uma senha com médium fora das duplas).
  const [outroMedium, setOutroMedium] = useState(false);

  const comDuplas = duplas.length > 0;
  const duplaEscolhida = comDuplas && !outroMedium
    ? duplas.find((d) => normalizarNome(d.medium_nome) === normalizarNome(mediumNome)) ?? null
    : null;

  useEffect(() => {
    if (open) {
      const medium = initialValues?.medium_nome || '';
      setMediumNome(medium);
      setCamboneNome(initialValues?.cambone_nome || '');
      setDescricao(initialValues?.atendimento_descricao || '');
      setOutroMedium(
        Boolean(medium) && !duplas.some((d) => normalizarNome(d.medium_nome) === normalizarNome(medium)),
      );
    }
    // `duplas` fica de fora: a Porta recarrega as duplas sem querer apagar o que se escolheu aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  const escolherDupla = (d: { medium_nome: string; cambone_nome: string | null }) => {
    setOutroMedium(false);
    setMediumNome(d.medium_nome);
    setCamboneNome(d.cambone_nome || '');
  };

  const escolherOutro = () => {
    setOutroMedium(true);
    setMediumNome('');
    setCamboneNome('');
  };

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
      <DialogContent
        className={cn(
          // Cabeçalho e botões fixos; só o meio rola. Com muitas duplas a janela passava da altura
          // da tela (iPad em pé) e o "Atendido" ficava fora do alcance.
          'flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]',
          comDuplas ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        data-testid="attend-modal"
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4 pr-12">
          <DialogTitle>{editMode ? 'Editar atendimento' : `Chamar senha ${numero}`}</DialogTitle>
          <DialogDescription>
            Senha <strong className="font-mono text-foreground">{numero}</strong> — {consulenteNome}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-4" data-testid="attend-modal-body">
          {comDuplas && (
            <div role="radiogroup" aria-label="Médium da noite" className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Médium</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {duplas.map((d) => {
                  const ativo = duplaEscolhida?.medium_nome === d.medium_nome;
                  return (
                    <button
                      key={d.medium_nome}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      disabled={loading}
                      onClick={() => escolherDupla(d)}
                      className={cn(
                        'flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                        ativo && 'border-brand bg-brand/10 ring-1 ring-brand',
                      )}
                      data-testid="attend-dupla"
                    >
                      <span className={cn('w-full text-sm leading-snug font-medium break-words', ativo && 'text-brand')}>{d.medium_nome}</span>
                      <span className="w-full text-xs break-words text-muted-foreground">
                        {d.cambone_nome ? `com ${d.cambone_nome}` : 'sem cambone'}
                      </span>
                      {atendimentos && (
                        <span className="w-full text-xs text-muted-foreground">
                          {resumoAtendimentos(atendimentos.get(normalizarNome(d.medium_nome)))}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={outroMedium}
                  disabled={loading}
                  onClick={escolherOutro}
                  className={cn(
                    'flex min-h-12 items-center rounded-lg border border-dashed px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                    outroMedium && 'border-brand text-brand',
                  )}
                >
                  Outro médium…
                </button>
              </div>
            </div>
          )}
          {(!comDuplas || outroMedium) && (
            <NameField
              label={comDuplas ? 'Outro médium' : 'Médium'}
              required
              options={mediumOptions}
              value={mediumNome}
              onChange={setMediumNome}
              disabled={loading}
              autoFocus
            />
          )}
          <div className="flex flex-col gap-1">
            <NameField label="Cambone" options={camboneOptions} value={camboneNome} onChange={setCamboneNome} disabled={loading} />
            {duplaEscolhida?.cambone_nome && normalizarNome(duplaEscolhida.cambone_nome) === normalizarNome(camboneNome) && (
              <span className="text-xs text-muted-foreground">Da dupla da noite. Trocar aqui vale só para esta senha.</span>
            )}
          </div>
          <TextField
            label="Observações"
            multiline
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={loading}
          />
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
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
