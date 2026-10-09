/**
 * Folha "Conte o motivo" da Área do Médium (AM-17, D-19) — serve ao "Não vou" (antes da
 * atividade) e à falta já registrada (depois, até o prazo da casa).
 *
 * Texto livre de até 500 letras com o aviso de que não precisa detalhar saúde (§6.8: a
 * justificativa pode ter dado de saúde; só a direção da casa vê). O erro do servidor aparece
 * dentro da folha, com a próxima ação.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MediumSheet } from '@/components/medium/mensalidade/MediumSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AVISO_SAUDE, JUSTIFICATIVA_MAX } from '@/constants/presenca';
import { mensagemDoErro } from './presencaApi';

export interface MotivoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao?: React.ReactNode;
  /** O tipo exige o motivo ("não vou") ou é a falta já registrada. */
  obrigatorio: boolean;
  botao: string;
  onEnviar: (texto: string) => Promise<void>;
}

export function MotivoSheet({
  open,
  onOpenChange,
  titulo,
  descricao,
  obrigatorio,
  botao,
  onEnviar,
}: MotivoSheetProps) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTexto('');
      setErro(null);
    }
  }, [open]);

  const vazio = texto.trim().length === 0;
  const enviar = async () => {
    if (obrigatorio && vazio) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar(texto.trim());
      onOpenChange(false);
    } catch (err) {
      setErro(mensagemDoErro(err, 'Não conseguimos enviar. Confira a internet e tente de novo.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      title={titulo}
      description={descricao}
      data-testid="motivo-sheet"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="presenca-motivo" className="text-base font-semibold">
          Conte o motivo{obrigatorio ? '' : ' (se quiser)'}
        </Label>
        <Textarea
          id="presenca-motivo"
          value={texto}
          maxLength={JUSTIFICATIVA_MAX}
          rows={4}
          onChange={(e) => setTexto(e.target.value.slice(0, JUSTIFICATIVA_MAX))}
          placeholder="Ex.: vou estar viajando a trabalho."
          className="min-h-28 text-base"
        />
        <p className="text-sm text-muted-foreground">
          {AVISO_SAUDE}{' '}
          <span className="tabular-nums">
            {texto.length}/{JUSTIFICATIVA_MAX}
          </span>
        </p>
      </div>
      {erro && (
        <p
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-strong"
          role="alert"
        >
          {erro}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          size="touch"
          className="w-full font-semibold"
          disabled={enviando || (obrigatorio && vazio)}
          onClick={() => void enviar()}
        >
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          {botao}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="w-full font-semibold"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
      </div>
    </MediumSheet>
  );
}
