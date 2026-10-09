/**
 * "Pedir troca" (AM-27) — folha da Área do Médium.
 *
 * Lista os colegas que podem ir no lugar e que aceitaram mostrar o primeiro nome (D-07), e sempre a
 * opção "Deixar a direção escolher". Se nenhum colega aceitou aparecer, só essa opção existe e a
 * folha explica por quê. Recado curto opcional (até 200 letras). Com a casa exigindo aprovação, avisa
 * que a direção ainda aprova depois que o colega aceitar.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { MediumSheet } from '@/components/medium/mensalidade/MediumSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RECADO_MAX } from '@/constants/trocas';
import { mensagemDoErro } from '@/components/medium/presenca/presencaApi';

export const DIRECAO = 'direcao';

export interface PedirTrocaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colegas: { id: string; nome: string }[];
  exigeAprovacao: boolean;
  onEnviar: (colegaId: string | null, recado: string) => Promise<void>;
}

export function PedirTrocaSheet({ open, onOpenChange, colegas, exigeAprovacao, onEnviar }: PedirTrocaSheetProps) {
  const [escolha, setEscolha] = useState<string>(DIRECAO);
  const [recado, setRecado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEscolha(colegas.length ? '' : DIRECAO);
      setRecado('');
      setErro(null);
    }
  }, [open, colegas.length]);

  const enviar = async () => {
    if (!escolha) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar(escolha === DIRECAO ? null : escolha, recado);
      onOpenChange(false);
    } catch (err) {
      setErro(mensagemDoErro(err, 'Não conseguimos enviar o pedido. Confira a internet e tente de novo.'));
    } finally {
      setEnviando(false);
    }
  };

  const opcao = (valor: string, titulo: string, ajuda?: string) => (
    <button
      key={valor}
      type="button"
      role="radio"
      aria-checked={escolha === valor}
      onClick={() => setEscolha(valor)}
      className={cn(
        'flex min-h-14 w-full flex-col items-start justify-center rounded-xl border-2 px-4 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        escolha === valor ? 'border-primary bg-primary/10' : 'border-border bg-card',
      )}
    >
      <span className="text-base font-semibold">{titulo}</span>
      {ajuda && <span className="text-sm text-muted-foreground">{ajuda}</span>}
    </button>
  );

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pedir troca"
      description="Escolha quem pode ir no seu lugar. Até a troca valer, você continua na escala."
      data-testid="pedir-troca-sheet"
    >
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Quem vai no seu lugar">
        {colegas.length > 0 ? (
          <p className="text-base font-semibold">Colegas que podem ir</p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-base text-muted-foreground">
            <Users className="mt-0.5 size-5 shrink-0" aria-hidden />
            Nenhum colega que pode ir escolheu mostrar o nome. A direção da casa escolhe quem vai no seu lugar.
          </p>
        )}
        {colegas.map((c) => opcao(c.id, c.nome))}
        {opcao(DIRECAO, 'Deixar a direção escolher', 'A direção da casa vê o pedido e escolhe quem vai.')}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="troca-recado" className="text-base font-semibold">
          Recado (se quiser)
        </Label>
        <Textarea
          id="troca-recado"
          value={recado}
          maxLength={RECADO_MAX}
          rows={2}
          onChange={(e) => setRecado(e.target.value.slice(0, RECADO_MAX))}
          placeholder="Ex.: depois eu cubro a sua."
          className="min-h-20 text-base"
        />
        <p className="text-sm text-muted-foreground">
          Não precisa contar o motivo.{' '}
          <span className="tabular-nums">
            {recado.length}/{RECADO_MAX}
          </span>
        </p>
      </div>
      {exigeAprovacao && (
        <p className="rounded-xl bg-info/10 p-3 text-sm text-info-strong">
          Nesta casa, a direção aprova a troca depois que o colega aceitar.
        </p>
      )}
      {erro && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-strong" role="alert">
          {erro}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          size="touch"
          className="w-full font-semibold"
          disabled={enviando || !escolha}
          onClick={() => void enviar()}
        >
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Enviar pedido
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
