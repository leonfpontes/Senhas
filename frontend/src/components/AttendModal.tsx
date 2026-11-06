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
 * para 3 colunas de cartões a partir do `sm`. Em tela baixa (até 600 px de altura: celular pequeno
 * ou com o teclado aberto), o título vira uma linha e os botões ficam lado a lado, para sobrar
 * espaço no meio que rola.
 *
 * Beta "Retorno do consulente na porta" (`retornoHabilitado`): no topo, os retornos que a pessoa
 * tem de giras anteriores (com "Marcar como resolvido"); embaixo, "Precisa voltar" (desmarcada)
 * para anotar com qual médium e/ou entidade ela volta e o recado.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RetornoCartao,
  type RetornoAberto,
  type RetornoMarcado,
  type RetornoPedido,
} from '@/components/admin/porta/RetornosDoConsulente';
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
  onConfirm: (data: {
    medium_nome: string;
    cambone_nome?: string;
    atendimento_descricao?: string;
    /** Beta do retorno: omitido não mexe; objeto anota; null tira. */
    retorno?: RetornoPedido | null;
  }) => void;
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
  /** Beta "Retorno do consulente na porta" ligada. */
  retornoHabilitado?: boolean;
  /** Retornos abertos desta pessoa (giras anteriores). */
  retornos?: RetornoAberto[];
  /** Retorno já anotado nesta senha (Editar atendimento). */
  retornoMarcado?: RetornoMarcado | null;
  /** Pode marcar retorno como resolvido (PORTA:edit). */
  canResolverRetorno?: boolean;
  resolvendoRetornoId?: string | null;
  onResolverRetorno?: (r: RetornoAberto) => void;
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
  retornoHabilitado = false,
  retornos = [],
  retornoMarcado = null,
  canResolverRetorno = false,
  resolvendoRetornoId = null,
  onResolverRetorno,
}: AttendModalProps) {
  const [mediumNome, setMediumNome] = useState('');
  const [camboneNome, setCamboneNome] = useState('');
  const [descricao, setDescricao] = useState('');
  // Com duplas: "Outro médium…" escolhido (ou edição de uma senha com médium fora das duplas).
  const [outroMedium, setOutroMedium] = useState(false);
  // "Precisa voltar" (beta do retorno). Começa desmarcada; no Editar, vem do retorno desta senha.
  const [precisaVoltar, setPrecisaVoltar] = useState(false);
  const [voltaMedium, setVoltaMedium] = useState('');
  const [voltaEntidade, setVoltaEntidade] = useState('');
  const [voltaRecado, setVoltaRecado] = useState('');
  const retornoResolvido = Boolean(retornoMarcado?.resolvido);

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
      const marcado = retornoMarcado && !retornoMarcado.resolvido ? retornoMarcado : null;
      setPrecisaVoltar(Boolean(marcado));
      setVoltaMedium(marcado?.medium_nome || '');
      setVoltaEntidade(marcado?.entidade || '');
      setVoltaRecado(marcado?.recado || '');
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

  const alternarPrecisaVoltar = (marcar: boolean) => {
    setPrecisaVoltar(marcar);
    // Sugere o médium deste atendimento; dá para trocar.
    if (marcar && !voltaMedium.trim()) setVoltaMedium(mediumNome.trim());
  };

  const retornoVazio = precisaVoltar && !voltaMedium.trim() && !voltaEntidade.trim() && !voltaRecado.trim();

  const handleConfirm = () => {
    if (!mediumNome.trim() || retornoVazio) return;
    const data: Parameters<AttendModalProps['onConfirm']>[0] = {
      medium_nome: mediumNome.trim(),
      cambone_nome: camboneNome.trim() || undefined,
      atendimento_descricao: descricao.trim() || undefined,
    };
    if (retornoHabilitado && !retornoResolvido) {
      if (precisaVoltar) {
        data.retorno = {
          medium_nome: voltaMedium.trim() || undefined,
          entidade: voltaEntidade.trim() || undefined,
          recado: voltaRecado.trim() || undefined,
        };
      } else if (retornoMarcado) {
        data.retorno = null;
      }
    }
    onConfirm(data);
  };

  const numero = String(ticketNumero).padStart(4, '0');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent
        className={cn(
          // Cabeçalho e botões fixos; só o meio rola. Com muitas duplas a janela passava da altura
          // da tela (iPad em pé) e o "Atendido" ficava fora do alcance.
          'gaveta-v2 flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]',
          comDuplas ? 'sm:max-w-2xl' : 'sm:max-w-md',
          // J4 v2 · 02: no celular, gaveta que sobe de baixo (GavetaInferior), ao alcance do polegar.
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[22px] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0',
        )}
        data-testid="attend-modal"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 pr-12 text-left [@media(max-height:600px)]:pt-3 [@media(max-height:600px)]:pb-1 [@media(max-height:600px)]:gap-0">
          <p aria-hidden className="text-sm font-medium text-muted-foreground">
            {editMode ? 'Editar atendimento' : 'Chamar senha'}
          </p>
          <DialogTitle className="font-display text-[1.75rem] leading-tight font-normal tracking-[-0.02em] [@media(max-height:600px)]:truncate [@media(max-height:600px)]:text-xl">
            <span className="sr-only">{editMode ? 'Editar atendimento · ' : `Chamar senha ${numero} · `}</span>
            <span className="tabular-nums">{numero}</span> {consulenteNome}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Senha {numero} — {consulenteNome}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-4" data-testid="attend-modal-body">
          {retornoHabilitado && retornos.length > 0 && (
            <section aria-label="Retorno desta pessoa" className="flex flex-col gap-2">
              <span className="text-base font-semibold">Esta pessoa tem retorno</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {retornos.map((r) => (
                  <RetornoCartao
                    key={r.id}
                    retorno={r}
                    canEdit={canResolverRetorno && !!onResolverRetorno}
                    busy={resolvendoRetornoId === r.id || loading}
                    onResolver={(x) => onResolverRetorno?.(x)}
                  />
                ))}
              </ul>
            </section>
          )}
          {comDuplas && (
            <div role="radiogroup" aria-label="Médium da noite" className="flex flex-col gap-1.5">
              <span className="text-base font-semibold">Quem atende</span>
              <div className="flex flex-col gap-2">
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
                        'flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-[10px] border px-4 py-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                        ativo && 'border-brand bg-brand/10 ring-1 ring-brand',
                      )}
                      data-testid="attend-dupla"
                    >
                      <span className={cn('w-full text-base leading-snug font-semibold break-words', ativo && 'text-brand')}>{d.medium_nome}</span>
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
                    'flex min-h-12 items-center self-start rounded-md px-0 py-1.5 text-left text-base font-semibold text-foreground underline underline-offset-4 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
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
            label="Observações (opcional)"
            multiline
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={loading}
          />
          {retornoHabilitado && (
            retornoResolvido ? (
              <p className="text-sm text-muted-foreground">O retorno anotado nesta senha já foi resolvido.</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-[10px] border p-3" data-testid="attend-retorno">
                <label className="flex min-h-10 cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={precisaVoltar}
                    onCheckedChange={(v) => alternarPrecisaVoltar(v === true)}
                    disabled={loading}
                    className="mt-0.5 size-5"
                    aria-describedby="attend-retorno-ajuda"
                  />
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">Precisa voltar</span>
                    <span id="attend-retorno-ajuda" className="text-sm text-muted-foreground">
                      A Porta mostra este recado na senha da pessoa nas próximas giras, até alguém marcar como resolvido.
                    </span>
                  </span>
                </label>
                {precisaVoltar && (
                  <>
                    <NameField
                      label="Volta com o médium"
                      options={mediumOptions}
                      value={voltaMedium}
                      onChange={setVoltaMedium}
                      disabled={loading}
                    />
                    <TextField
                      label="Com a entidade (opcional)"
                      placeholder="Ex.: Pai Joaquim, Cabocla Jurema"
                      value={voltaEntidade}
                      onChange={(e) => setVoltaEntidade(e.target.value)}
                      disabled={loading}
                      maxLength={255}
                    />
                    <TextField
                      label="Recado para a porta (opcional)"
                      multiline
                      rows={2}
                      value={voltaRecado}
                      onChange={(e) => setVoltaRecado(e.target.value)}
                      disabled={loading}
                      maxLength={1000}
                    />
                    {retornoVazio && (
                      <span className="text-sm text-warning-strong">Diga com quem a pessoa volta ou escreva o recado.</span>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-1.5 px-6 pt-3 pb-5 sm:flex-row sm:justify-end [@media(max-height:600px)]:flex-row [@media(max-height:600px)]:pt-2 [@media(max-height:600px)]:pb-3">
          <Button
            type="button"
            size="touch"
            className="h-14 w-full text-[1.0625rem] font-semibold sm:order-2 sm:w-auto [@media(max-height:600px)]:order-2 [@media(max-height:600px)]:h-12 [@media(max-height:600px)]:w-auto [@media(max-height:600px)]:flex-1"
            onClick={handleConfirm}
            disabled={!mediumNome.trim() || retornoVazio || loading}
          >
            {loading ? 'Salvando…' : editMode ? 'Salvar' : 'Atendido'}
            {!loading && !editMode && <Check aria-hidden />}
          </Button>
          <Button type="button" variant="ghost" size="touch" className="w-full text-base font-semibold sm:order-1 sm:w-auto [@media(max-height:600px)]:order-1 [@media(max-height:600px)]:w-auto" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
