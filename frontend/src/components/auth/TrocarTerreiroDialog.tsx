/**
 * TrocarTerreiroDialog — "Em qual terreiro você quer entrar?" fora do login (2026-10-09).
 *
 * Aberto pelo "Trocar de terreiro" do menu do painel (`AdminTopbar`) e da Área do Médium
 * (`MediumLayout`), só para quem tem conta com o mesmo e-mail em outro terreiro
 * (`useMinhasContas`). Mesmo cartão do login (`AccountCardBody`: logo, nome, "Painel do
 * terreiro"/"Área do Médium"), com cores semânticas (claro/escuro no painel; na Área vai com
 * `className="medium-terra"`). O terreiro atual aparece primeiro, "Você está aqui", sem clique.
 *
 * Conta cuja senha conferiu no login desta sessão entra direto. Conta com outra senha
 * (`precisa_senha`) abre um campo "Esta conta tem outra senha"; senha errada mostra o erro no
 * campo e a sessão atual continua (400 do backend, nunca logout). Sucesso → `completeSwitch`
 * (limpa o estado do terreiro anterior e recarrega na área certa).
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { AccountCardBody, areasHint } from '@/components/auth/AccountChoiceList';
import { PasswordField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { completeSwitch, trocarTerreiro, type MinhaConta } from '@/services/authSession';

export const SENHA_INCORRETA = 'Senha incorreta para esta conta.';
const FALHA_GERAL = 'Não foi possível trocar de terreiro agora. Confira a internet e tente de novo.';

export function areasDaConta(area: MinhaConta['area']): { admin: boolean; medium: boolean } {
  return { admin: area !== 'medium', medium: area !== 'painel' };
}

export interface TrocarTerreiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contas: ReadonlyArray<MinhaConta>;
  /** Terreiro atual (cartão "Você está aqui"). */
  atual: { nome: string; logoUrl?: string | null; hint: string };
  /** Classe extra do conteúdo (a Área passa `medium-terra`). */
  className?: string;
}

function erroDaTroca(err: unknown): { code?: string; message?: string } {
  const detail = (err as { detail?: unknown; response?: { data?: { detail?: unknown } } } | undefined)?.detail
    ?? (err as { response?: { data?: { detail?: unknown } } } | undefined)?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    const d = detail as { error_code?: unknown; message?: unknown };
    return {
      code: typeof d.error_code === 'string' ? d.error_code : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
    };
  }
  return {};
}

const CARD =
  'flex min-h-16 w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 text-left text-foreground';

export function TrocarTerreiroDialog({ open, onOpenChange, contas, atual, className }: TrocarTerreiroDialogProps) {
  const [entrandoId, setEntrandoId] = useState<string | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEntrandoId(null);
      setAbertaId(null);
      setSenha('');
      setErroSenha(null);
      setErro(null);
    }
  }, [open]);

  const entrar = async (conta: MinhaConta, comSenha?: string) => {
    setEntrandoId(conta.conta_id);
    setErro(null);
    setErroSenha(null);
    try {
      completeSwitch(await trocarTerreiro(conta.conta_id, comSenha));
    } catch (err) {
      const { code, message } = erroDaTroca(err);
      if (code === 'SENHA_INCORRETA' || code === 'SENHA_OBRIGATORIA') {
        setAbertaId(conta.conta_id);
        setErroSenha(code === 'SENHA_INCORRETA' ? SENHA_INCORRETA : message ?? 'Digite a senha desta conta.');
      } else {
        setErro(message ?? FALHA_GERAL);
      }
      setEntrandoId(null);
    }
  };

  const tocar = (conta: MinhaConta) => {
    if (conta.precisa_senha) {
      setAbertaId((id) => (id === conta.conta_id ? null : conta.conta_id));
      setSenha('');
      setErroSenha(null);
      return;
    }
    void entrar(conta);
  };

  const busy = Boolean(entrandoId);

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', className)} data-testid="trocar-terreiro-dialog">
        <DialogHeader>
          <DialogTitle>Em qual terreiro você quer entrar?</DialogTitle>
          <DialogDescription>Seu e-mail tem conta em mais de um terreiro. Troque sem sair.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-3" aria-label="Terreiros">
          <li>
            <div className={cn(CARD, 'border-primary/40 bg-primary/5')} aria-current="true" data-testid="terreiro-atual">
              <AccountCardBody nome={atual.nome} logoUrl={atual.logoUrl} hint={atual.hint} hintClassName="text-muted-foreground" />
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-brand">
                Você está aqui
              </span>
            </div>
          </li>
          {contas.map((conta) => {
            const hint = areasHint(areasDaConta(conta.area));
            const entrando = entrandoId === conta.conta_id;
            const aberta = abertaId === conta.conta_id;
            return (
              <li key={conta.conta_id} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => tocar(conta)}
                  disabled={busy}
                  aria-busy={entrando || undefined}
                  aria-expanded={conta.precisa_senha ? aberta : undefined}
                  aria-label={`${conta.terreiro} — ${hint}`}
                  className={cn(
                    CARD,
                    'outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    (entrando || aberta) && 'border-primary disabled:opacity-100',
                  )}
                >
                  <AccountCardBody nome={conta.terreiro} logoUrl={conta.logo_url} hint={hint} hintClassName="text-muted-foreground" />
                  {entrando ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
                {conta.precisa_senha && aberta && (
                  <form
                    className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (senha) void entrar(conta, senha);
                      else setErroSenha('Digite a senha desta conta.');
                    }}
                  >
                    <PasswordField
                      label="Esta conta tem outra senha"
                      helperText={erroSenha ? undefined : `Digite a senha da sua conta em ${conta.terreiro}.`}
                      value={senha}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)}
                      error={erroSenha ?? undefined}
                      autoComplete="current-password"
                      autoFocus
                      disabled={busy}
                    />
                    <Button type="submit" disabled={busy} className="self-end">
                      {entrando && <Loader2 className="animate-spin" aria-hidden />}
                      Entrar
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TrocarTerreiroDialog;
